import { and, eq, gte, isNull } from 'drizzle-orm'
import { db, schema } from '@/lib/db/client'
import type { NewGithubEvent } from '@/lib/db/schema'
import { installationOctokit, listAppInstallations } from './app'

export type AppSyncResult = {
  installationId: number | null
  repos: number
  inserted: number
  updated: number
  byType: Record<string, number>
  errors: string[]
  unmatchedAuthors: string[]
}

/** Derive a human PR status from a list/detail PR object. */
function prStatus(p: {
  draft?: boolean | null
  merged_at?: string | null
  state?: string | null
}): 'draft' | 'merged' | 'closed' | 'open' {
  if (p.draft) return 'draft'
  if (p.merged_at) return 'merged'
  if (p.state === 'closed') return 'closed'
  return 'open'
}

/**
 * Sync an org's activity via its GitHub App installation. This is the reliable
 * path: we authenticate as the installation (which the org admin granted access
 * to selected repos, public OR private) and read commits + PRs directly, then
 * attribute each to the MARINA user whose linked GitHub identity matches the
 * author. No per-employee repo access needed.
 */
export async function syncOrgViaApp(orgId: number, daysBack = 30): Promise<AppSyncResult> {
  const errors: string[] = []
  const byType: Record<string, number> = {}
  const unmatched = new Set<string>()

  const org = await db.query.orgs.findFirst({ where: eq(schema.orgs.id, orgId) })
  let installationId = (org as { githubInstallationId?: number | null } | undefined)?.githubInstallationId ?? null
  if (!installationId) {
    return { installationId: null, repos: 0, inserted: 0, updated: 0, byType, errors: ['No GitHub App installation for this org.'], unmatchedAuthors: [] }
  }

  // Map the org's members' GitHub identities → MARINA userId.
  const memberRows = await db
    .select({ userId: schema.users.id, githubId: schema.users.githubId, login: schema.users.login })
    .from(schema.memberships)
    .innerJoin(schema.users, eq(schema.memberships.userId, schema.users.id))
    .where(and(eq(schema.memberships.orgId, orgId), isNull(schema.memberships.endedAt)))
  const byGithubId = new Map<number, number>()
  const byLogin = new Map<string, number>()
  for (const m of memberRows) {
    if (m.githubId != null) byGithubId.set(m.githubId, m.userId)
    if (m.login) byLogin.set(m.login.toLowerCase(), m.userId)
  }
  const matchUser = (id?: number | null, login?: string | null): number | null => {
    if (id != null && byGithubId.has(id)) return byGithubId.get(id)!
    if (login && byLogin.has(login.toLowerCase())) return byLogin.get(login.toLowerCase())!
    if (login) unmatched.add(login)
    return null
  }

  const since = new Date(Date.now() - daysBack * 24 * 60 * 60 * 1000)
  const events: NewGithubEvent[] = []

  let octokit
  try {
    octokit = await installationOctokit(installationId)
  } catch (e) {
    // The stored id goes stale whenever the admin reinstalls the App (GitHub
    // mints a NEW installation id each time), and the token call 404s. Self-heal
    // when there's exactly one current installation, persisting the fresh id so
    // it doesn't break again. (Multi-install disambiguation would need the
    // account login, which we don't store yet — fall through to an error then.)
    try {
      const all = await listAppInstallations()
      if (all.length === 1 && all[0].id !== installationId) {
        const recovered = all[0].id
        await db.update(schema.orgs).set({ githubInstallationId: recovered }).where(eq(schema.orgs.id, orgId))
        installationId = recovered
        octokit = await installationOctokit(installationId)
        errors.push(`Recovered stale installation id → ${recovered}`)
      } else {
        return { installationId, repos: 0, inserted: 0, updated: 0, byType, errors: [`Auth: ${(e as Error).message}`], unmatchedAuthors: [] }
      }
    } catch {
      return { installationId, repos: 0, inserted: 0, updated: 0, byType, errors: [`Auth: ${(e as Error).message}`], unmatchedAuthors: [] }
    }
  }

  // Repos the installation can see (the ones the admin selected).
  let repos: Array<{ name: string; owner: { login: string }; pushed_at?: string | null; updated_at?: string | null }> = []
  try {
    repos = (await octokit.paginate(octokit.apps.listReposAccessibleToInstallation, {
      per_page: 100,
    })) as never
  } catch (e) {
    errors.push(`List repos: ${(e as Error).message}`)
  }

  const sinceMs = since.getTime()

  for (const r of repos) {
    const owner = r.owner.login
    const repoFull = `${owner}/${r.name}`
    // Skip repos untouched in the window. `updated_at` moves on more event kinds
    // (PRs, reviews, issues) than `pushed_at`, so use the more recent of the two.
    const lastActive = Math.max(
      r.pushed_at ? new Date(r.pushed_at).getTime() : 0,
      r.updated_at ? new Date(r.updated_at).getTime() : 0,
    )
    if (lastActive && lastActive < sinceMs) continue

    // Commits authored in the window.
    try {
      const commits = await octokit.paginate(octokit.repos.listCommits, {
        owner,
        repo: r.name,
        since: since.toISOString(),
        per_page: 100,
      })
      for (const c of commits) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const cc = c as any
        const userId = matchUser(cc.author?.id, cc.author?.login ?? cc.commit?.author?.email)
        if (userId == null) continue
        events.push({
          userId,
          type: 'commit',
          repo: repoFull,
          title: String(cc.commit?.message ?? '').split('\n')[0].slice(0, 280) || '(no message)',
          url: cc.html_url ?? `https://github.com/${repoFull}/commit/${cc.sha}`,
          externalId: cc.sha,
          occurredAt: new Date(cc.commit?.author?.date ?? cc.commit?.committer?.date ?? Date.now()),
          raw: { sha: cc.sha, source: 'github-app' },
        })
        byType.commit = (byType.commit ?? 0) + 1
      }
    } catch (e) {
      errors.push(`Commits ${r.name}: ${(e as Error).message}`)
    }

    // Pull requests touched in the window, newest-updated first. A single page
    // (100) bounds the work per repo; we stop as soon as we pass the window.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let prs: any[] = []
    try {
      const resp = await octokit.pulls.list({
        owner,
        repo: r.name,
        state: 'all',
        sort: 'updated',
        direction: 'desc',
        per_page: 100,
      })
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      prs = resp.data as any[]
    } catch (e) {
      errors.push(`PRs ${r.name}: ${(e as Error).message}`)
    }

    for (const p of prs) {
      if (p.updated_at && new Date(p.updated_at).getTime() < sinceMs) break

      // The PR itself — recorded against its author, but only when OPENED in the
      // window (so it sits on the timeline at the right time). Its status is
      // refreshed every sync via upsert, so open→merged stays live.
      if (p.created_at && new Date(p.created_at).getTime() >= sinceMs) {
        const authorId = matchUser(p.user?.id, p.user?.login)
        if (authorId != null) {
          events.push({
            userId: authorId,
            type: 'pr_opened',
            repo: repoFull,
            title: p.title ?? '(untitled PR)',
            url: p.html_url,
            externalId: String(p.id),
            occurredAt: new Date(p.created_at),
            raw: {
              number: p.number,
              status: prStatus(p),
              state: p.state,
              draft: !!p.draft,
              merged: !!p.merged_at,
              mergedAt: p.merged_at ?? null,
              requestedReviewers: Array.isArray(p.requested_reviewers) ? p.requested_reviewers.length : 0,
              source: 'github-app',
            },
          })
          byType.pr_opened = (byType.pr_opened ?? 0) + 1
        }
      }

      // Reviews on this PR, attributed to the REVIEWER (not the author). One
      // event per (reviewer, PR) carrying the latest verdict — this is what lets
      // a manager see "Aisha is reviewing Raj's work".
      try {
        const reviews = await octokit.paginate(octokit.pulls.listReviews, {
          owner,
          repo: r.name,
          pull_number: p.number,
          per_page: 100,
        })
        // Reviews arrive oldest→newest; keep the latest per reviewer in-window.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const latestByReviewer = new Map<number, any>()
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        for (const rv of reviews as any[]) {
          if (!rv.user?.id) continue
          if (p.user?.id && rv.user.id === p.user.id) continue // ignore self-review
          if (!rv.submitted_at || new Date(rv.submitted_at).getTime() < sinceMs) continue
          latestByReviewer.set(rv.user.id, rv)
        }
        for (const rv of latestByReviewer.values()) {
          const reviewerId = matchUser(rv.user?.id, rv.user?.login)
          if (reviewerId == null) continue
          events.push({
            userId: reviewerId,
            type: 'pr_reviewed',
            repo: repoFull,
            title: p.title ?? '(untitled PR)',
            url: rv.html_url ?? p.html_url,
            externalId: `rev:${p.id}:${rv.user.id}`,
            occurredAt: new Date(rv.submitted_at),
            raw: {
              number: p.number,
              prAuthor: p.user?.login ?? null,
              verdict: rv.state, // APPROVED | CHANGES_REQUESTED | COMMENTED | DISMISSED
              source: 'github-app',
            },
          })
          byType.pr_reviewed = (byType.pr_reviewed ?? 0) + 1
        }
      } catch (e) {
        errors.push(`Reviews ${r.name}#${p.number}: ${(e as Error).message}`)
      }
    }
  }

  // Insert new rows; refresh PR/review rows we've seen before (status open→merged,
  // verdict changes). Commits never change, so they're only ever inserted.
  let inserted = 0
  let updated = 0
  if (events.length > 0) {
    const existing = await db
      .select({ type: schema.githubEvents.type, externalId: schema.githubEvents.externalId, userId: schema.githubEvents.userId })
      .from(schema.githubEvents)
      .where(gte(schema.githubEvents.occurredAt, since))
    const keyOf = (e: NewGithubEvent) => `${e.userId}::${e.type}::${e.externalId}`
    const existingKeys = new Set(existing.map((r) => `${r.userId}::${r.type}::${r.externalId}`))

    const fresh = events.filter((e) => !existingKeys.has(keyOf(e)))
    const refreshable = events.filter(
      (e) => existingKeys.has(keyOf(e)) && (e.type === 'pr_opened' || e.type === 'pr_reviewed'),
    )

    for (let i = 0; i < fresh.length; i += 50) {
      await db.insert(schema.githubEvents).values(fresh.slice(i, i + 50)).onConflictDoNothing()
    }
    inserted = fresh.length

    for (const e of refreshable) {
      await db
        .insert(schema.githubEvents)
        .values(e)
        .onConflictDoUpdate({
          target: [schema.githubEvents.userId, schema.githubEvents.type, schema.githubEvents.externalId],
          set: { title: e.title, url: e.url, occurredAt: e.occurredAt, raw: e.raw },
        })
    }
    updated = refreshable.length
  }

  return { installationId, repos: repos.length, inserted, updated, byType, errors, unmatchedAuthors: Array.from(unmatched) }
}
