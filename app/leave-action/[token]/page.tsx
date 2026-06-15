import Link from 'next/link'
import { eq } from 'drizzle-orm'
import { auth } from '@/auth'
import { db, schema } from '@/lib/db/client'
import { requireCapability } from '@/lib/auth/guards'
import { getVisibleScope } from '@/lib/auth/scope'
import { verifyLeaveAction } from '@/lib/leave/action-link'
import { applyLeaveDecision } from '@/lib/leave/decide'

export const dynamic = 'force-dynamic'

/**
 * One-click leave approve/deny landing page for email + notification links.
 *
 * The link carries a SIGNED token (leaveId + decision + expiry) so it can't be
 * tampered with, but the actual authorization happens here against the
 * signed-in user (capability `decide_leaves` + scope over the requester). The
 * mutation runs in a server action triggered by a Confirm button — never on
 * the GET — so email link-scanners can't auto-approve anything.
 */
export default async function LeaveActionPage({
  params,
}: {
  params: Promise<{ token: string }>
}) {
  const { token } = await params
  const payload = verifyLeaveAction(token)

  if (!payload) return <Shell title="Link expired" body="This approval link is invalid or has expired. Open MARINA to decide from the Leaves page." />

  const session = await auth()
  if (!session?.appUserId) {
    return <Shell title="Sign in first" body="Sign in to MARINA, then click the link again to act on this request." cta={{ href: '/', label: 'Sign in' }} />
  }

  const leave = await db.query.leaveRequests.findFirst({ where: eq(schema.leaveRequests.id, payload.leaveId) })
  if (!leave) return <Shell title="Request not found" body="This leave request no longer exists." />

  // Authorize: capability + scope over the requester.
  try {
    const { membership } = await requireCapability(leave.orgId, 'decide_leaves')
    const scope = await getVisibleScope(leave.orgId, {
      userId: session.appUserId,
      membershipId: membership.id,
      role: membership.role as 'admin' | 'manager' | 'lead' | 'member',
    })
    if (!scope.isAdminScope && !scope.userIds.has(leave.userId)) {
      return <Shell title="Not your call" body="This request is outside your team — only the requester's manager can decide it." />
    }
    if (leave.userId === session.appUserId) {
      return <Shell title="Conflict of interest" body="You can't decide your own leave request." />
    }
  } catch {
    return <Shell title="No permission" body="Your account isn't allowed to approve leave for this workspace." />
  }

  if (leave.status !== 'pending') {
    return <Shell title="Already decided" body={`This request is already ${leave.status}.`} cta={{ href: `/org/${leave.orgId}/leaves`, label: 'Open Leaves' }} />
  }

  const requester = await db.query.users.findFirst({ where: eq(schema.users.id, leave.userId) })
  const decisionVerb = payload.decision === 'approve' ? 'Approve' : 'Deny'

  async function confirm() {
    'use server'
    const s = await auth()
    if (!s?.appUserId) return
    // Re-verify everything inside the action (the page render is not a trust boundary).
    const p = verifyLeaveAction(token)
    if (!p) return
    const lv = await db.query.leaveRequests.findFirst({ where: eq(schema.leaveRequests.id, p.leaveId) })
    if (!lv) return
    const { membership } = await requireCapability(lv.orgId, 'decide_leaves')
    const scope = await getVisibleScope(lv.orgId, {
      userId: s.appUserId,
      membershipId: membership.id,
      role: membership.role as 'admin' | 'manager' | 'lead' | 'member',
    })
    if (!scope.isAdminScope && !scope.userIds.has(lv.userId)) return
    if (lv.userId === s.appUserId) return
    await applyLeaveDecision({
      leaveId: p.leaveId,
      orgId: lv.orgId,
      deciderUserId: s.appUserId,
      decision: p.decision,
      note: 'Decided via one-click link',
    })
    const { redirect } = await import('next/navigation')
    redirect(`/org/${lv.orgId}/leaves?decided=1`)
  }

  return (
    <Shell
      title={`${decisionVerb} this leave?`}
      body={`${requester?.name ?? requester?.login ?? 'A teammate'} requested ${leave.startDate} → ${leave.endDate}${leave.reason ? ` — "${leave.reason}"` : ''}.`}
    >
      <form action={confirm} className="mt-5 flex items-center justify-center gap-3">
        <button
          type="submit"
          className={`px-5 py-2.5 rounded-lg text-[14px] font-semibold text-white transition ${
            payload.decision === 'approve'
              ? 'bg-[var(--m-accent)] hover:bg-[var(--m-accent-2)]'
              : 'bg-[var(--m-bad)] hover:opacity-90'
          }`}
        >
          {decisionVerb} {requester?.name?.split(' ')[0] ?? 'request'}
        </button>
        <Link href={`/org/${leave.orgId}/leaves`} className="px-5 py-2.5 rounded-lg text-[14px] border border-[var(--m-border)] text-[var(--m-ink-2)]">
          Open Leaves instead
        </Link>
      </form>
    </Shell>
  )
}

function Shell({ title, body, cta, children }: { title: string; body: string; cta?: { href: string; label: string }; children?: React.ReactNode }) {
  return (
    <main className="paper min-h-screen flex items-center justify-center px-6 text-[var(--m-ink)]">
      <div className="w-full max-w-md rounded-2xl bg-white border border-[var(--m-border)] shadow-[var(--m-shadow-lg)] p-8 text-center">
        <p className="text-[11px] tracking-[0.18em] uppercase text-[var(--m-accent)] font-medium mb-2">MARINA · Leave</p>
        <h1 className="font-display text-[24px] leading-tight text-[var(--m-ink)]">{title}</h1>
        <p className="mt-2 text-[14px] text-[var(--m-ink-2)] leading-relaxed">{body}</p>
        {children}
        {cta && (
          <Link href={cta.href} className="mt-5 inline-flex px-5 py-2.5 rounded-lg bg-[var(--m-ink)] text-white text-[14px] font-medium">
            {cta.label}
          </Link>
        )}
      </div>
    </main>
  )
}
