import { and, eq, gte, lte } from 'drizzle-orm'
import { db, schema } from '@/lib/db/client'
import { refreshAccessToken } from './oauth'

/**
 * Calendar sync: pulls events from the next 7 days into the `meetings` table.
 * Also looks back 1 day so the dashboard can show the "earlier today" list.
 *
 * Token lifecycle: we use the stored refresh_token to get a fresh access_token
 * if the cached one is expired (or near expiry).
 */

const LOOKBACK_DAYS = 1
const LOOKAHEAD_DAYS = 7

type CalendarItem = {
  id: string
  status?: string
  summary?: string
  description?: string
  location?: string
  hangoutLink?: string
  conferenceData?: { entryPoints?: Array<{ uri?: string; entryPointType?: string }> }
  start?: { dateTime?: string; date?: string }
  end?: { dateTime?: string; date?: string }
  attendees?: Array<{ email?: string; self?: boolean; responseStatus?: string; organizer?: boolean }>
  organizer?: { email?: string; self?: boolean }
}

export type SyncResult = {
  inserted: number
  updated: number
  skipped: number
  error?: string
}

export async function getAccessToken(userId: number): Promise<string | null> {
  // A user can have MORE THAN ONE google `account` row (the table is keyed on
  // provider + providerAccountId, not user). Always pick the account they
  // actually CONNECTED for Calendar — the one carrying calendar scope + a
  // refresh_token — never a bare Google-SSO identity row. Otherwise events get
  // created on the wrong Google account (the sign-in account, not the connected
  // calendar account).
  const rows = await db.query.accounts.findMany({
    where: and(eq(schema.accounts.userId, userId), eq(schema.accounts.provider, 'google')),
  })
  const account =
    rows.find((a) => a.refresh_token && (a.scope ?? '').includes('calendar')) ??
    rows.find((a) => a.refresh_token) ??
    rows[0]
  if (!account) return null

  const nowSec = Math.floor(Date.now() / 1000)
  const expiresSoon = !account.expires_at || account.expires_at < nowSec + 60

  if (!expiresSoon && account.access_token) return account.access_token

  if (!account.refresh_token) {
    // No refresh — we can't recover. Caller should prompt reconnect.
    return null
  }

  try {
    const fresh = await refreshAccessToken(account.refresh_token)
    await db
      .update(schema.accounts)
      .set({
        access_token: fresh.access_token,
        expires_at: nowSec + (fresh.expires_in ?? 3600),
      })
      .where(
        and(
          eq(schema.accounts.provider, 'google'),
          eq(schema.accounts.providerAccountId, account.providerAccountId),
        ),
      )
    return fresh.access_token
  } catch (err) {
    console.error('[google.calendar] refresh failed', err)
    return null
  }
}

export type CreateEventResult =
  | { ok: true; meetingUrl: string | null; htmlLink: string | null; eventId: string | null }
  | { ok: false; error: 'no_calendar' | 'invalid' | 'create_failed' }

/**
 * Create a Google Calendar event for the user (with a Meet link + invites).
 * Shared by quick-book-a-contact, accept-a-booking, and the dashboard "new
 * meeting" composer. Returns `no_calendar` if the user hasn't connected Google
 * — callers MUST surface that rather than silently dropping the meeting.
 * `sendUpdates=all` makes Google email the attendees the invite.
 */
export async function createCalendarEvent(
  userId: number,
  opts: { summary: string; attendeeEmails?: string[]; startISO: string; durationMin?: number; description?: string },
): Promise<CreateEventResult> {
  const token = await getAccessToken(userId)
  if (!token) return { ok: false, error: 'no_calendar' }

  const start = new Date(opts.startISO)
  if (Number.isNaN(start.getTime())) return { ok: false, error: 'invalid' }
  const dur = opts.durationMin && opts.durationMin > 0 ? opts.durationMin : 30
  const end = new Date(start.getTime() + dur * 60_000)
  const attendees = (opts.attendeeEmails ?? [])
    .map((e) => e.trim())
    .filter((e) => e.includes('@'))
    .map((email) => ({ email }))

  try {
    const res = await fetch(
      'https://www.googleapis.com/calendar/v3/calendars/primary/events?conferenceDataVersion=1&sendUpdates=all',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          summary: opts.summary || 'Meeting',
          description: opts.description || undefined,
          start: { dateTime: start.toISOString() },
          end: { dateTime: end.toISOString() },
          attendees,
          conferenceData: {
            createRequest: { requestId: `marina-${userId}-${start.getTime()}`, conferenceSolutionKey: { type: 'hangoutsMeet' } },
          },
        }),
      },
    )
    if (!res.ok) {
      console.error('[google.calendar] create event failed', res.status, await res.text().catch(() => ''))
      return { ok: false, error: 'create_failed' }
    }
    const ev = (await res.json()) as { id?: string; hangoutLink?: string; htmlLink?: string }
    return { ok: true, meetingUrl: ev.hangoutLink ?? null, htmlLink: ev.htmlLink ?? null, eventId: ev.id ?? null }
  } catch (e) {
    console.error('[google.calendar] create event threw', e)
    return { ok: false, error: 'create_failed' }
  }
}

export async function syncCalendar(userId: number): Promise<SyncResult> {
  const token = await getAccessToken(userId)
  if (!token) {
    return { inserted: 0, updated: 0, skipped: 0, error: 'no_token_reconnect' }
  }

  const now = new Date()
  const timeMin = new Date(now.getTime() - LOOKBACK_DAYS * 24 * 60 * 60 * 1000).toISOString()
  const timeMax = new Date(now.getTime() + LOOKAHEAD_DAYS * 24 * 60 * 60 * 1000).toISOString()

  const params = new URLSearchParams({
    timeMin,
    timeMax,
    singleEvents: 'true',
    orderBy: 'startTime',
    maxResults: '100',
  })

  let res: Response
  try {
    res = await fetch(
      `https://www.googleapis.com/calendar/v3/calendars/primary/events?${params.toString()}`,
      { headers: { Authorization: `Bearer ${token}` } },
    )
  } catch (err) {
    return { inserted: 0, updated: 0, skipped: 0, error: `network: ${(err as Error).message}` }
  }

  if (!res.ok) {
    const text = await res.text().catch(() => '')
    return { inserted: 0, updated: 0, skipped: 0, error: `${res.status}: ${text.slice(0, 120)}` }
  }

  const body = (await res.json()) as { items?: CalendarItem[] }
  const items = body.items ?? []

  let inserted = 0
  let updated = 0
  let skipped = 0

  for (const item of items) {
    if (item.status === 'cancelled' || !item.id) {
      skipped++
      continue
    }

    const startIso = item.start?.dateTime || (item.start?.date ? `${item.start.date}T00:00:00Z` : null)
    const endIso = item.end?.dateTime || (item.end?.date ? `${item.end.date}T23:59:59Z` : null)
    if (!startIso || !endIso) {
      skipped++
      continue
    }

    const myRsvp = item.attendees?.find((a) => a.self)?.responseStatus ?? null
    const conferenceUrl =
      item.hangoutLink ??
      item.conferenceData?.entryPoints?.find((e) => e.entryPointType === 'video' || !!e.uri)?.uri ??
      null

    const values = {
      userId,
      provider: 'google' as const,
      externalId: item.id,
      calendarId: 'primary',
      title: item.summary ?? '(no title)',
      description: item.description ?? null,
      location: item.location ?? null,
      conferenceUrl,
      startAt: new Date(startIso),
      endAt: new Date(endIso),
      organizerEmail: item.organizer?.email ?? null,
      attendees: (item.attendees ?? []).map((a) => a.email ?? '').filter(Boolean),
      rsvpStatus: myRsvp,
      syncedAt: new Date(),
    }

    const existing = await db.query.meetings.findFirst({
      where: and(
        eq(schema.meetings.userId, userId),
        eq(schema.meetings.provider, 'google'),
        eq(schema.meetings.externalId, item.id),
      ),
    })

    if (existing) {
      await db
        .update(schema.meetings)
        .set({
          title: values.title,
          description: values.description,
          location: values.location,
          conferenceUrl: values.conferenceUrl,
          startAt: values.startAt,
          endAt: values.endAt,
          organizerEmail: values.organizerEmail,
          attendees: values.attendees,
          rsvpStatus: values.rsvpStatus,
          syncedAt: values.syncedAt,
        })
        .where(eq(schema.meetings.id, existing.id))
      updated++
    } else {
      await db.insert(schema.meetings).values(values)
      inserted++
    }
  }

  return { inserted, updated, skipped }
}

/** Mark meetings as attended where localActivity overlaps a video-call window. */
export async function reconcileAttendance(userId: number, day: Date = new Date()): Promise<number> {
  const dayStart = new Date(day)
  dayStart.setHours(0, 0, 0, 0)
  const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000)

  const todays = await db
    .select()
    .from(schema.meetings)
    .where(
      and(
        eq(schema.meetings.userId, userId),
        gte(schema.meetings.startAt, dayStart),
        lte(schema.meetings.startAt, dayEnd),
      ),
    )

  if (todays.length === 0) return 0

  // Pull the user's foreground app windows that overlap any of today's meetings.
  const activity = await db
    .select()
    .from(schema.localActivity)
    .where(
      and(
        eq(schema.localActivity.userId, userId),
        gte(schema.localActivity.windowStart, dayStart),
        lte(schema.localActivity.windowEnd, dayEnd),
      ),
    )

  let marked = 0
  for (const m of todays) {
    if (m.attendedAt) continue

    // Coarse heuristic: was there ANY local-activity window overlapping the meeting?
    const overlap = activity.find(
      (a) =>
        a.windowEnd > m.startAt &&
        a.windowStart < m.endAt &&
        a.activeSeconds > 60,
    )
    if (!overlap) continue

    await db
      .update(schema.meetings)
      .set({ attendedAt: new Date() })
      .where(eq(schema.meetings.id, m.id))
    marked++
  }
  return marked
}
