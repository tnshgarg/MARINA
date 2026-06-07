import { NextResponse } from 'next/server'
import { and, eq, isNull } from 'drizzle-orm'
import { db, schema } from '@/lib/db/client'
import { HttpError, listMembershipsForCurrentUser, requireSession } from '@/lib/auth/guards'
import { audit, requestMeta } from '@/lib/audit/log'

export const runtime = 'nodejs'

/** Web-side punch in (also used by the agent through this same path via the auth bridge). */
export async function POST(req: Request) {
  try {
    const session = await requireSession()
    const memberships = await listMembershipsForCurrentUser()
    const orgId = memberships[0]?.orgId ?? null

    // Already punched in? Return that.
    const existing = await db.query.shifts.findFirst({
      where: and(eq(schema.shifts.userId, session.appUserId), isNull(schema.shifts.punchedOutAt)),
    })
    if (existing) {
      return NextResponse.json({
        ok: true,
        alreadyOpen: true,
        shift: serialise(existing),
      })
    }

    const [row] = await db
      .insert(schema.shifts)
      .values({
        userId: session.appUserId,
        orgId: orgId ?? undefined,
        punchedInVia: 'web',
      })
      .returning()

    void audit({
      action: 'shift.punch_in',
      orgId,
      actorUserId: session.appUserId,
      targetType: 'shift',
      targetId: row.id,
      payload: { via: 'web' },
      ...requestMeta(req),
    })

    return NextResponse.json({ ok: true, shift: serialise(row) })
  } catch (err) {
    if (err instanceof HttpError) {
      return NextResponse.json({ error: err.message }, { status: err.status })
    }
    console.error('shift in failed', err)
    return NextResponse.json({ error: 'internal' }, { status: 500 })
  }
}

function serialise(s: typeof schema.shifts.$inferSelect) {
  return {
    id: s.id,
    punchedInAt: s.punchedInAt.toISOString(),
    punchedOutAt: s.punchedOutAt?.toISOString() ?? null,
    workSummary: s.workSummary,
    verificationStatus: s.verificationStatus,
    verificationScore: s.verificationScore,
  }
}
