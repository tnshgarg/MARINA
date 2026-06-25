import { redirect } from 'next/navigation'
import { desc, eq } from 'drizzle-orm'
import { db, schema } from '@/lib/db/client'
import { HttpError, listMembershipsForCurrentUser, requireSession } from '@/lib/auth/guards'
import PersonalPageHeader from '@/components/personal-page-header'
import RegularizationsClient from './client'

export const dynamic = 'force-dynamic'

export default async function MyRegularizationsPage() {
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

  // Attendance regularization needs a manager to approve it — meaningless for a
  // solo employee with no org. Send them to their transparency page instead.
  if (memberships.length === 0) redirect('/me/data')

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
    <main className="min-h-screen min-w-0 bg-[var(--m-bg)]">
      <PersonalPageHeader
        eyebrow="Attendance fixes"
        title="Attendance Regularization"
        current="regularizations"
      />
      <div className="px-4 pt-8 pb-16 sm:px-6 max-w-[720px] mx-auto">
        <div className="mb-5">
          <p className="text-[13px] text-[var(--m-ink-3)]">
            Worked a day that shows as absent? Travelled, forgot to punch, or hit a
            system glitch? Submit a correction and your manager will review it.
          </p>
        </div>
        <RegularizationsClient orgs={orgs} requests={requests} />
      </div>
    </main>
  )
}
