import { and, eq } from 'drizzle-orm'
import { db, schema } from '@/lib/db/client'
import { audit } from '@/lib/audit/log'
import { notify } from '@/lib/notify/send'
import { inbox } from '@/lib/notify/inbox'
import { sendEmployeeEmail } from '@/lib/email/send'

/**
 * Apply a leave decision (approve/deny/reopen) + fan out notifications.
 * Shared by the API decide route and the one-click email-link flow so both
 * paths behave identically. The CALLER is responsible for authorization
 * (capability + scope + self-guard) before invoking this.
 */
export async function applyLeaveDecision(input: {
  leaveId: number
  orgId: number
  deciderUserId: number
  decision: 'approve' | 'deny' | 'reopen'
  note?: string | null
}): Promise<{ ok: boolean; status?: string; error?: string }> {
  const existing = await db.query.leaveRequests.findFirst({
    where: and(
      eq(schema.leaveRequests.id, input.leaveId),
      eq(schema.leaveRequests.orgId, input.orgId),
    ),
  })
  if (!existing) return { ok: false, error: 'leave not found' }
  if (existing.status === 'cancelled') return { ok: false, error: 'request was cancelled' }

  const newStatus =
    input.decision === 'reopen' ? 'pending' : input.decision === 'approve' ? 'approved' : 'denied'
  const note = (input.note ?? '').toString().trim().slice(0, 500)

  const [row] = await db
    .update(schema.leaveRequests)
    .set({
      status: newStatus,
      decidedAt: newStatus === 'pending' ? null : new Date(),
      decidedBy: newStatus === 'pending' ? null : input.deciderUserId,
      decidedNote: newStatus === 'pending' ? null : (note || null),
    })
    .where(and(eq(schema.leaveRequests.id, input.leaveId), eq(schema.leaveRequests.orgId, input.orgId)))
    .returning()
  if (!row) return { ok: false, error: 'leave not found' }

  void audit({
    action: 'leave.decided',
    orgId: input.orgId,
    actorUserId: input.deciderUserId,
    targetType: 'leave',
    targetId: row.id,
    payload: { from: existing.status, to: newStatus, via: 'one_click' },
  })

  if (newStatus !== 'pending') {
    const requester = await db.query.users.findFirst({ where: eq(schema.users.id, row.userId) })
    notify({
      kind: 'leave.decided',
      orgId: input.orgId,
      actorUserId: row.userId,
      userName: requester?.name ?? `@${requester?.login ?? 'unknown'}`,
      userLogin: requester?.login ?? 'unknown',
      decision: newStatus === 'approved' ? 'approved' : 'denied',
      startDate: row.startDate,
      endDate: row.endDate,
      note: note || null,
    })
    const verb = newStatus === 'approved' ? 'approved' : 'denied'
    inbox({
      userId: row.userId,
      orgId: input.orgId,
      kind: 'leave.decided',
      title: `Your leave was ${verb}`,
      body: `${row.startDate} → ${row.endDate}${note ? ` · ${note}` : ''}`,
      href: '/dashboard',
    })
    if (requester?.email) {
      sendEmployeeEmail(
        requester.email,
        `[MARINA] Your leave was ${verb}`,
        `Hi ${requester.name ?? requester.login},\n\nYour leave for ${row.startDate} to ${row.endDate} was ${verb}.${note ? `\nNote: ${note}` : ''}`,
      )
    }
  }

  return { ok: true, status: newStatus }
}
