/**
 * Timezone-aware day boundaries. MARINA's daily-state engine and attendance
 * grid previously bucketed everything in UTC, which assigns 9pm IST work to
 * "tomorrow UTC" and breaks shift duration math across midnight.
 *
 * Helper resolves a date to the *local-calendar day* in the given IANA zone
 * (e.g. "Asia/Kolkata"), then returns the start/end as proper Date objects.
 *
 * Uses `Intl.DateTimeFormat` with `timeZone:` which is the only stdlib path
 * that handles DST + offset jumps correctly across browsers and Node.
 */

const DAY_FORMATTER_CACHE = new Map<string, Intl.DateTimeFormat>()
const OFFSET_FORMATTER_CACHE = new Map<string, Intl.DateTimeFormat>()

function dayFormatter(tz: string): Intl.DateTimeFormat {
  let f = DAY_FORMATTER_CACHE.get(tz)
  if (!f) {
    f = new Intl.DateTimeFormat('en-CA', {
      timeZone: tz,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    })
    DAY_FORMATTER_CACHE.set(tz, f)
  }
  return f
}

function partsFormatter(tz: string): Intl.DateTimeFormat {
  let f = OFFSET_FORMATTER_CACHE.get(tz)
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    })
    OFFSET_FORMATTER_CACHE.set(tz, f)
  }
  return f
}

/** ISO calendar day (YYYY-MM-DD) in the given timezone. */
export function localDay(d: Date, tz: string): string {
  return dayFormatter(tz).format(d) // en-CA gives YYYY-MM-DD
}

/**
 * Return the UTC instant that corresponds to 00:00:00 local time of the
 * given calendar day in the given zone.
 *
 * Strategy: pick a candidate UTC date that is roughly the right day, then
 * iteratively correct for the offset using Intl.parts.
 */
export function startOfDayInTz(day: string, tz: string): Date {
  const [y, m, d] = day.split('-').map(Number)
  if (!y || !m || !d) throw new Error(`bad day ${day}`)
  // Anchor at noon UTC to dodge DST edges, then read back the local hours and back off.
  const anchor = new Date(Date.UTC(y, m - 1, d, 12))
  const parts = partsFormatter(tz).formatToParts(anchor)
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? '0')
  const localHour = get('hour')
  const localMinute = get('minute')
  // Difference between anchor's local time and target local midnight
  const offsetMs =
    (localHour * 60 + localMinute) * 60_000 // local time at anchor moment
  return new Date(anchor.getTime() - offsetMs)
}

/** [start, end) of the calendar day in the given zone. */
export function dayBoundsInTz(d: Date, tz: string): { startIso: Date; endIso: Date; iso: string } {
  const iso = localDay(d, tz)
  const startIso = startOfDayInTz(iso, tz)
  const endIso = new Date(startIso.getTime() + 24 * 60 * 60 * 1000)
  return { startIso, endIso, iso }
}

/** Default zone when an org hasn't set one. India-first product. */
export const DEFAULT_TZ = 'Asia/Kolkata'
