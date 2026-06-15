import { and, eq, gte, inArray, isNull, desc, lte } from 'drizzle-orm'
import { db, schema } from '@/lib/db/client'

/**
 * Shared people-signal engine. One grounded computation powers three surfaces:
 *   - the employee's own wellbeing nudge ("you're overworking")
 *   - the manager's workload-balance view
 *   - the CEO/admin flight-risk radar
 *
 * Everything is derived from data we already collect (shifts, leaves, breaks,
 * GitHub events, deliverables) over a rolling window — no new tracking, no LLM.
 */

const DAY = 86_400_000

export type PersonSignals = {
  userId: number
  /** Hours logged in the trailing 7 days. */
  weekHours: number
  /** Days since the end of the most recent (any-status) leave, or null. */
  daysSinceLeave: number | null
  /** Minutes currently blocked (0 if not blocked right now). */
  blockedNowMin: number
  /** Output events (deliverables + non-seed GitHub events) in the last 7 days. */
  outputCount: number
  /** Distinct days in the last 7 they took at least one break. */
  breakDays: number
  /** Human-readable flags worth a manager's attention. */
  flags: string[]
  /** Overall concern level driven by the flags. */
  level: 'ok' | 'watch' | 'high'
}

const OVERWORK_HIGH = 50
const OVERWORK_WATCH = 45
const NO_LEAVE_DAYS = 90
const BLOCKED_HIGH_MIN = 120

export async function computeSignals(orgId: number, userIds: number[]): Promise<PersonSignals[]> {
  void orgId
  const ids = Array.from(new Set(userIds)).filter((n) => Number.isInteger(n))
  if (ids.length === 0) return []

  const now = Date.now()
  const since7 = new Date(now - 7 * DAY)

  const [shifts, leaves, openBlocks, deliverables, ghEvents, breaks7] = await Promise.all([
    db
      .select({ userId: schema.shifts.userId, punchedInAt: schema.shifts.punchedInAt, punchedOutAt: schema.shifts.punchedOutAt })
      .from(schema.shifts)
      .where(and(inArray(schema.shifts.userId, ids), gte(schema.shifts.punchedInAt, since7))),
    db
      .select({ userId: schema.leaveRequests.userId, endDate: schema.leaveRequests.endDate })
      .from(schema.leaveRequests)
      .where(
        and(
          inArray(schema.leaveRequests.userId, ids),
          // Only APPROVED, already-ended leaves count as "leave on record".
          // Without this we also matched pending/denied rows, so "days since
          // last leave" was wrong (and the page read "No leave on record").
          eq(schema.leaveRequests.status, 'approved'),
          lte(schema.leaveRequests.endDate, new Date(now).toISOString().slice(0, 10)),
        ),
      )
      .orderBy(desc(schema.leaveRequests.endDate)),
    db
      .select({ userId: schema.breaks.userId, startedAt: schema.breaks.startedAt, category: schema.breaks.category })
      .from(schema.breaks)
      .where(and(inArray(schema.breaks.userId, ids), isNull(schema.breaks.endedAt))),
    db
      .select({ userId: schema.deliverables.userId })
      .from(schema.deliverables)
      .where(and(inArray(schema.deliverables.userId, ids), gte(schema.deliverables.completedAt, since7))),
    db
      .select({ userId: schema.githubEvents.userId })
      .from(schema.githubEvents)
      .where(and(inArray(schema.githubEvents.userId, ids), gte(schema.githubEvents.occurredAt, since7))),
    db
      .select({ userId: schema.breaks.userId, startedAt: schema.breaks.startedAt })
      .from(schema.breaks)
      .where(and(inArray(schema.breaks.userId, ids), gte(schema.breaks.startedAt, since7))),
  ])

  const hoursByUser = new Map<number, number>()
  for (const s of shifts) {
    const end = s.punchedOutAt ?? new Date(now)
    const mins = Math.max(0, (end.getTime() - s.punchedInAt.getTime()) / 60_000)
    hoursByUser.set(s.userId, (hoursByUser.get(s.userId) ?? 0) + mins / 60)
  }
  const lastLeaveByUser = new Map<number, string>()
  for (const l of leaves) {
    if (!lastLeaveByUser.has(l.userId)) lastLeaveByUser.set(l.userId, l.endDate) // first = most recent (desc)
  }
  const blockedByUser = new Map<number, number>()
  for (const b of openBlocks) {
    if (b.category !== 'blocked') continue
    const mins = Math.round((now - b.startedAt.getTime()) / 60_000)
    blockedByUser.set(b.userId, Math.max(blockedByUser.get(b.userId) ?? 0, mins))
  }
  const outputByUser = new Map<number, number>()
  for (const d of deliverables) outputByUser.set(d.userId, (outputByUser.get(d.userId) ?? 0) + 1)
  for (const e of ghEvents) outputByUser.set(e.userId, (outputByUser.get(e.userId) ?? 0) + 1)
  const breakDaysByUser = new Map<number, Set<string>>()
  for (const b of breaks7) {
    const iso = b.startedAt.toISOString().slice(0, 10)
    const set = breakDaysByUser.get(b.userId) ?? new Set<string>()
    set.add(iso)
    breakDaysByUser.set(b.userId, set)
  }

  return ids.map((userId) => {
    const weekHours = Math.round((hoursByUser.get(userId) ?? 0) * 10) / 10
    const lastLeave = lastLeaveByUser.get(userId)
    const daysSinceLeave = lastLeave
      ? Math.floor((now - Date.parse(lastLeave + 'T00:00:00Z')) / DAY)
      : null
    const blockedNowMin = blockedByUser.get(userId) ?? 0
    const outputCount = outputByUser.get(userId) ?? 0
    const breakDays = (breakDaysByUser.get(userId) ?? new Set()).size

    const flags: string[] = []
    let score = 0
    if (weekHours >= OVERWORK_HIGH) { flags.push(`${weekHours}h logged this week`); score += 2 }
    else if (weekHours >= OVERWORK_WATCH) { flags.push(`${weekHours}h logged this week`); score += 1 }
    if (daysSinceLeave != null && daysSinceLeave >= NO_LEAVE_DAYS) { flags.push(`No leave in ${daysSinceLeave} days`); score += 1 }
    if (daysSinceLeave == null) { flags.push('No leave on record'); score += 1 }
    if (blockedNowMin >= BLOCKED_HIGH_MIN) { flags.push(`Blocked ${Math.floor(blockedNowMin / 60)}h+`); score += 1 }
    if (weekHours > 0 && outputCount === 0) { flags.push('No shipped output in 7 days'); score += 1 }
    if (weekHours >= OVERWORK_WATCH && breakDays <= 1) { flags.push('Few breaks while working long hours'); score += 1 }

    const level: PersonSignals['level'] = score >= 3 ? 'high' : score >= 1 ? 'watch' : 'ok'
    return { userId, weekHours, daysSinceLeave, blockedNowMin, outputCount, breakDays, flags, level }
  })
}

export async function computeSignalsForUser(orgId: number, userId: number): Promise<PersonSignals> {
  const [row] = await computeSignals(orgId, [userId])
  return row ?? { userId, weekHours: 0, daysSinceLeave: null, blockedNowMin: 0, outputCount: 0, breakDays: 0, flags: [], level: 'ok' }
}
