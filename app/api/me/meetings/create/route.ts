import { NextResponse } from 'next/server'
import { auth } from '@/auth'
import { createCalendarEvent, syncCalendar } from '@/lib/google/calendar'

export const runtime = 'nodejs'

/**
 * Schedule a new meeting from the dashboard. Creates a Google Calendar event
 * (with a Meet link + invites) on the user's calendar. Requires Google Calendar
 * connected — returns 409 `no_calendar` otherwise so the UI can nudge.
 */
export async function POST(req: Request) {
  const session = await auth()
  if (!session?.appUserId) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  let b: { summary?: unknown; attendees?: unknown; startISO?: unknown; durationMin?: unknown; description?: unknown } = {}
  try {
    b = (await req.json()) as typeof b
  } catch {
    /* invalid */
  }
  const summary = String(b.summary ?? '').trim()
  const startISO = String(b.startISO ?? '').trim()
  const durationMin = Number(b.durationMin) || 30
  const attendees = Array.isArray(b.attendees) ? b.attendees.map((x) => String(x).trim()).filter(Boolean) : []
  const description = typeof b.description === 'string' ? b.description : undefined

  if (!summary || !startISO) return NextResponse.json({ error: 'missing_fields' }, { status: 400 })

  const result = await createCalendarEvent(session.appUserId, { summary, attendeeEmails: attendees, startISO, durationMin, description })
  if (!result.ok) {
    const status = result.error === 'no_calendar' ? 409 : result.error === 'invalid' ? 400 : 500
    return NextResponse.json({ error: result.error }, { status })
  }

  // Pull the new event into the meetings table so the dashboard reflects it on
  // refresh (best-effort — never block the response on a slow Google sync).
  await syncCalendar(session.appUserId).catch(() => {})
  return NextResponse.json({ ok: true, meetingUrl: result.meetingUrl })
}
