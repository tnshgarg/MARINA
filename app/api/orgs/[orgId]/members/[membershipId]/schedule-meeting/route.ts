import { NextResponse } from 'next/server'
import { and, eq, gt, isNull, lt, or } from 'drizzle-orm'
import { db, schema } from '@/lib/db/client'
import { HttpError, ensureScopeMembership, requireScope } from '@/lib/auth/guards'
import { getAccessToken } from '@/lib/google/calendar'
import { sendEmail } from '@/lib/email/send'
import { afterResponse } from '@/lib/after'
import { trackEvent } from '@/lib/analytics/track'

export const runtime = 'nodejs'

/**
 * Schedule an internal meeting (typically a 1:1) between the signed-in
 * manager and a teammate. Always records the row in `scheduled_meetings`.
 *
 * If the organiser has Google Calendar connected (provider='google' token
 * with calendar scope), we *also* push the event to Google so both calendars
 * stay in sync. Otherwise the row is the source of truth and we notify the
 * attendee in-app + email.
 */
export async function POST(
  req: Request,
  ctx: { params: Promise<{ orgId: string; membershipId: string }> },
) {
  const { orgId: rawO, membershipId: rawM } = await ctx.params
  const orgId = Number(rawO)
  const membershipId = Number(rawM)
  if (!Number.isInteger(orgId) || !Number.isInteger(membershipId)) {
    return NextResponse.json({ error: 'invalid ids' }, { status: 400 })
  }

  try {
    const { session, scope } = await requireScope(orgId, 'manager')

    const target = await db.query.memberships.findFirst({
      where: and(
        eq(schema.memberships.id, membershipId),
        eq(schema.memberships.orgId, orgId),
        isNull(schema.memberships.endedAt),
      ),
    })
    if (!target) return NextResponse.json({ error: 'membership not found' }, { status: 404 })
    ensureScopeMembership(scope, membershipId)
    // Can't schedule a meeting with yourself — calendar APIs accept it but
    // the resulting "1:1" event is nonsense and clutters the calendar.
    if (target.userId === session.appUserId) {
      return NextResponse.json(
        { error: "You can't schedule a meeting with yourself." },
        { status: 400 },
      )
    }

    const [attendee, organiser] = await Promise.all([
      db.query.users.findFirst({ where: eq(schema.users.id, target.userId) }),
      db.query.users.findFirst({ where: eq(schema.users.id, session.appUserId) }),
    ])
    if (!attendee || !organiser) {
      return NextResponse.json({ error: 'user not found' }, { status: 404 })
    }

    const body = (await req.json().catch(() => ({}))) as {
      title?: string
      agenda?: string
      startAt?: string
      durationMin?: number
      /** Set true to schedule despite a detected calendar conflict. */
      force?: boolean
    }
    const title = (body.title ?? '').trim().slice(0, 200) || `1:1 with ${attendee.name ?? attendee.login}`
    const agenda =
      typeof body.agenda === 'string' && body.agenda.trim().length > 0
        ? body.agenda.trim().slice(0, 2000)
        : null
    const startAt = body.startAt ? new Date(body.startAt) : null
    if (!startAt || Number.isNaN(startAt.getTime())) {
      return NextResponse.json({ error: 'startAt (ISO datetime) required' }, { status: 400 })
    }
    if (startAt.getTime() < Date.now() - 5 * 60_000) {
      return NextResponse.json({ error: 'startAt must be in the future' }, { status: 400 })
    }
    const durationMin =
      typeof body.durationMin === 'number' && body.durationMin >= 5 && body.durationMin <= 240
        ? Math.floor(body.durationMin)
        : 30
    const endAt = new Date(startAt.getTime() + durationMin * 60_000)

    // CONFLICT CHECK — does the attendee already have something in this window?
    // We look at both their synced Google Calendar events (`meetings`) and any
    // MARINA-scheduled 1:1s (`scheduledMeetings`). Overlap = existing.start <
    // new.end AND existing.end > new.start. If we find one and the caller
    // hasn't forced it, return 409 with the clashing item so the dialog can
    // say "Priya already has X then — schedule anyway?".
    if (!body.force) {
      const [calClash, mtgClash] = await Promise.all([
        db.query.meetings.findFirst({
          where: and(
            eq(schema.meetings.userId, attendee.id),
            lt(schema.meetings.startAt, endAt),
            gt(schema.meetings.endAt, startAt),
          ),
        }),
        db.query.scheduledMeetings.findFirst({
          where: and(
            or(
              eq(schema.scheduledMeetings.attendeeUserId, attendee.id),
              eq(schema.scheduledMeetings.organiserUserId, attendee.id),
            ),
            lt(schema.scheduledMeetings.startAt, endAt),
            gt(schema.scheduledMeetings.endAt, startAt),
          ),
        }),
      ])
      const clash = calClash ?? mtgClash
      if (clash) {
        return NextResponse.json(
          {
            error: 'conflict',
            conflict: {
              title: clash.title,
              startAt: clash.startAt.toISOString(),
              endAt: clash.endAt.toISOString(),
            },
          },
          { status: 409 },
        )
      }
    }

    // Google Calendar is OPTIONAL. If the organiser has it connected we push
    // the event there too (with a Meet link); if not, the MARINA row + in-app
    // notification + email are the source of truth and scheduling still works.
    // Use getAccessToken() so an expired access token is REFRESHED via the
    // refresh_token — the previous code used the raw stored token, which
    // expires after ~1h, so every push failed once the token went stale.
    const calendarToken = await getAccessToken(session.appUserId)

    // Insert the row first — it's the source of truth.
    const [row] = await db
      .insert(schema.scheduledMeetings)
      .values({
        orgId,
        organiserUserId: session.appUserId,
        attendeeUserId: attendee.id,
        title,
        agenda,
        startAt,
        endAt,
      })
      .returning()

    // Push to Google Calendar. We've already verified the account exists.
    let googleEventId: string | null = null
    let conferenceUrl: string | null = null
    let calendarViewUrl: string | null = null
    let googleError: string | null = null
    if (calendarToken) try {
      const insertRes = await fetch(
        'https://www.googleapis.com/calendar/v3/calendars/primary/events?conferenceDataVersion=1&sendUpdates=all',
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${calendarToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            summary: title,
            description: agenda ?? 'Scheduled from MARINA.',
            start: { dateTime: startAt.toISOString() },
            end: { dateTime: endAt.toISOString() },
            attendees: attendee.email ? [{ email: attendee.email }] : [],
            conferenceData: {
              createRequest: {
                requestId: `marina-${row.id}-${Date.now()}`,
                conferenceSolutionKey: { type: 'hangoutsMeet' },
              },
            },
          }),
        },
      )
      if (insertRes.ok) {
        const ev = await insertRes.json()
        googleEventId = ev.id ?? null
        conferenceUrl = ev.hangoutLink ?? null
        // `htmlLink` is Google's permanent "open this event" URL — great for
        // the email recipient who wants to add it to their own calendar.
        calendarViewUrl = ev.htmlLink ?? null
        await db
          .update(schema.scheduledMeetings)
          .set({ googleEventId, conferenceUrl })
          .where(eq(schema.scheduledMeetings.id, row.id))
      } else {
        googleError = `Calendar insert failed: ${insertRes.status}`
      }
    } catch (e) {
      googleError = e instanceof Error ? e.message : String(e)
    }

    // In-app notification to the attendee (always — calendar may have failed).
    const inAppTitle = `${organiser.name ?? organiser.login} scheduled "${title}"`
    const inAppBody = `${startAt.toLocaleString()} · ${durationMin}m${conferenceUrl ? ' · Meet link attached' : ''}`
    afterResponse(
      () =>
        db
          .insert(schema.notifications)
          .values({
            userId: attendee.id,
            orgId,
            kind: 'meeting.scheduled',
            title: inAppTitle,
            body: inAppBody,
            href: conferenceUrl ?? null,
          })
          .then(() => {}),
      'notify attendee',
    )

    if (attendee.email) {
      const appUrl = (process.env.NEXT_PUBLIC_APP_URL ?? '').replace(/\/+$/, '')
      const dashboardUrl = appUrl ? `${appUrl}/dashboard` : null
      const linkRow = [
        conferenceUrl ? `<a href="${conferenceUrl}" style="display:inline-block;padding:10px 16px;border-radius:8px;background:#3f6b54;color:white;text-decoration:none;font-weight:600;margin-right:8px;">Join the meeting</a>` : '',
        calendarViewUrl ? `<a href="${calendarViewUrl}" style="display:inline-block;padding:10px 16px;border-radius:8px;background:white;color:#3f6b54;border:1px solid #3f6b54;text-decoration:none;font-weight:600;margin-right:8px;">Open in Google Calendar</a>` : '',
        dashboardUrl ? `<a href="${dashboardUrl}" style="display:inline-block;padding:10px 16px;border-radius:8px;background:white;color:#0f172a;border:1px solid #cbd5e1;text-decoration:none;font-weight:600;">View on MARINA</a>` : '',
      ].filter(Boolean).join('')

      void sendEmail({
        to: attendee.email,
        subject: `Meeting scheduled: ${title}`,
        html: `<p>Hi ${attendee.name ?? attendee.login},</p>
               <p><strong>${organiser.name ?? organiser.login}</strong> scheduled a meeting with you:</p>
               <p><strong>${title}</strong><br/>
               ${startAt.toLocaleString()} – ${endAt.toLocaleString()}</p>
               ${agenda ? `<p><em>Agenda:</em> ${agenda}</p>` : ''}
               <p style="margin-top:20px;">${linkRow}</p>`,
        text: `${organiser.name ?? organiser.login} scheduled "${title}" at ${startAt.toLocaleString()}.\n${
          conferenceUrl ? `\nJoin: ${conferenceUrl}\n` : ''
        }${calendarViewUrl ? `Add to your calendar: ${calendarViewUrl}\n` : ''}${
          dashboardUrl ? `View on MARINA: ${dashboardUrl}\n` : ''
        }${agenda ? `\nAgenda: ${agenda}` : ''}`,
      })
    }

    trackEvent({
      kind: 'meeting.scheduled',
      orgId,
      userId: session.appUserId,
      payload: { membershipId, durationMin, hasGoogleEvent: !!googleEventId },
    })

    return NextResponse.json({
      ok: true,
      meeting: {
        id: row.id,
        title,
        startAt: startAt.toISOString(),
        endAt: endAt.toISOString(),
        googleEventId,
        conferenceUrl,
      },
      googleError,
      // false → organiser hasn't connected Google Calendar, so the meeting is
      // in-app + email only (no Google event / Meet link). The UI nudges them.
      calendarConnected: !!calendarToken,
    })
  } catch (err) {
    if (err instanceof HttpError) {
      return NextResponse.json({ error: err.message }, { status: err.status })
    }
    console.error('schedule meeting failed', err)
    return NextResponse.json({ error: 'internal' }, { status: 500 })
  }
}
