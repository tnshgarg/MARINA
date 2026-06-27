import { NextResponse } from 'next/server'
import { and, eq, inArray, isNull } from 'drizzle-orm'
import { db, schema } from '@/lib/db/client'
import { HttpError, requireScope } from '@/lib/auth/guards'
import { createCalendarEvent } from '@/lib/google/calendar'

export const runtime = 'nodejs'

/**
 * Schedule a meeting with MULTIPLE members in one shot (from the Teams page).
 * Creates a single Google Calendar event (organiser's calendar, all attendees
 * invited, with a Meet link), then records one `scheduled_meetings` row per
 * attendee sharing the same `googleEventId` so each person sees it on their
 * dashboard. Falls back to in-app rows when the organiser has no calendar.
 */
export async function POST(req: Request, ctx: { params: Promise<{ orgId: string }> }) {
  const { orgId: raw } = await ctx.params
  const orgId = Number(raw)
  if (!Number.isInteger(orgId)) return NextResponse.json({ error: 'invalid orgId' }, { status: 400 })

  try {
    const { session, scope } = await requireScope(orgId, 'manager')
    const body = (await req.json().catch(() => ({}))) as {
      title?: string
      agenda?: string
      startISO?: string
      durationMin?: number
      attendeeUserIds?: number[]
    }

    const title = (body.title ?? '').trim().slice(0, 200) || 'Team meeting'
    const agenda = (body.agenda ?? '').trim().slice(0, 2000) || null
    const start = body.startISO ? new Date(body.startISO) : null
    if (!start || Number.isNaN(start.getTime())) {
      return NextResponse.json({ error: 'invalid start time' }, { status: 400 })
    }
    const durationMin = body.durationMin && body.durationMin >= 5 && body.durationMin <= 480 ? Math.floor(body.durationMin) : 30
    const end = new Date(start.getTime() + durationMin * 60_000)

    const requested = Array.isArray(body.attendeeUserIds) ? body.attendeeUserIds.filter((n) => Number.isInteger(n)) : []
    if (requested.length === 0) return NextResponse.json({ error: 'pick at least one attendee' }, { status: 400 })

    // Keep only active org members the organiser can actually see, and never the
    // organiser themselves (they're the host).
    const memberRows = await db
      .select({ userId: schema.memberships.userId })
      .from(schema.memberships)
      .where(and(eq(schema.memberships.orgId, orgId), isNull(schema.memberships.endedAt), inArray(schema.memberships.userId, requested)))
    const allowed = memberRows
      .map((m) => m.userId)
      .filter((uid) => uid !== session.appUserId && (scope.isAdminScope || scope.userIds.has(uid)))
    if (allowed.length === 0) return NextResponse.json({ error: 'no valid attendees' }, { status: 400 })

    const attendees = await db
      .select({ id: schema.users.id, email: schema.users.email })
      .from(schema.users)
      .where(inArray(schema.users.id, allowed))
    const emails = attendees.map((a) => a.email).filter((e): e is string => !!e && e.includes('@'))

    // One Google event for everyone (best-effort — works only if the organiser
    // connected Calendar). We still record the meeting either way.
    const ev = await createCalendarEvent(session.appUserId, {
      summary: title,
      attendeeEmails: emails,
      startISO: start.toISOString(),
      durationMin,
      description: agenda ?? undefined,
    })
    const googleEventId = ev.ok ? ev.eventId : null
    const conferenceUrl = ev.ok ? ev.meetingUrl : null

    // One row per attendee, sharing the Google event id.
    await db.insert(schema.scheduledMeetings).values(
      allowed.map((uid) => ({
        orgId,
        organiserUserId: session.appUserId,
        attendeeUserId: uid,
        title,
        agenda,
        startAt: start,
        endAt: end,
        googleEventId,
        conferenceUrl,
      })),
    )

    return NextResponse.json({
      ok: true,
      count: allowed.length,
      calendarConnected: ev.ok,
      meetingUrl: conferenceUrl,
    })
  } catch (err) {
    if (err instanceof HttpError) return NextResponse.json({ error: err.message }, { status: err.status })
    console.error('team meeting create failed', err)
    return NextResponse.json({ error: 'internal' }, { status: 500 })
  }
}
