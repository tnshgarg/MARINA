import { notFound, redirect } from 'next/navigation'
import { and, desc, eq, inArray } from 'drizzle-orm'
import { db, schema } from '@/lib/db/client'
import { HttpError, requireScope } from '@/lib/auth/guards'
import LeavesClient from './client'

export const dynamic = 'force-dynamic'

// Manager+ guard is enforced by the parent layout (app/org/[orgId]/layout.tsx).
export default async function LeavesPage({ params }: { params: Promise<{ orgId: string }> }) {
  const { orgId: raw } = await params
  const orgId = Number(raw)
  if (!Number.isInteger(orgId)) notFound()

  // Visibility scoping: admins see every member's leave requests; managers +
  // leads see only their reports-to chain + members of teams they manage.
  let scope
  try {
    ;({ scope } = await requireScope(orgId, 'manager'))
  } catch (err) {
    if (err instanceof HttpError && err.status === 401) redirect('/')
    if (err instanceof HttpError && err.status === 403) redirect('/dashboard')
    throw err
  }

  // Non-admins are constrained to leaves filed by people in their scope.
  const scopeWhere = scope.isAdminScope
    ? eq(schema.leaveRequests.orgId, orgId)
    : and(
        eq(schema.leaveRequests.orgId, orgId),
        inArray(schema.leaveRequests.userId, Array.from(scope.userIds)),
      )

  const rowsRaw = await db
    .select({ l: schema.leaveRequests, u: schema.users })
    .from(schema.leaveRequests)
    .innerJoin(schema.users, eq(schema.leaveRequests.userId, schema.users.id))
    .where(scopeWhere)
    .orderBy(desc(schema.leaveRequests.createdAt))
    .limit(200)

  const leaves = rowsRaw.map((r) => ({
    id: r.l.id,
    startDate: r.l.startDate,
    endDate: r.l.endDate,
    reason: r.l.reason,
    status: r.l.status,
    decidedAt: r.l.decidedAt?.toISOString() ?? null,
    decidedNote: r.l.decidedNote,
    createdAt: r.l.createdAt.toISOString(),
    user: {
      id: r.u.id,
      login: r.u.login,
      name: r.u.name,
      characterKey: r.u.characterKey,
    },
  }))

  return (
    <>
      <div className="mb-5">
        <h1 className="app-h1">Leave Requests</h1>
        <p className="mt-1.5 text-[13px] text-slate-600">
          Approve, deny, and review all leave requests across your team.
        </p>
      </div>
      <LeavesClient orgId={orgId} isManager={true} leaves={leaves} />
    </>
  )
}
