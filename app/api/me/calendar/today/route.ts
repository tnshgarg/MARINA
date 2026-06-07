import { NextResponse } from 'next/server'
import { and, eq, gte, lte } from 'drizzle-orm'
import { db, schema } from '@/lib/db/client'
import { HttpError, requireSession } from '@/lib/auth/guards'

export const runtime = 'nodejs'

/**
 * Today's meetings for the calling user (from synced Google Calendar data).
 * Returns events whose start_at is within today + the next 4h so the dashboard
 * can show both "now / next" and "later today".
 */
export async function GET() {
  try {
    const session = await requireSession()

    const start = new Date()
    start.setHours(0, 0, 0, 0)
    const end = new Date(start.getTime() + 32 * 60 * 60 * 1000)

    // Are we even connected? If not, surface that so the dashboard can show CTA.
    const connected = !!(await db.query.accounts.findFirst({
      where: and(
        eq(schema.accounts.userId, session.appUserId),
        eq(schema.accounts.provider, 'google'),
      ),
    }))

    if (!connected) {
      return NextResponse.json({ connected: false, meetings: [] })
    }

    const rows = await db
      .select()
      .from(schema.meetings)
      .where(
        and(
          eq(schema.meetings.userId, session.appUserId),
          gte(schema.meetings.startAt, start),
          lte(schema.meetings.startAt, end),
        ),
      )
      .orderBy(schema.meetings.startAt)

    return NextResponse.json({
      connected: true,
      meetings: rows.map((m) => ({
        id: m.id,
        title: m.title,
        startAt: m.startAt.toISOString(),
        endAt: m.endAt.toISOString(),
        location: m.location,
        conferenceUrl: m.conferenceUrl,
        organizerEmail: m.organizerEmail,
        attendees: m.attendees,
        rsvpStatus: m.rsvpStatus,
        attendedAt: m.attendedAt?.toISOString() ?? null,
      })),
    })
  } catch (err) {
    if (err instanceof HttpError) {
      return NextResponse.json({ error: err.message }, { status: err.status })
    }
    console.error('calendar/today failed', err)
    return NextResponse.json({ error: 'internal' }, { status: 500 })
  }
}
