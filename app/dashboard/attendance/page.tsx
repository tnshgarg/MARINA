import { redirect } from 'next/navigation'
import { desc, eq } from 'drizzle-orm'
import { db, schema } from '@/lib/db/client'
import { HttpError, listMembershipsForCurrentUser, requireSession } from '@/lib/auth/guards'
import RegularizationsClient from '@/app/me/regularizations/client'

export const dynamic = 'force-dynamic'

/**
 * In-shell "Attendance" — attendance regularization, rendered inside the
 * dashboard layout. Same logic as /me/regularizations (which now redirects
 * here). Regularization needs a manager to approve, so solo users have no
 * business here — bounce them to their data page.
 */
export default async function DashboardAttendancePage() {
  let session
  try {
    session = await requireSession()
  } catch (err) {
    if (err instanceof HttpError && err.status === 401) redirect('/')
    throw err
  }

  const [memberships, rows] = await Promise.all([
    listMembershipsForCurrentUser(),
    db
      .select()
      .from(schema.attendanceRegularizations)
      .where(eq(schema.attendanceRegularizations.userId, session.appUserId))
      .orderBy(desc(schema.attendanceRegularizations.createdAt))
      .limit(60),
  ])

  if (memberships.length === 0) redirect('/dashboard/data')

  const orgs = memberships.map((m) => ({ id: m.orgId, name: m.org.name }))
  const requests = rows.map((r) => ({
    id: r.id,
    orgId: r.orgId,
    day: r.day,
    requestedKind: r.requestedKind,
    note: r.note,
    status: r.status,
    decidedAt: r.decidedAt?.toISOString() ?? null,
    decidedNote: r.decidedNote,
    createdAt: r.createdAt.toISOString(),
  }))

  return (
    <div className="px-4 pt-4 pb-10 sm:px-8 sm:pt-7 max-w-[720px] mx-auto fade-in">
      <div className="mb-5">
        <p className="app-eyebrow">Attendance fixes</p>
        <h1 className="app-h1 text-[22px] sm:text-[26px] mt-0.5">Attendance Regularization</h1>
        <p className="mt-2 text-[13px] text-[var(--m-ink-3)]">
          Worked a day that shows as absent? Travelled, forgot to punch, or hit a system glitch? Submit a correction and
          your manager will review it.
        </p>
      </div>
      <RegularizationsClient orgs={orgs} requests={requests} />
    </div>
  )
}
