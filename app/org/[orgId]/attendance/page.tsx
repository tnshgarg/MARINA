import { notFound } from 'next/navigation'
import { and, desc, eq, gte, inArray, isNull, lte } from 'drizzle-orm'
import { db, schema } from '@/lib/db/client'
import { PeopleTabs } from '@/components/org-tabs'
import AttendanceClient from './client'

export const dynamic = 'force-dynamic'

/**
 * Manager-facing monthly attendance view. Status per (employee, day) is
 * computed on the fly — no separate attendance table to keep in sync.
 *
 * Resolution order (first match wins):
 *  1. Future day → "future"
 *  2. Approved leave covering that day → "leave"
 *  3. Holiday → "holiday"
 *  4. Had any shift that day → "present"
 *  5. Weekend (Sat/Sun)        → "weekend"
 *  6. Otherwise → "absent"
 */
export default async function AttendancePage({
  params,
  searchParams,
}: {
  params: Promise<{ orgId: string }>
  searchParams: Promise<{ month?: string; member?: string }>
}) {
  const { orgId: raw } = await params
  const sp = await searchParams
  const orgId = Number(raw)
  if (!Number.isInteger(orgId)) notFound()

  // Resolve the month being viewed (YYYY-MM). Defaults to current month.
  const now = new Date()
  const monthStr = parseMonth(sp.month) ?? `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  const [yy, mm] = monthStr.split('-').map(Number) as [number, number]
  const monthStart = new Date(Date.UTC(yy, mm - 1, 1))
  const monthEnd = new Date(Date.UTC(yy, mm, 0, 23, 59, 59, 999))

  // Fetch members for the picker.
  const memberRows = await db
    .select({
      userId: schema.memberships.userId,
      login: schema.users.login,
      name: schema.users.name,
      characterKey: schema.users.characterKey,
    })
    .from(schema.memberships)
    .innerJoin(schema.users, eq(schema.memberships.userId, schema.users.id))
    .where(and(eq(schema.memberships.orgId, orgId), isNull(schema.memberships.endedAt)))
    .orderBy(desc(schema.memberships.createdAt))

  const memberByUserId = new Map(memberRows.map((m) => [m.userId, m]))
  const userIds = memberRows.map((m) => m.userId)

  // The selected employee. If none, default to the first one.
  const selectedUserId =
    sp.member && Number.isInteger(Number(sp.member)) && memberByUserId.has(Number(sp.member))
      ? Number(sp.member)
      : memberRows[0]?.userId ?? null

  // Pull data only for the selected employee (single-employee detail view).
  let shifts: (typeof schema.shifts.$inferSelect)[] = []
  let leaves: (typeof schema.leaveRequests.$inferSelect)[] = []
  if (selectedUserId) {
    ;[shifts, leaves] = await Promise.all([
      db
        .select()
        .from(schema.shifts)
        .where(
          and(
            eq(schema.shifts.userId, selectedUserId),
            gte(schema.shifts.punchedInAt, monthStart),
            lte(schema.shifts.punchedInAt, monthEnd),
          ),
        ),
      db
        .select()
        .from(schema.leaveRequests)
        .where(
          and(
            eq(schema.leaveRequests.userId, selectedUserId),
            eq(schema.leaveRequests.orgId, orgId),
          ),
        ),
    ])
  }

  // Org holidays for this month
  const holidays = userIds.length
    ? await db
        .select()
        .from(schema.holidays)
        .where(
          and(
            eq(schema.holidays.orgId, orgId),
            gte(schema.holidays.date, isoDay(monthStart)),
            lte(schema.holidays.date, isoDay(monthEnd)),
          ),
        )
    : []

  return (
    <>
      <div className="mb-4">
        <h1 className="text-[22px] font-semibold text-slate-900 tracking-tight">People</h1>
        <p className="mt-1.5 text-[13px] text-slate-600">
          Monthly attendance, computed from shifts and approved leaves. Click any day for the reason.
        </p>
      </div>
      <PeopleTabs orgId={orgId} />

      <AttendanceClient
        orgId={orgId}
        month={monthStr}
        members={memberRows.map((m) => ({
          userId: m.userId,
          login: m.login,
          name: m.name,
          characterKey: m.characterKey,
        }))}
        selectedUserId={selectedUserId}
        shifts={shifts.map((s) => ({
          id: s.id,
          punchedInAt: s.punchedInAt.toISOString(),
          punchedOutAt: s.punchedOutAt?.toISOString() ?? null,
        }))}
        leaves={leaves.map((l) => ({
          id: l.id,
          startDate: l.startDate,
          endDate: l.endDate,
          leaveType: l.leaveType,
          reason: l.reason,
          status: l.status,
        }))}
        holidays={holidays.map((h) => ({
          date: h.date,
          name: h.name,
          isOptional: h.isOptional,
        }))}
      />
    </>
  )
}

function parseMonth(s: string | undefined): string | null {
  if (!s) return null
  const m = s.match(/^(\d{4})-(\d{2})$/)
  if (!m) return null
  const y = Number(m[1])
  const mo = Number(m[2])
  if (y < 2000 || y > 2100 || mo < 1 || mo > 12) return null
  return `${m[1]}-${m[2]}`
}

function isoDay(d: Date): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`
}
