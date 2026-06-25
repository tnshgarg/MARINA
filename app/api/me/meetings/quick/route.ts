import { NextResponse } from 'next/server'
import { auth } from '@/auth'
import { createCalendarEvent } from '@/lib/google/calendar'

export const runtime = 'nodejs'

/**
 * Quick-book a meeting with a contact. Creates a Google Calendar event inviting
 * them (Google emails them the invite + Meet link). Needs the user's Google
 * Calendar connected; returns 409 otherwise so the UI can nudge them to connect.
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
  if (!email || !email.includes('@') || !when) {
    return NextResponse.json({ error: 'missing_fields' }, { status: 400 })
  }

  const result = await createCalendarEvent(session.appUserId, {
    summary: `Meeting with ${name || email}`,
    attendeeEmails: [email],
    startISO: when,
    durationMin: 30,
  })
  if (!result.ok) {
    const status = result.error === 'no_calendar' ? 409 : result.error === 'invalid' ? 400 : 500
    return NextResponse.json({ error: result.error }, { status })
  }
  return NextResponse.json({ ok: true, meetingUrl: result.meetingUrl })
}
