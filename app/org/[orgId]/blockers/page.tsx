import { notFound, redirect } from 'next/navigation'
import { and, desc, eq, gte, inArray, isNotNull, isNull } from 'drizzle-orm'
import { db, schema } from '@/lib/db/client'
import { HttpError, requireMembership } from '@/lib/auth/guards'
import BlockersClient from './client'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

/**
 * Unified Blockers view — every active blocker in the org plus the
 * just-resolved ones from the last 7 days. Designed so a manager can sit
 * down for 5 minutes once a day and clear the queue.
 */
export default async function BlockersPage({ params }: { params: Promise<{ orgId: string }> }) {
  const { orgId: raw } = await params
  const orgId = Number(raw)
  if (!Number.isInteger(orgId)) notFound()

  try {
    const { membership } = await requireMembership(orgId, 'member')
    // We expose this page to plain members too — they can see what their
    // teammates are blocked on, but the Unblock / Route actions are
    // gated server-side. Read-only access is enough for situational
    // awareness on small teams.
    void membership
  } catch (err) {
    if (err instanceof HttpError && err.status === 401) redirect('/')
    if (err instanceof HttpError && err.status === 403) redirect(`/org/${orgId}`)
    throw err
  }

  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)

  // Pull active + recently-resolved blockers in two queries, then merge.
  const [active, resolved] = await Promise.all([
    db
      .select({
        b: schema.breaks,
        u: schema.users,
      })
      .from(schema.breaks)
      .innerJoin(schema.users, eq(schema.breaks.userId, schema.users.id))
      .where(
        and(
          eq(schema.breaks.orgId, orgId),
          eq(schema.breaks.category, 'blocked'),
          isNull(schema.breaks.endedAt),
        ),
      )
      .orderBy(desc(schema.breaks.startedAt)),
    db
      .select({
        b: schema.breaks,
        u: schema.users,
      })
      .from(schema.breaks)
      .innerJoin(schema.users, eq(schema.breaks.userId, schema.users.id))
      .where(
        and(
          eq(schema.breaks.orgId, orgId),
          eq(schema.breaks.category, 'blocked'),
          isNotNull(schema.breaks.endedAt),
          gte(schema.breaks.endedAt, weekAgo),
        ),
      )
      .orderBy(desc(schema.breaks.endedAt))
      .limit(40),
  ])

  // Hydrate waitingOnUser so the card can render avatar + name.
  const waitingOnIds = Array.from(
    new Set(
      [...active, ...resolved]
        .map((r) => r.b.waitingOnUserId)
        .filter((id): id is number => id != null),
    ),
  )
  const waitingOnUsers = waitingOnIds.length
    ? await db
        .select({
          id: schema.users.id,
          login: schema.users.login,
          name: schema.users.name,
          characterKey: schema.users.characterKey,
        })
        .from(schema.users)
        .where(inArray(schema.users.id, waitingOnIds))
    : []
  const waitingOnMap = new Map(waitingOnUsers.map((u) => [u.id, u]))

  const serialise = (row: { b: typeof schema.breaks.$inferSelect; u: typeof schema.users.$inferSelect }) => ({
    id: row.b.id,
    startedAt: row.b.startedAt.toISOString(),
    endedAt: row.b.endedAt?.toISOString() ?? null,
    minutesElapsed: Math.max(
      0,
      Math.round(
        ((row.b.endedAt ?? new Date()).getTime() - row.b.startedAt.getTime()) / 60_000,
      ),
    ),
    reason: row.b.reason,
    waitingOnExternal: row.b.waitingOnExternal,
    waitingOnUser: row.b.waitingOnUserId
      ? waitingOnMap.get(row.b.waitingOnUserId) ?? null
      : null,
    resolutionType: row.b.resolutionType ?? null,
    resolutionNote: row.b.resolutionNote ?? null,
    blockedUser: {
      id: row.u.id,
      login: row.u.login,
      name: row.u.name,
      characterKey: row.u.characterKey,
    },
  })

  return (
    <BlockersClient
      orgId={orgId}
      active={active.map(serialise)}
      resolved={resolved.map(serialise)}
    />
  )
}
