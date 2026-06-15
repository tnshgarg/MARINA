import { and, eq, gte, isNull } from 'drizzle-orm'
import { db, schema } from '@/lib/db/client'
import type { NewGithubEvent } from '@/lib/db/schema'
import { installationOctokit } from './app'

export type AppSyncResult = {
  installationId: number | null
  repos: number
  inserted: number
  byType: Record<string, number>
  errors: string[]
  unmatchedAuthors: string[]
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
  const installationId = (org as { githubInstallationId?: number | null } | undefined)?.githubInstallationId ?? null
  if (!installationId) {
    return { installationId: null, repos: 0, inserted: 0, byType, errors: ['No GitHub App installation for this org.'], unmatchedAuthors: [] }
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
    return { installationId, repos: 0, inserted: 0, byType, errors: [`Auth: ${(e as Error).message}`], unmatchedAuthors: [] }
  }

  // Repos the installation can see (the ones the admin selected).
  let repos: Array<{ name: string; owner: { login: string }; pushed_at?: string | null }> = []
  try {
    repos = (await octokit.paginate(octokit.apps.listReposAccessibleToInstallation, {
      per_page: 100,
    })) as never
  } catch (e) {
    errors.push(`List repos: ${(e as Error).message}`)
  }

  for (const r of repos) {
    const owner = r.owner.login
    if (r.pushed_at && new Date(r.pushed_at) < since) continue
    // Commits
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
        const repoFull = `${owner}/${r.name}`
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
    // Pull requests (opened in the window)
    try {
      const prs = await octokit.paginate(octokit.pulls.list, {
        owner,
        repo: r.name,
        state: 'all',
        sort: 'created',
        direction: 'desc',
        per_page: 100,
      })
      for (const pr of prs) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const p = pr as any
        if (new Date(p.created_at) < since) break
        const userId = matchUser(p.user?.id, p.user?.login)
        if (userId == null) continue
        events.push({
          userId,
          type: 'pr_opened',
          repo: `${owner}/${r.name}`,
          title: p.title,
          url: p.html_url,
          externalId: String(p.id),
          occurredAt: new Date(p.created_at),
          raw: { number: p.number, state: p.state, source: 'github-app' },
        })
        byType.pr_opened = (byType.pr_opened ?? 0) + 1
      }
    } catch (e) {
      errors.push(`PRs ${r.name}: ${(e as Error).message}`)
    }
  }

  // Dedupe + insert.
  let inserted = 0
  if (events.length > 0) {
    const userIds = Array.from(new Set(events.map((e) => e.userId)))
    const existing = await db
      .select({ type: schema.githubEvents.type, externalId: schema.githubEvents.externalId, userId: schema.githubEvents.userId })
      .from(schema.githubEvents)
      .where(gte(schema.githubEvents.occurredAt, since))
    const existingKeys = new Set(existing.map((r) => `${r.userId}::${r.type}::${r.externalId}`))
    void userIds
    const fresh = events.filter((e) => !existingKeys.has(`${e.userId}::${e.type}::${e.externalId}`))
    for (let i = 0; i < fresh.length; i += 50) {
      await db.insert(schema.githubEvents).values(fresh.slice(i, i + 50))
    }
    inserted = fresh.length
  }

  return { installationId, repos: repos.length, inserted, byType, errors, unmatchedAuthors: Array.from(unmatched) }
}
