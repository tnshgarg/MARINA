import { NextResponse } from 'next/server'
import { and, desc, eq, isNull } from 'drizzle-orm'
import { db, schema } from '@/lib/db/client'
import { HttpError, listMembershipsForCurrentUser, requireSession } from '@/lib/auth/guards'
import { audit, requestMeta } from '@/lib/audit/log'
import { notify } from '@/lib/notify/send'
import type { BreakCategory } from '@/lib/db/schema'

export const runtime = 'nodejs'

const REASON_MAX = 500
const EXTERNAL_MAX = 120
const VALID_CATEGORIES: BreakCategory[] = ['focus', 'meeting', 'blocked', 'lunch', 'errand', 'personal', 'other']

function coerceCategory(raw: unknown): BreakCategory {
  return VALID_CATEGORIES.includes(raw as BreakCategory) ? (raw as BreakCategory) : 'other'
}

function parseExpectedEnd(raw: unknown): Date | undefined {
  if (typeof raw !== 'string' || !raw) return undefined
  const d = new Date(raw)
  if (Number.isNaN(d.getTime())) return undefined
  // Clamp: not before now, not more than 12h ahead
  const now = Date.now()
  const t = d.getTime()
  if (t < now - 60_000) return undefined
  if (t > now + 12 * 60 * 60 * 1000) return new Date(now + 12 * 60 * 60 * 1000)
  return d
}

/** Current ongoing break (if any) + recent history. */
export async function GET() {
  try {
    const session = await requireSession()
    const [active, recent] = await Promise.all([
      db.query.breaks.findFirst({
        where: and(eq(schema.breaks.userId, session.appUserId), isNull(schema.breaks.endedAt)),
      }),
      db
        .select()
        .from(schema.breaks)
        .where(eq(schema.breaks.userId, session.appUserId))
        .orderBy(desc(schema.breaks.startedAt))
        .limit(20),
    ])
    return NextResponse.json({
      ok: true,
      active: active ? serialise(active) : null,
      recent: recent.map(serialise),
    })
  } catch (err) {
    return error(err)
  }
}

/** Start a new pause. Auto-ends any prior ongoing pause (defensive). */
export async function POST(req: Request) {
  try {
    const session = await requireSession()
    const body = (await req.json().catch(() => ({}))) as {
      reason?: string
      orgId?: number
      category?: string
      waitingOnUserId?: number | null
      waitingOnExternal?: string | null
      expectedEndAt?: string | null
    }
    const reason = (body.reason ?? '').toString().trim().slice(0, REASON_MAX)
    const category = coerceCategory(body.category)
    if (reason.length === 0 && category !== 'blocked') {
      return NextResponse.json({ error: 'reason required' }, { status: 400 })
    }

    // Default to the user's first org if not supplied so HR can see the pause.
    let orgId: number | null = typeof body.orgId === 'number' ? body.orgId : null
    if (!orgId) {
      const memberships = await listMembershipsForCurrentUser()
      orgId = memberships[0]?.orgId ?? null
    }

    // Validate waitingOnUserId belongs to the same org (defence-in-depth).
    let waitingOnUserId: number | null = null
    if (category === 'blocked' && typeof body.waitingOnUserId === 'number' && orgId) {
      const peer = await db.query.memberships.findFirst({
        where: and(
          eq(schema.memberships.orgId, orgId),
          eq(schema.memberships.userId, body.waitingOnUserId),
        ),
      })
      if (peer) waitingOnUserId = body.waitingOnUserId
    }
    const waitingOnExternal =
      category === 'blocked' && typeof body.waitingOnExternal === 'string'
        ? body.waitingOnExternal.trim().slice(0, EXTERNAL_MAX) || null
        : null
    const expectedEndAt = parseExpectedEnd(body.expectedEndAt)

    // End any existing ongoing pause (one ongoing at a time).
    await db
      .update(schema.breaks)
      .set({ endedAt: new Date() })
      .where(and(eq(schema.breaks.userId, session.appUserId), isNull(schema.breaks.endedAt)))

    const [row] = await db
      .insert(schema.breaks)
      .values({
        userId: session.appUserId,
        orgId: orgId ?? undefined,
        reason: reason || `Blocked${waitingOnUserId ? ' — waiting on a teammate' : waitingOnExternal ? ` — waiting on ${waitingOnExternal}` : ''}`,
        category,
        waitingOnUserId,
        waitingOnExternal,
        expectedEndAt,
      })
      .returning()

    if (orgId) {
      void audit({
        action: 'break.started',
        orgId,
        actorUserId: session.appUserId,
        targetType: 'break',
        targetId: row.id,
        payload: { reason, category, waitingOnUserId, waitingOnExternal },
        ...requestMeta(req),
      })
      const me = await db.query.users.findFirst({ where: eq(schema.users.id, session.appUserId) })
      void notify({
        kind: 'break.started',
        orgId,
        actorUserId: session.appUserId,
        userName: me?.name ?? `@${session.login}`,
        userLogin: session.login,
        reason: row.reason,
      })
    }

    return NextResponse.json({ ok: true, break: serialise(row) })
  } catch (err) {
    return error(err)
  }
}

function serialise(b: typeof schema.breaks.$inferSelect) {
  return {
    id: b.id,
    userId: b.userId,
    orgId: b.orgId,
    startedAt: b.startedAt.toISOString(),
    endedAt: b.endedAt?.toISOString() ?? null,
    reason: b.reason,
    category: b.category,
    waitingOnUserId: b.waitingOnUserId,
    waitingOnExternal: b.waitingOnExternal,
    expectedEndAt: b.expectedEndAt?.toISOString() ?? null,
  }
}

function error(err: unknown) {
  if (err instanceof HttpError) {
    return NextResponse.json({ error: err.message }, { status: err.status })
  }
  console.error('breaks route failed', err)
  return NextResponse.json({ error: 'internal' }, { status: 500 })
}
