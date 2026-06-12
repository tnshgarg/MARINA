import { NextResponse } from 'next/server'
import { and, eq, gt, inArray, isNull, lt } from 'drizzle-orm'
import { db, schema } from '@/lib/db/client'
import { authenticateAgent } from '@/lib/agent/auth'
import { checkLimit, rateLimitHeaders } from '@/lib/agent/rate-limit'

export const runtime = 'nodejs'

/**
 * Agent-polled feed for desktop notifications.
 *
 * GET  /api/agent/notifications
 *   → Returns the user's unread notifications since the last poll. The agent
 *     fires a native OS notification for each, then POSTs the IDs back here
 *     to mark them shown (so they don't get fired twice across daemon
 *     restarts).
 *
 * POST /api/agent/notifications
 *   body: { shownIds: number[] }
 *   → Marks those rows as `readAt = now` so the bell badge clears and the
 *     agent stops re-firing them.
 *
 * We deliberately mirror the *in-app* notifications table so a single write
 * fans out to bell + agent + email + Slack without separate plumbing per
 * channel.
 */
export async function GET(req: Request) {
  const agent = await authenticateAgent(req)
  if (!agent) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const limit = checkLimit('heartbeat', agent.token.id)
  if (!limit.ok) {
    return NextResponse.json(
      { error: 'rate limited' },
      { status: 429, headers: rateLimitHeaders(limit) },
    )
  }

  // Surface anything created in the last 24h that's still unread. Bounding
  // the window stops a long-offline agent from flooding the user with stale
  // pings the moment it comes back online.
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000)
  const rows = await db
    .select({
      id: schema.notifications.id,
      kind: schema.notifications.kind,
      title: schema.notifications.title,
      body: schema.notifications.body,
      href: schema.notifications.href,
      createdAt: schema.notifications.createdAt,
    })
    .from(schema.notifications)
    .where(
      and(
        eq(schema.notifications.userId, agent.user.id),
        isNull(schema.notifications.readAt),
        gt(schema.notifications.createdAt, since),
      ),
    )
    .orderBy(schema.notifications.createdAt)
    .limit(20)

  return NextResponse.json(
    {
      notifications: rows.map((r) => ({
        id: r.id,
        kind: r.kind,
        title: r.title,
        body: r.body,
        href: r.href,
        createdAt: r.createdAt.toISOString(),
      })),
    },
    { headers: rateLimitHeaders(limit) },
  )
}

export async function POST(req: Request) {
  const agent = await authenticateAgent(req)
  if (!agent) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const body = (await req.json().catch(() => ({}))) as { shownIds?: number[] }
  const ids = Array.isArray(body.shownIds)
    ? body.shownIds.filter((n): n is number => Number.isInteger(n))
    : []
  if (ids.length === 0) {
    return NextResponse.json({ ok: true, marked: 0 })
  }

  // Only mark rows that actually belong to this agent's user. Belt+suspenders
  // even though authenticateAgent already scopes us.
  const now = new Date()
  await db
    .update(schema.notifications)
    .set({ readAt: now })
    .where(
      and(
        eq(schema.notifications.userId, agent.user.id),
        inArray(schema.notifications.id, ids),
        isNull(schema.notifications.readAt),
      ),
    )

  // Cheap housekeeping: prune notifications older than 60 days so the table
  // doesn't grow unbounded. This is the only endpoint the agent hits with a
  // write so it's a natural place.
  void db
    .delete(schema.notifications)
    .where(lt(schema.notifications.createdAt, new Date(Date.now() - 60 * 24 * 60 * 60 * 1000)))
    .catch(() => {})

  return NextResponse.json({ ok: true, marked: ids.length })
}
