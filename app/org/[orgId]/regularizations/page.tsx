import { notFound, redirect } from 'next/navigation'
import { and, desc, eq, inArray } from 'drizzle-orm'
import { db, schema } from '@/lib/db/client'
import { HttpError, requireScope } from '@/lib/auth/guards'
import RegularizationsQueueClient from './client'

export const dynamic = 'force-dynamic'

// Manager+ guard is enforced by the parent layout (app/org/[orgId]/layout.tsx).
export default async function OrgRegularizationsPage({
  params,
}: {
  params: Promise<{ orgId: string }>
}) {
  const { orgId: raw } = await params
  const orgId = Number(raw)
  if (!Number.isInteger(orgId)) notFound()

  // Visibility scoping: admins see every member's requests; managers + leads
  // see only their reports-to chain + members of teams they manage.
  let scope
  let session
  try {
    ;({ scope, session } = await requireScope(orgId, 'manager'))
  } catch (err) {
    if (err instanceof HttpError && err.status === 401) redirect('/')
    if (err instanceof HttpError && err.status === 403) redirect('/dashboard')
    throw err
  }

  const scopeWhere = scope.isAdminScope
    ? eq(schema.attendanceRegularizations.orgId, orgId)
    : and(
        eq(schema.attendanceRegularizations.orgId, orgId),
        inArray(schema.attendanceRegularizations.userId, Array.from(scope.userIds)),
      )

  const rowsRaw = await db
    .select({ r: schema.attendanceRegularizations, u: schema.users })
    .from(schema.attendanceRegularizations)
    .innerJoin(schema.users, eq(schema.attendanceRegularizations.userId, schema.users.id))
    .where(scopeWhere)
    .orderBy(desc(schema.attendanceRegularizations.createdAt))
    .limit(200)

  const requests = rowsRaw.map((row) => ({
    id: row.r.id,
    day: row.r.day,
    requestedKind: row.r.requestedKind,
    note: row.r.note,
    status: row.r.status,
    decidedAt: row.r.decidedAt?.toISOString() ?? null,
    decidedNote: row.r.decidedNote,
    createdAt: row.r.createdAt.toISOString(),
    user: {
      id: row.u.id,
      login: row.u.login,
      name: row.u.name,
      characterKey: row.u.characterKey,
    },
  }))

  return (
    <>
      <div className="mb-5">
        <h1 className="app-h1">Attendance Regularization</h1>
        <p className="mt-1.5 text-[13px] text-[var(--m-ink-2)]">
          Review and decide attendance corrections your team submits for days that
          were auto-marked absent.
        </p>
      </div>
      <RegularizationsQueueClient
        orgId={orgId}
        currentUserId={session.appUserId}
        requests={requests}
      />
    </>
  )
}
