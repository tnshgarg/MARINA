import { NextResponse } from 'next/server'
import { and, eq } from 'drizzle-orm'
import { db, schema } from '@/lib/db/client'
import { HttpError, requireMembership } from '@/lib/auth/guards'
import { audit, requestMeta } from '@/lib/audit/log'
import { notify } from '@/lib/notify/send'

export const runtime = 'nodejs'

const NOTE_MAX = 500

export async function POST(
  req: Request,
  ctx: { params: Promise<{ orgId: string; leaveId: string }> }
) {
  const { orgId: orgRaw, leaveId: lidRaw } = await ctx.params
  const orgId = Number(orgRaw)
  const leaveId = Number(lidRaw)
  if (!Number.isInteger(orgId) || !Number.isInteger(leaveId)) {
    return NextResponse.json({ error: 'invalid ids' }, { status: 400 })
  }

  try {
    const { session } = await requireMembership(orgId, 'manager')
    const body = (await req.json().catch(() => ({}))) as {
      decision?: 'approve' | 'deny'
      note?: string
    }
    if (body.decision !== 'approve' && body.decision !== 'deny') {
      return NextResponse.json({ error: 'decision must be approve|deny' }, { status: 400 })
    }
    const note = (body.note ?? '').toString().trim().slice(0, NOTE_MAX)

    const [row] = await db
      .update(schema.leaveRequests)
      .set({
        status: body.decision === 'approve' ? 'approved' : 'denied',
        decidedAt: new Date(),
        decidedBy: session.appUserId,
        decidedNote: note || null,
      })
      .where(
        and(
          eq(schema.leaveRequests.id, leaveId),
          eq(schema.leaveRequests.orgId, orgId),
          eq(schema.leaveRequests.status, 'pending')
        )
      )
      .returning()

    if (!row) {
      return NextResponse.json({ error: 'leave not found or already decided' }, { status: 404 })
    }

    void audit({
      action: 'leave.decided',
      orgId,
      actorUserId: session.appUserId,
      targetType: 'leave',
      targetId: row.id,
      payload: { decision: body.decision, note: note || null },
      ...requestMeta(req),
    })

    const requester = await db.query.users.findFirst({ where: eq(schema.users.id, row.userId) })
    void notify({
      kind: 'leave.decided',
      orgId,
      userName: requester?.name ?? `@${requester?.login ?? 'unknown'}`,
      userLogin: requester?.login ?? 'unknown',
      decision: body.decision === 'approve' ? 'approved' : 'denied',
      startDate: row.startDate,
      endDate: row.endDate,
      note: note || null,
    })

    return NextResponse.json({
      ok: true,
      leave: {
        id: row.id,
        status: row.status,
        decidedAt: row.decidedAt?.toISOString() ?? null,
        decidedBy: row.decidedBy,
        decidedNote: row.decidedNote,
      },
    })
  } catch (err) {
    if (err instanceof HttpError) {
      return NextResponse.json({ error: err.message }, { status: err.status })
    }
    console.error('leave decide failed', err)
    return NextResponse.json({ error: 'internal' }, { status: 500 })
  }
}
