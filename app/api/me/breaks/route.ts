import { NextResponse } from 'next/server'
import { and, desc, eq, isNull } from 'drizzle-orm'
import { db, schema } from '@/lib/db/client'
import { HttpError, listMembershipsForCurrentUser, requireSession } from '@/lib/auth/guards'
import { audit, requestMeta } from '@/lib/audit/log'
import { notify } from '@/lib/notify/send'

export const runtime = 'nodejs'

const REASON_MAX = 500

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

/** Start a new break. Auto-ends any prior ongoing break (defensive). */
export async function POST(req: Request) {
  try {
    const session = await requireSession()
    const body = (await req.json().catch(() => ({}))) as { reason?: string; orgId?: number }
    const reason = (body.reason ?? '').toString().trim().slice(0, REASON_MAX)
    if (reason.length === 0) {
      return NextResponse.json({ error: 'reason required' }, { status: 400 })
    }

    // Default to the user's first org if not supplied so HR can see the break.
    let orgId: number | null = typeof body.orgId === 'number' ? body.orgId : null
    if (!orgId) {
      const memberships = await listMembershipsForCurrentUser()
      orgId = memberships[0]?.orgId ?? null
    }

    // End any existing ongoing break (one ongoing at a time).
    await db
      .update(schema.breaks)
      .set({ endedAt: new Date() })
      .where(and(eq(schema.breaks.userId, session.appUserId), isNull(schema.breaks.endedAt)))

    const [row] = await db
      .insert(schema.breaks)
      .values({
        userId: session.appUserId,
        orgId: orgId ?? undefined,
        reason,
      })
      .returning()

    if (orgId) {
      void audit({
        action: 'break.started',
        orgId,
        actorUserId: session.appUserId,
        targetType: 'break',
        targetId: row.id,
        payload: { reason },
        ...requestMeta(req),
      })
      const me = await db.query.users.findFirst({ where: eq(schema.users.id, session.appUserId) })
      void notify({
        kind: 'break.started',
        orgId,
        userName: me?.name ?? `@${session.login}`,
        userLogin: session.login,
        reason,
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
  }
}

function error(err: unknown) {
  if (err instanceof HttpError) {
    return NextResponse.json({ error: err.message }, { status: err.status })
  }
  console.error('breaks route failed', err)
  return NextResponse.json({ error: 'internal' }, { status: 500 })
}
