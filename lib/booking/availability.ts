import { and, eq, gte, lt } from 'drizzle-orm'
import { db, schema } from '@/lib/db/client'

/**
 * Booking availability — the Calendly-style "offer real slots" engine.
 *
 * A user defines the days + hours they take meetings (stored on user_settings as
 * minutes-from-midnight in their own timezone). The public /book page asks for
 * the next two weeks of open slots: we expand the working window into discrete
 * slots, then subtract anything they're already busy with (synced calendar
 * meetings + already-accepted booking requests) and anything in the past.
 *
 * Timezone handling is deliberate: slots are defined in wall-clock time in the
 * host's `timezone`, but we emit absolute UTC instants so the requester (who may
 * be anywhere) books the correct moment. We resolve the tz offset per-instant
 * via Intl so DST is handled without a date library.
 */

export const DEFAULT_TZ = 'Asia/Kolkata'

export type AvailabilityConfig = {
  workDays: number[] // 0=Sun .. 6=Sat
  startMin: number // minutes from midnight, in `timezone`
  endMin: number
  slotMin: number
  timezone: string
}

export const DEFAULT_AVAILABILITY: AvailabilityConfig = {
  workDays: [1, 2, 3, 4, 5],
  startMin: 9 * 60,
  endMin: 17 * 60,
  slotMin: 30,
  timezone: DEFAULT_TZ,
}

export async function getAvailability(userId: number): Promise<AvailabilityConfig> {
  const s = await db.query.userSettings.findFirst({ where: eq(schema.userSettings.userId, userId) })
  if (!s) return DEFAULT_AVAILABILITY
  const days = (s.bookingWorkDays ?? []).filter((d) => d >= 0 && d <= 6)
  return {
    workDays: days.length ? days : DEFAULT_AVAILABILITY.workDays,
    startMin: s.bookingStartMin ?? DEFAULT_AVAILABILITY.startMin,
    endMin: s.bookingEndMin ?? DEFAULT_AVAILABILITY.endMin,
    slotMin: s.bookingSlotMin ?? DEFAULT_AVAILABILITY.slotMin,
    timezone: s.bookingTimezone || DEFAULT_TZ,
  }
}

// ── Timezone helpers (no external date lib) ────────────────────────────────

/** Offset (ms) to add to a UTC instant to get wall-clock time in `tz`. */
function tzOffsetMs(instant: Date, tz: string): number {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
  const m: Record<string, number> = {}
  for (const p of dtf.formatToParts(instant)) if (p.type !== 'literal') m[p.type] = Number(p.value)
  const hour = m.hour === 24 ? 0 : m.hour
  const asUTC = Date.UTC(m.year, m.month - 1, m.day, hour, m.minute, m.second)
  return asUTC - instant.getTime()
}

/** The UTC instant for a wall-clock (date + minutes) in `tz`. */
function zonedToUtc(y: number, mon0: number, day: number, minutes: number, tz: string): Date {
  const naive = Date.UTC(y, mon0, day, Math.floor(minutes / 60), minutes % 60)
  const offset = tzOffsetMs(new Date(naive), tz)
  return new Date(naive - offset)
}

/** Today's civil date in `tz`. */
function todayYmdInTz(tz: string): { y: number; mon0: number; day: number } {
  const p: Record<string, number> = {}
  for (const part of new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date()))
    if (part.type !== 'literal') p[part.type] = Number(part.value)
  return { y: p.year, mon0: p.month - 1, day: p.day }
}

// ── Slot generation ─────────────────────────────────────────────────────────

export type Slot = { iso: string; label: string }
export type DaySlots = { weekday: string; dayLabel: string; slots: Slot[] }
export type BusyInterval = { start: number; end: number } // epoch ms

export function generateSlots(
  config: AvailabilityConfig,
  busy: BusyInterval[],
  opts?: { scanDays?: number; maxDays?: number; nowMs?: number; minLeadMin?: number },
): DaySlots[] {
  const scanDays = opts?.scanDays ?? 21
  const maxDays = opts?.maxDays ?? 7
  const nowMs = opts?.nowMs ?? Date.now()
  const minLead = (opts?.minLeadMin ?? 60) * 60_000
  const tz = config.timezone
  if (config.endMin <= config.startMin || config.slotMin <= 0 || !config.workDays.length) return []

  const out: DaySlots[] = []
  const today = todayYmdInTz(tz)
  const base = Date.UTC(today.y, today.mon0, today.day)

  for (let i = 0; i < scanDays && out.length < maxDays; i++) {
    const d = new Date(base + i * 86_400_000)
    const y = d.getUTCFullYear()
    const mon0 = d.getUTCMonth()
    const day = d.getUTCDate()
    if (!config.workDays.includes(d.getUTCDay())) continue

    const slots: Slot[] = []
    for (let m = config.startMin; m + config.slotMin <= config.endMin; m += config.slotMin) {
      const start = zonedToUtc(y, mon0, day, m, tz)
      const startMs = start.getTime()
      const endMs = startMs + config.slotMin * 60_000
      if (startMs < nowMs + minLead) continue
      if (busy.some((b) => startMs < b.end && endMs > b.start)) continue
      slots.push({
        iso: start.toISOString(),
        label: new Intl.DateTimeFormat('en-US', { timeZone: tz, hour: 'numeric', minute: '2-digit' }).format(start),
      })
    }
    if (!slots.length) continue
    const anchor = zonedToUtc(y, mon0, day, 12 * 60, tz)
    out.push({
      weekday: new Intl.DateTimeFormat('en-US', { timeZone: tz, weekday: 'short' }).format(anchor),
      dayLabel: new Intl.DateTimeFormat('en-US', { timeZone: tz, month: 'short', day: 'numeric' }).format(anchor),
      slots,
    })
  }
  return out
}

/** Busy intervals for a host: synced meetings + already-accepted bookings. */
export async function getBusyIntervals(userId: number, slotMin: number): Promise<BusyInterval[]> {
  const from = new Date(Date.now() - 6 * 60 * 60_000)
  const to = new Date(Date.now() + 24 * 24 * 60 * 60_000)
  const [meetings, bookings] = await Promise.all([
    db
      .select({ startAt: schema.meetings.startAt, endAt: schema.meetings.endAt })
      .from(schema.meetings)
      .where(and(eq(schema.meetings.userId, userId), gte(schema.meetings.endAt, from), lt(schema.meetings.startAt, to))),
    db
      .select({ proposedAt: schema.bookingRequests.proposedAt })
      .from(schema.bookingRequests)
      .where(and(eq(schema.bookingRequests.hostUserId, userId), eq(schema.bookingRequests.status, 'accepted'))),
  ])
  const busy: BusyInterval[] = []
  for (const m of meetings) busy.push({ start: m.startAt.getTime(), end: m.endAt.getTime() })
  for (const b of bookings) {
    const s = b.proposedAt.getTime()
    busy.push({ start: s, end: s + slotMin * 60_000 })
  }
  return busy
}

/** Human label for the configured window, e.g. "Mon–Fri · 9:00 AM–5:00 PM". */
export function describeAvailability(config: AvailabilityConfig): string {
  const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
  const sorted = [...config.workDays].sort((a, b) => a - b)
  const fmt = (min: number) => {
    const h = Math.floor(min / 60)
    const m = min % 60
    const ampm = h < 12 ? 'AM' : 'PM'
    const hr = h % 12 === 0 ? 12 : h % 12
    return `${hr}:${String(m).padStart(2, '0')} ${ampm}`
  }
  // Compact contiguous weekday runs (e.g. Mon–Fri).
  const runs: string[] = []
  let i = 0
  while (i < sorted.length) {
    let j = i
    while (j + 1 < sorted.length && sorted[j + 1] === sorted[j] + 1) j++
    runs.push(i === j ? dayNames[sorted[i]] : `${dayNames[sorted[i]]}–${dayNames[sorted[j]]}`)
    i = j + 1
  }
  return `${runs.join(', ')} · ${fmt(config.startMin)}–${fmt(config.endMin)}`
}
