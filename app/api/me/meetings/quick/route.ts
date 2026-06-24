import { NextResponse } from 'next/server'
import { auth } from '@/auth'
import { getAccessToken } from '@/lib/google/calendar'

export const runtime = 'nodejs'

/**
 * Quick-book a meeting with a contact. Creates a Google Calendar event inviting
 * them (`sendUpdates=all` → Google emails them the invite + Meet link). Needs
 * the user's Google Calendar connected; returns 409 otherwise so the UI can
 * nudge them to connect.
 */
export async function POST(req: Request) {
  const session = await auth()
  if (!session?.appUserId) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  let email = ''
  let name = ''
  let when = ''
  try {
    const b = (await req.json()) as { email?: string; name?: string; when?: string }
    email = (b.email ?? '').trim()
    name = (b.name ?? '').trim()
    when = (b.when ?? '').trim()
  } catch {
    /* invalid */
  }
  const start = when ? new Date(when) : null
  if (!email || !email.includes('@') || !start || isNaN(start.getTime())) {
    return NextResponse.json({ error: 'missing_fields' }, { status: 400 })
  }

  const token = await getAccessToken(session.appUserId)
  if (!token) return NextResponse.json({ error: 'no_calendar' }, { status: 409 })

  const end = new Date(start.getTime() + 30 * 60_000)
  try {
    const res = await fetch(
      'https://www.googleapis.com/calendar/v3/calendars/primary/events?conferenceDataVersion=1&sendUpdates=all',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          summary: `Meeting with ${name || email}`,
          start: { dateTime: start.toISOString() },
          end: { dateTime: end.toISOString() },
          attendees: [{ email }],
          conferenceData: { createRequest: { requestId: `marina-quick-${Date.now()}`, conferenceSolutionKey: { type: 'hangoutsMeet' } } },
        }),
      },
    )
    if (!res.ok) {
      console.error('quick meeting create failed', res.status, await res.text().catch(() => ''))
      return NextResponse.json({ error: 'create_failed' }, { status: 500 })
    }
    const ev = (await res.json()) as { hangoutLink?: string; htmlLink?: string }
    return NextResponse.json({ ok: true, meetingUrl: ev.hangoutLink ?? ev.htmlLink ?? null })
  } catch (e) {
    console.error('quick meeting threw', e)
    return NextResponse.json({ error: 'create_failed' }, { status: 500 })
  }
}
