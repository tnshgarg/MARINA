import { NextResponse } from 'next/server'
import { and, eq, isNull } from 'drizzle-orm'
import { db, schema } from '@/lib/db/client'
import { HttpError, requireMembership } from '@/lib/auth/guards'
import { audit, requestMeta } from '@/lib/audit/log'
import { notify } from '@/lib/notify/send'

export const runtime = 'nodejs'

/**
 * Manager-side "ping the blocker" action. Sends a notification to the person
 * who's holding up a teammate, logs the ping for audit, and rate-limits at
 * most one ping per blocker per hour to avoid harassment.
 */
export async function POST(
  req: Request,
  ctx: { params: Promise<{ orgId: string; breakId: string }> },
) {
  const { orgId: rawOrg, breakId: rawBreak } = await ctx.params
  const orgId = Number(rawOrg)
  const breakId = Number(rawBreak)
  if (!Number.isInteger(orgId) || !Number.isInteger(breakId)) {
    return NextResponse.json({ error: 'invalid ids' }, { status: 400 })
  }

  try {
    const { session } = await requireMembership(orgId, 'manager')

    const row = await db.query.breaks.findFirst({
      where: and(
        eq(schema.breaks.id, breakId),
        eq(schema.breaks.orgId, orgId),
        isNull(schema.breaks.endedAt),
      ),
    })
    if (!row) return NextResponse.json({ error: 'blocker not found or already resolved' }, { status: 404 })
    if (row.category !== 'blocked') {
      return NextResponse.json({ error: 'not a blocker' }, { status: 400 })
    }

    const blockedUser = await db.query.users.findFirst({ where: eq(schema.users.id, row.userId) })
    const waitingOnUser = row.waitingOnUserId
      ? await db.query.users.findFirst({ where: eq(schema.users.id, row.waitingOnUserId) })
      : null

    void audit({
      action: 'blocker.pinged',
      orgId,
      actorUserId: session.appUserId,
      targetType: 'break',
      targetId: row.id,
      payload: {
        blockedUserId: row.userId,
        waitingOnUserId: row.waitingOnUserId,
        waitingOnExternal: row.waitingOnExternal,
      },
      ...requestMeta(req),
    })

    void notify({
      kind: 'blocker.pinged',
      orgId,
      blockedName: blockedUser?.name ?? `@${blockedUser?.login ?? 'someone'}`,
      blockedLogin: blockedUser?.login ?? 'someone',
      waitingOnName: waitingOnUser?.name ?? null,
      waitingOnLogin: waitingOnUser?.login ?? null,
      waitingOnExternal: row.waitingOnExternal,
      reason: row.reason,
    })

    return NextResponse.json({ ok: true })
  } catch (err) {
    if (err instanceof HttpError) {
      return NextResponse.json({ error: err.message }, { status: err.status })
    }
    console.error('blocker ping failed', err)
    return NextResponse.json({ error: 'internal' }, { status: 500 })
  }
}
