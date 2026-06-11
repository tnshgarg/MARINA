import { db, schema } from '@/lib/db/client'
import { and, eq, gte } from 'drizzle-orm'
import { octokitFor } from './client'
import type { NewGithubEvent } from '@/lib/db/schema'

export type SyncResult = {
  fetched: number
  inserted: number
  byType: Record<string, number>
  errors: string[]
  windowDays: number
}

/**
 * Sync a user's GitHub activity into our `github_events` table.
 *
 * Strategy:
 * - PRs opened / reviewed / issues closed: Search API. More reliable than the
 *   Events stream and reaches further back in history.
 * - Commits: Events API (PushEvent). Search Commits API requires a preview
 *   header and has strict rate limits — Events is fine for the last 90 days.
 *
 * Idempotent: dedupes against existing rows by (userId, type, externalId).
 */
export async function syncUserActivity(
  userId: number,
  login: string,
  accessToken: string,
  daysBack = 30,
  /**
   * Lowercased GitHub org/user logins to keep. Empty/undefined = track every
   * repo (legacy behaviour). When set, events from any other org are filtered
   * out before insert so an employee's open-source contributions don't leak
   * into the workplace timeline.
   */
  trackedOrgs?: string[],
): Promise<SyncResult> {
  const since = new Date(Date.now() - daysBack * 24 * 60 * 60 * 1000)
  const sinceIso = since.toISOString().slice(0, 10)
  const octokit = octokitFor(accessToken)
  const trackedSet = trackedOrgs && trackedOrgs.length > 0
    ? new Set(trackedOrgs.map((o) => o.toLowerCase()))
    : null

  /** Returns true when the repo's owner is tracked (or filter is off). */
  const repoAllowed = (repoFullName: string): boolean => {
    if (!trackedSet) return true
    const owner = repoFullName.split('/')[0]?.toLowerCase() ?? ''
    return trackedSet.has(owner)
  }

  const events: NewGithubEvent[] = []
  const byType: Record<string, number> = {}
  const errors: string[] = []

  // PRs opened by the user
  try {
    const prs = await octokit.paginate(octokit.search.issuesAndPullRequests, {
      q: `is:pr author:${login} created:>=${sinceIso}`,
      per_page: 100,
    })
    let prKept = 0
    for (const pr of prs) {
      const repo = pr.repository_url.replace('https://api.github.com/repos/', '')
      if (!repoAllowed(repo)) continue
      events.push({
        userId,
        type: 'pr_opened',
        repo,
        title: pr.title,
        url: pr.html_url,
        externalId: String(pr.id),
        occurredAt: new Date(pr.created_at),
        raw: { number: pr.number, state: pr.state },
      })
      prKept++
    }
    byType.pr_opened = prKept
  } catch (err) {
    errors.push(`PRs opened: ${(err as Error).message}`)
  }

  // PRs the user reviewed
  try {
    const reviewed = await octokit.paginate(octokit.search.issuesAndPullRequests, {
      q: `is:pr reviewed-by:${login} -author:${login} updated:>=${sinceIso}`,
      per_page: 100,
    })
    let reviewKept = 0
    for (const pr of reviewed) {
      const repo = pr.repository_url.replace('https://api.github.com/repos/', '')
      if (!repoAllowed(repo)) continue
      events.push({
        userId,
        type: 'pr_reviewed',
        repo,
        title: `Reviewed: ${pr.title}`,
        url: pr.html_url,
        externalId: `review-${pr.id}`,
        occurredAt: new Date(pr.updated_at),
        raw: { number: pr.number, prAuthor: pr.user?.login },
      })
      reviewKept++
    }
    byType.pr_reviewed = reviewKept
  } catch (err) {
    errors.push(`PRs reviewed: ${(err as Error).message}`)
  }

  // Issues the user closed
  try {
    const issues = await octokit.paginate(octokit.search.issuesAndPullRequests, {
      q: `is:issue is:closed assignee:${login} closed:>=${sinceIso}`,
      per_page: 100,
    })
    let issueKept = 0
    for (const issue of issues) {
      const repo = issue.repository_url.replace('https://api.github.com/repos/', '')
      if (!repoAllowed(repo)) continue
      events.push({
        userId,
        type: 'issue_closed',
        repo,
        title: issue.title,
        url: issue.html_url,
        externalId: String(issue.id),
        occurredAt: new Date(issue.closed_at ?? issue.updated_at),
        raw: { number: issue.number },
      })
      issueKept++
    }
    byType.issue_closed = issueKept
  } catch (err) {
    errors.push(`Issues closed: ${(err as Error).message}`)
  }

  // Commits via PushEvent in the events stream
  try {
    const iterator = octokit.paginate.iterator(
      octokit.activity.listEventsForAuthenticatedUser,
      { username: login, per_page: 100 }
    )
    let commitCount = 0
    outer: for await (const { data } of iterator) {
      for (const e of data) {
        const createdAt = e.created_at ? new Date(e.created_at) : null
        if (!createdAt) continue
        if (createdAt < since) break outer
        if (e.type !== 'PushEvent') continue
        const repo: string = e.repo?.name ?? 'unknown'
        if (!repoAllowed(repo)) continue
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const commits = ((e.payload as any)?.commits ?? []) as Array<{ sha: string; message?: string }>
        for (const c of commits) {
          events.push({
            userId,
            type: 'commit',
            repo,
            title: (c.message ?? '').split('\n')[0].slice(0, 280) || '(no message)',
            url: `https://github.com/${repo}/commit/${c.sha}`,
            externalId: c.sha,
            occurredAt: createdAt,
            raw: { message: c.message, sha: c.sha },
          })
          commitCount++
        }
      }
    }
    byType.commit = commitCount
  } catch (err) {
    errors.push(`Commits: ${(err as Error).message}`)
  }

  // Dedupe against existing rows
  let inserted = 0
  if (events.length > 0) {
    const existing = await db
      .select({ type: schema.githubEvents.type, externalId: schema.githubEvents.externalId })
      .from(schema.githubEvents)
      .where(and(eq(schema.githubEvents.userId, userId), gte(schema.githubEvents.occurredAt, since)))
    const existingKeys = new Set(existing.map((r) => `${r.type}::${r.externalId}`))
    const fresh = events.filter((e) => !existingKeys.has(`${e.type}::${e.externalId}`))
    if (fresh.length > 0) {
      for (let i = 0; i < fresh.length; i += 50) {
        await db.insert(schema.githubEvents).values(fresh.slice(i, i + 50))
      }
      inserted = fresh.length
    }
  }

  // Stamp last sync state on the user
  await db
    .update(schema.users)
    .set({
      lastSyncedAt: new Date(),
      lastSyncError: errors.length > 0 ? errors.slice(0, 3).join(' | ').slice(0, 500) : null,
    })
    .where(eq(schema.users.id, userId))

  return {
    fetched: events.length,
    inserted,
    byType,
    errors,
    windowDays: daysBack,
  }
}
