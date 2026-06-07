import { notFound } from 'next/navigation'
import { desc, eq } from 'drizzle-orm'
import { db, schema } from '@/lib/db/client'
import LeavesClient from './client'

export const dynamic = 'force-dynamic'

// Manager+ guard is enforced by the parent layout (app/org/[orgId]/layout.tsx).
export default async function LeavesPage({ params }: { params: Promise<{ orgId: string }> }) {
  const { orgId: raw } = await params
  const orgId = Number(raw)
  if (!Number.isInteger(orgId)) notFound()

  const rowsRaw = await db
    .select({ l: schema.leaveRequests, u: schema.users })
    .from(schema.leaveRequests)
    .innerJoin(schema.users, eq(schema.leaveRequests.userId, schema.users.id))
    .where(eq(schema.leaveRequests.orgId, orgId))
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
        <h1 className="text-[22px] font-semibold text-slate-900 tracking-tight">Leave Requests</h1>
        <p className="mt-1.5 text-[13px] text-slate-600">
          Approve, deny, and review all leave requests across your team.
        </p>
      </div>
      <LeavesClient orgId={orgId} isManager={true} leaves={leaves} />
    </>
  )
}
