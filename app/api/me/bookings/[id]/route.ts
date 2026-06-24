import { NextResponse } from 'next/server'
import { and, eq } from 'drizzle-orm'
import { auth } from '@/auth'
import { db, schema } from '@/lib/db/client'
import { getAccessToken } from '@/lib/google/calendar'

export const runtime = 'nodejs'

/**
 * Accept or decline a booking request. On accept, if the host has Google
 * Calendar connected, we create the event with the requester as an attendee —
 * `sendUpdates=all` makes Google email them the invite + Meet link automatically.
 * Best-effort: with no calendar connected we still accept, just without a link.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.appUserId) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const { id } = await params
  const bookingId = Number(id)
  if (!Number.isInteger(bookingId)) return NextResponse.json({ error: 'bad_id' }, { status: 400 })

  let action = ''
  try {
    action = ((await req.json()) as { action?: string })?.action ?? ''
  } catch {
    /* no body */
  }
  if (action !== 'accept' && action !== 'decline') return NextResponse.json({ error: 'bad_action' }, { status: 400 })

  const booking = await db.query.bookingRequests.findFirst({
    where: and(eq(schema.bookingRequests.id, bookingId), eq(schema.bookingRequests.hostUserId, session.appUserId)),
  })
  if (!booking) return NextResponse.json({ error: 'not_found' }, { status: 404 })

  if (action === 'decline') {
    await db.update(schema.bookingRequests).set({ status: 'declined' }).where(eq(schema.bookingRequests.id, bookingId))
    return NextResponse.json({ ok: true, status: 'declined' })
  }

  let meetingUrl: string | null = null
  const token = await getAccessToken(session.appUserId)
  if (token) {
    try {
      const start = booking.proposedAt
      const end = new Date(start.getTime() + 30 * 60_000)
      const res = await fetch(
        'https://www.googleapis.com/calendar/v3/calendars/primary/events?conferenceDataVersion=1&sendUpdates=all',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({
            summary: `Meeting with ${booking.requesterName}`,
            description: booking.note ?? '',
            start: { dateTime: start.toISOString() },
            end: { dateTime: end.toISOString() },
            attendees: [{ email: booking.requesterEmail }],
            conferenceData: { createRequest: { requestId: `marina-${bookingId}`, conferenceSolutionKey: { type: 'hangoutsMeet' } } },
          }),
        },
      )
      if (res.ok) {
        const ev = (await res.json()) as { hangoutLink?: string; htmlLink?: string }
        meetingUrl = ev.hangoutLink ?? ev.htmlLink ?? null
      } else {
        console.error('booking accept: calendar insert failed', res.status, await res.text().catch(() => ''))
      }
    } catch (e) {
      console.error('booking accept: calendar create threw', e)
    }
  }

  await db.update(schema.bookingRequests).set({ status: 'accepted', meetingUrl }).where(eq(schema.bookingRequests.id, bookingId))
  return NextResponse.json({ ok: true, status: 'accepted', meetingUrl })
}
