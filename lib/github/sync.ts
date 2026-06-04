import { db, schema } from '@/lib/db/client'
import { and, eq, gte } from 'drizzle-orm'
import { octokitFor } from './client'
import type { NewGithubEvent } from '@/lib/db/schema'

export type SyncResult = {
  fetched: number
  inserted: number
  byType: Record<string, number>
}

export async function syncUserActivity(
  userId: number,
  login: string,
  accessToken: string,
  daysBack = 7
): Promise<SyncResult> {
  const since = new Date(Date.now() - daysBack * 24 * 60 * 60 * 1000)
  const octokit = octokitFor(accessToken)

  // Public events for the user. Includes own private events when authenticated as that user.
  const events: Array<NewGithubEvent> = []
  const byType: Record<string, number> = {}

  // listEventsForAuthenticatedUser returns the broader stream (public + private).
  const iterator = octokit.paginate.iterator(
    octokit.activity.listEventsForAuthenticatedUser,
    { username: login, per_page: 100 }
  )

  outer: for await (const { data } of iterator) {
    for (const e of data) {
      const createdAt = e.created_at ? new Date(e.created_at) : null
      if (!createdAt || createdAt < since) break outer
      const mapped = mapEvent(e, userId)
      for (const m of mapped) {
        events.push(m)
        byType[m.type] = (byType[m.type] ?? 0) + 1
      }
    }
  }

  if (events.length === 0) {
    return { fetched: 0, inserted: 0, byType }
  }

  // Dedup against existing rows for this user since `since`.
  const existing = await db
    .select({ type: schema.githubEvents.type, externalId: schema.githubEvents.externalId })
    .from(schema.githubEvents)
    .where(and(eq(schema.githubEvents.userId, userId), gte(schema.githubEvents.occurredAt, since)))
  const existingKeys = new Set(existing.map((r) => `${r.type}::${r.externalId}`))

  const fresh = events.filter((e) => !existingKeys.has(`${e.type}::${e.externalId}`))
  if (fresh.length === 0) {
    return { fetched: events.length, inserted: 0, byType }
  }

  await db.insert(schema.githubEvents).values(fresh)
  return { fetched: events.length, inserted: fresh.length, byType }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapEvent(e: any, userId: number): NewGithubEvent[] {
  const repo: string = e.repo?.name ?? 'unknown'
  const occurredAt = new Date(e.created_at)
  const out: NewGithubEvent[] = []

  switch (e.type) {
    case 'PushEvent': {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const commits = (e.payload?.commits ?? []) as Array<any>
      for (const c of commits) {
        const sha: string = c.sha
        out.push({
          userId,
          type: 'commit',
          repo,
          title: (c.message ?? '').split('\n')[0].slice(0, 280),
          url: `https://github.com/${repo}/commit/${sha}`,
          externalId: sha,
          occurredAt,
          raw: { message: c.message, sha },
        })
      }
      break
    }
    case 'PullRequestEvent': {
      const action: string = e.payload?.action
      const pr = e.payload?.pull_request
      if (action === 'opened' && pr) {
        out.push({
          userId,
          type: 'pr_opened',
          repo,
          title: pr.title ?? '(no title)',
          url: pr.html_url ?? `https://github.com/${repo}`,
          externalId: String(pr.id ?? pr.number),
          occurredAt,
          raw: { number: pr.number, title: pr.title },
        })
      }
      break
    }
    case 'PullRequestReviewEvent': {
      const pr = e.payload?.pull_request
      const review = e.payload?.review
      if (pr && review) {
        out.push({
          userId,
          type: 'pr_reviewed',
          repo,
          title: `Review on: ${pr.title ?? '(no title)'}`,
          url: review.html_url ?? pr.html_url,
          externalId: String(review.id),
          occurredAt,
          raw: { state: review.state, prNumber: pr.number },
        })
      }
      break
    }
    case 'IssuesEvent': {
      const action: string = e.payload?.action
      const issue = e.payload?.issue
      if (action === 'closed' && issue) {
        out.push({
          userId,
          type: 'issue_closed',
          repo,
          title: issue.title ?? '(no title)',
          url: issue.html_url ?? `https://github.com/${repo}`,
          externalId: String(issue.id),
          occurredAt,
          raw: { number: issue.number },
        })
      }
      break
    }
  }
  return out
}
