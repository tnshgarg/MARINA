import { NextResponse } from 'next/server'
import { and, eq } from 'drizzle-orm'
import { db, schema } from '@/lib/db/client'
import { HttpError, requireMembership } from '@/lib/auth/guards'
import { audit, requestMeta } from '@/lib/audit/log'
import { notify } from '@/lib/notify/send'
import { inbox } from '@/lib/notify/inbox'
import { sendEmployeeEmail } from '@/lib/email/send'

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
      decision?: 'approve' | 'deny' | 'reopen'
      note?: string
    }
    if (body.decision !== 'approve' && body.decision !== 'deny' && body.decision !== 'reopen') {
      return NextResponse.json({ error: 'decision must be approve|deny|reopen' }, { status: 400 })
    }
    const note = (body.note ?? '').toString().trim().slice(0, NOTE_MAX)

    // Look up the current row so we can detect changes (and write a precise audit log).
    const existing = await db.query.leaveRequests.findFirst({
      where: and(
        eq(schema.leaveRequests.id, leaveId),
        eq(schema.leaveRequests.orgId, orgId),
      ),
    })
    if (!existing) {
      return NextResponse.json({ error: 'leave not found' }, { status: 404 })
    }
    if (existing.status === 'cancelled') {
      return NextResponse.json(
        { error: 'cannot decide a cancelled request — ask the employee to resubmit' },
        { status: 400 },
      )
    }

    const newStatus =
      body.decision === 'reopen'
        ? 'pending'
        : body.decision === 'approve'
          ? 'approved'
          : 'denied'

    // No-op short circuit
    if (existing.status === newStatus && (existing.decidedNote ?? null) === (note || null)) {
      return NextResponse.json({
        ok: true,
        leave: serialise(existing),
        changed: false,
      })
    }

    const [row] = await db
      .update(schema.leaveRequests)
      .set({
        status: newStatus,
        decidedAt: newStatus === 'pending' ? null : new Date(),
        decidedBy: newStatus === 'pending' ? null : session.appUserId,
        decidedNote: newStatus === 'pending' ? null : (note || null),
      })
      .where(
        and(
          eq(schema.leaveRequests.id, leaveId),
          eq(schema.leaveRequests.orgId, orgId),
        ),
      )
      .returning()

    if (!row) {
      return NextResponse.json({ error: 'leave not found' }, { status: 404 })
    }

    void audit({
      action: 'leave.decided',
      orgId,
      actorUserId: session.appUserId,
      targetType: 'leave',
      targetId: row.id,
      payload: {
        from: existing.status,
        to: newStatus,
        decision: body.decision,
        note: note || null,
      },
      ...requestMeta(req),
    })

    if (newStatus !== 'pending') {
      const requester = await db.query.users.findFirst({ where: eq(schema.users.id, row.userId) })
      notify({
        kind: 'leave.decided',
        orgId,
        userName: requester?.name ?? `@${requester?.login ?? 'unknown'}`,
        userLogin: requester?.login ?? 'unknown',
        decision: newStatus === 'approved' ? 'approved' : 'denied',
        startDate: row.startDate,
        endDate: row.endDate,
        note: note || null,
      })

      // The employee — not just the manager — should know about their own leave.
      const verb = newStatus === 'approved' ? 'approved' : 'denied'
      inbox({
        userId: row.userId,
        orgId,
        kind: 'leave.decided',
        title: `Your leave was ${verb}`,
        body: `${row.startDate} → ${row.endDate}${note ? ` · ${note}` : ''}`,
        href: `/dashboard`,
      })
      if (requester?.email) {
        sendEmployeeEmail(
          requester.email,
          `[MARINA] Your leave was ${verb}`,
          [
            `Hi ${requester.name ?? requester.login},`,
            ``,
            `Your leave request for ${row.startDate} to ${row.endDate} was ${verb}.`,
            note ? `Manager note: ${note}` : null,
            ``,
            `Open MARINA: ${process.env.NEXT_PUBLIC_APP_URL ?? ''}/dashboard`,
          ]
            .filter(Boolean)
            .join('\n'),
        )
      }
    }

    return NextResponse.json({
      ok: true,
      leave: serialise(row),
      changed: true,
    })
  } catch (err) {
    if (err instanceof HttpError) {
      return NextResponse.json({ error: err.message }, { status: err.status })
    }
    console.error('leave decide failed', err)
    return NextResponse.json({ error: 'internal' }, { status: 500 })
  }
}

function serialise(row: typeof schema.leaveRequests.$inferSelect) {
  return {
    id: row.id,
    status: row.status,
    decidedAt: row.decidedAt?.toISOString() ?? null,
    decidedBy: row.decidedBy,
    decidedNote: row.decidedNote,
  }
}
