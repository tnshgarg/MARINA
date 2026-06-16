import { notFound, redirect } from 'next/navigation'
import { and, asc, eq, gte, inArray } from 'drizzle-orm'
import { db, schema } from '@/lib/db/client'
import { HttpError, requireScope } from '@/lib/auth/guards'
import { LEAVE_TYPE_LABELS, type LeaveType } from '@/lib/db/schema'
import { CharacterAvatar } from '@/components/character-avatar'

export const dynamic = 'force-dynamic'

const DAY = 86_400_000

type Leave = {
  id: number
  startDate: string // YYYY-MM-DD, inclusive
  endDate: string // YYYY-MM-DD, inclusive
  leaveType: LeaveType
  status: 'pending' | 'approved' | 'denied' | 'cancelled'
  user: { id: number; name: string | null; login: string; avatarUrl: string | null; characterKey: string | null }
}

/** Parse a YYYY-MM-DD date string to a UTC midnight epoch (timezone-safe). */
function dayEpoch(d: string): number {
  return Date.parse(d + 'T00:00:00Z')
}

/** Inclusive day count between two YYYY-MM-DD strings. */
function dayCount(start: string, end: string): number {
  return Math.max(1, Math.round((dayEpoch(end) - dayEpoch(start)) / DAY) + 1)
}

/** ISO week key (YYYY-Www) so we can group leaves by the week they start in. */
function weekKey(epoch: number): string {
  // Thursday-based ISO week. Shift to the Thursday of the current week.
  const d = new Date(epoch)
  const day = (d.getUTCDay() + 6) % 7 // Mon=0..Sun=6
  const thursday = epoch - day * DAY + 3 * DAY
  const t = new Date(thursday)
  const year = t.getUTCFullYear()
  const jan1 = Date.UTC(year, 0, 1)
  const week = Math.floor((thursday - jan1) / DAY / 7) + 1
  return `${year}-W${String(week).padStart(2, '0')}`
}

/** Human label for the Monday that starts the week containing `epoch`. */
function weekLabel(epoch: number): string {
  const d = new Date(epoch)
  const day = (d.getUTCDay() + 6) % 7 // Mon=0..Sun=6
  const monday = new Date(epoch - day * DAY)
  const sunday = new Date(monday.getTime() + 6 * DAY)
  const fmt = (x: Date) =>
    x.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })
  return `${fmt(monday)} – ${fmt(sunday)}`
}

function fmtRange(start: string, end: string): string {
  const opts: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric', timeZone: 'UTC' }
  const s = new Date(dayEpoch(start)).toLocaleDateString('en-US', opts)
  if (start === end) return s
  const e = new Date(dayEpoch(end)).toLocaleDateString('en-US', opts)
  return `${s} – ${e}`
}

// Manager+ guard is enforced by the parent layout; we still call requireScope
// here so direct navigation is safe and to obtain the visibility scope set.
export default async function CoveragePage({ params }: { params: Promise<{ orgId: string }> }) {
  const { orgId: raw } = await params
  const orgId = Number(raw)
  if (!Number.isInteger(orgId)) notFound()

  // Visibility scoping: admins see every member's leave; managers + leads see
  // only their reports-to chain + members of teams they manage.
  let scope
  try {
    ;({ scope } = await requireScope(orgId, 'manager'))
  } catch (err) {
    if (err instanceof HttpError && err.status === 401) redirect('/')
    if (err instanceof HttpError && err.status === 403) redirect('/dashboard')
    throw err
  }

  const today = new Date(Date.now()).toISOString().slice(0, 10)

  // Forward-looking: approved + pending leaves whose window hasn't ended yet,
  // scoped to the viewer's people. Admins are not constrained by userIds; a
  // non-admin with an empty scope can have no rows, so we skip the query.
  const scopeIds = Array.from(scope.userIds)
  const baseWhere = and(
    eq(schema.leaveRequests.orgId, orgId),
    inArray(schema.leaveRequests.status, ['approved', 'pending']),
    gte(schema.leaveRequests.endDate, today),
  )
  const where = scope.isAdminScope
    ? baseWhere
    : and(baseWhere, inArray(schema.leaveRequests.userId, scopeIds))

  const rowsRaw =
    !scope.isAdminScope && scopeIds.length === 0
      ? []
      : await db
          .select({ l: schema.leaveRequests, u: schema.users })
          .from(schema.leaveRequests)
          .innerJoin(schema.users, eq(schema.leaveRequests.userId, schema.users.id))
          .where(where)
          .orderBy(asc(schema.leaveRequests.startDate))
          .limit(300)

  const leaves: Leave[] = rowsRaw.map((r) => ({
    id: r.l.id,
    startDate: r.l.startDate,
    endDate: r.l.endDate,
    leaveType: r.l.leaveType,
    status: r.l.status,
    user: {
      id: r.u.id,
      name: r.u.name,
      login: r.u.login,
      avatarUrl: r.u.avatarUrl,
      characterKey: r.u.characterKey,
    },
  }))

  // --- Overlap detection -------------------------------------------------
  // A day "overlaps" when 2+ distinct people are out on it. We sweep each
  // leave's day range (clamped to today..+~60d to bound the loop) and count
  // distinct users per day, then mark any leave that touches an overlap day.
  const todayEpoch = dayEpoch(today)
  const horizonEpoch = todayEpoch + 60 * DAY
  const usersByDay = new Map<number, Set<number>>()
  for (const l of leaves) {
    let cur = Math.max(dayEpoch(l.startDate), todayEpoch)
    const end = Math.min(dayEpoch(l.endDate), horizonEpoch)
    for (; cur <= end; cur += DAY) {
      const set = usersByDay.get(cur) ?? new Set<number>()
      set.add(l.user.id)
      usersByDay.set(cur, set)
    }
  }
  const overlapDays = new Set<number>()
  for (const [day, users] of usersByDay) {
    if (users.size >= 2) overlapDays.add(day)
  }
  const leaveHasOverlap = (l: Leave): boolean => {
    let cur = Math.max(dayEpoch(l.startDate), todayEpoch)
    const end = Math.min(dayEpoch(l.endDate), horizonEpoch)
    for (; cur <= end; cur += DAY) {
      if (overlapDays.has(cur)) return true
    }
    return false
  }

  // --- Group by the week each leave starts in ----------------------------
  const groups = new Map<string, { label: string; sort: number; items: Leave[] }>()
  for (const l of leaves) {
    const startEpoch = Math.max(dayEpoch(l.startDate), todayEpoch)
    const key = weekKey(startEpoch)
    const g = groups.get(key) ?? { label: weekLabel(startEpoch), sort: startEpoch, items: [] }
    g.items.push(l)
    groups.set(key, g)
  }
  const orderedGroups = Array.from(groups.values()).sort((a, b) => a.sort - b.sort)

  const peopleOut = new Set(leaves.map((l) => l.user.id)).size
  const overlapCount = overlapDays.size

  return (
    <>
      <div className="mb-5 flex items-end justify-between gap-4 flex-wrap">
        <div>
          <h1 className="app-h1">Leave Coverage</h1>
          <p className="mt-1.5 text-[13px] text-[var(--m-ink-2)]">
            Who&apos;s out over the next stretch — and where absences overlap.
          </p>
        </div>
        {leaves.length > 0 && (
          <div className="flex items-center gap-2 text-[11.5px]">
            <span className="pill pill-slate">
              {peopleOut} {peopleOut === 1 ? 'person' : 'people'} out
            </span>
            {overlapCount > 0 && (
              <span className="pill pill-warn">
                {overlapCount} overlap {overlapCount === 1 ? 'day' : 'days'}
              </span>
            )}
          </div>
        )}
      </div>

      {leaves.length === 0 ? (
        <div className="app-card app-card-lg">
          <div className="py-10 text-center">
            <h2 className="text-[15px] font-semibold text-[var(--m-ink)]">All clear</h2>
            <p className="mt-1.5 text-[12.5px] text-[var(--m-ink-2)]">No upcoming time off for your team.</p>
          </div>
        </div>
      ) : (
        <div className="space-y-5">
          {orderedGroups.map((g) => (
            <section key={g.label} className="app-card overflow-hidden">
              <div className="px-5 py-3 border-b border-[var(--m-border-soft)] flex items-center justify-between">
                <h2 className="text-[12.5px] font-semibold text-[var(--m-ink-2)]">{g.label}</h2>
                <span className="text-[11px] text-[var(--m-ink-3)]">
                  {g.items.length} {g.items.length === 1 ? 'leave' : 'leaves'}
                </span>
              </div>
              <ul className="divide-y divide-[var(--m-border-soft)]">
                {g.items.map((l) => {
                  const overlap = leaveHasOverlap(l)
                  return (
                    <li
                      key={l.id}
                      className="px-5 py-3 flex items-center gap-3 hover:bg-[var(--m-bg-soft)]/60 transition-colors"
                    >
                      <CharacterAvatar
                        characterKey={l.user.characterKey}
                        imageUrl={l.user.avatarUrl}
                        name={l.user.name}
                        login={l.user.login}
                        size={32}
                      />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-[13px] font-medium text-[var(--m-ink)] truncate">
                            {l.user.name ?? `@${l.user.login}`}
                          </span>
                          <span className="pill pill-slate">{LEAVE_TYPE_LABELS[l.leaveType]}</span>
                          {overlap && (
                            <span className="pill pill-warn" title="Another teammate is also out on one of these days">
                              ⚠ overlap
                            </span>
                          )}
                        </div>
                        <p className="text-[11.5px] text-[var(--m-ink-3)] mt-0.5">
                          {fmtRange(l.startDate, l.endDate)} ·{' '}
                          {dayCount(l.startDate, l.endDate)}{' '}
                          {dayCount(l.startDate, l.endDate) === 1 ? 'day' : 'days'}
                        </p>
                      </div>
                      <span
                        className={`pill ${l.status === 'approved' ? 'pill-good' : 'pill-warn'} shrink-0`}
                      >
                        {l.status === 'approved' ? 'Approved' : 'Pending'}
                      </span>
                    </li>
                  )
                })}
              </ul>
            </section>
          ))}
        </div>
      )}
    </>
  )
}
