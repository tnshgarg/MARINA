import { NextResponse } from 'next/server'
import { and, eq, isNull } from 'drizzle-orm'
import { db, schema } from '@/lib/db/client'
import { HttpError, requireMembership } from '@/lib/auth/guards'
import { audit, requestMeta } from '@/lib/audit/log'
import { notify } from '@/lib/notify/send'

export const runtime = 'nodejs'

/**
 * Manager nudge for a stagnant break — e.g. someone's been on lunch for 2h.
 * Sends a friendly check-in to Slack/email. Audit-logged.
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
    if (!row) {
      return NextResponse.json({ error: 'pause not found or already ended' }, { status: 404 })
    }
    // Can't ping yourself — the in-app notification + Slack DM would just
    // bounce back to the manager who pressed the button.
    if (row.userId === session.appUserId) {
      return NextResponse.json({ error: "You can't ping yourself." }, { status: 400 })
    }

    const target = await db.query.users.findFirst({ where: eq(schema.users.id, row.userId) })
    const me = await db.query.users.findFirst({ where: eq(schema.users.id, session.appUserId) })

    const minsSince = Math.floor((Date.now() - row.startedAt.getTime()) / 60_000)
    const friendly = `${me?.name ?? `@${session.login}`} pinged you — you've been paused for ${humanMins(minsSince)}. Everything ok?`

    void audit({
      action: 'break.checked_in',
      orgId,
      actorUserId: session.appUserId,
      targetType: 'break',
      targetId: row.id,
      payload: { reason: row.reason, category: row.category, minsSince },
      ...requestMeta(req),
    })

    void notify({
      kind: 'break.checkin',
      orgId,
      actorUserId: session.appUserId,
      targetUserId: row.userId,
      userName: target?.name ?? `@${target?.login ?? 'someone'}`,
      userLogin: target?.login ?? 'someone',
      managerName: me?.name ?? `@${session.login}`,
      reason: friendly,
    })

    return NextResponse.json({ ok: true })
  } catch (err) {
    if (err instanceof HttpError) {
      return NextResponse.json({ error: err.message }, { status: err.status })
    }
    console.error('break ping failed', err)
    return NextResponse.json({ error: 'internal' }, { status: 500 })
  }
}

function humanMins(m: number): string {
  if (m < 60) return `${m} min`
  const h = Math.floor(m / 60)
  const r = m % 60
  return r === 0 ? `${h}h` : `${h}h ${r}m`
}
