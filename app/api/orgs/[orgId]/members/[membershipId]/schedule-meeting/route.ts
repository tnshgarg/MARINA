import { NextResponse } from 'next/server'
import { and, eq, isNull } from 'drizzle-orm'
import { db, schema } from '@/lib/db/client'
import { HttpError, requireMembership } from '@/lib/auth/guards'
import { sendEmail } from '@/lib/email/send'
import { afterResponse } from '@/lib/after'

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
    const { session } = await requireMembership(orgId, 'manager')

    const target = await db.query.memberships.findFirst({
      where: and(
        eq(schema.memberships.id, membershipId),
        eq(schema.memberships.orgId, orgId),
        isNull(schema.memberships.endedAt),
      ),
    })
    if (!target) return NextResponse.json({ error: 'membership not found' }, { status: 404 })
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

    // GATE: the organiser MUST have Google Calendar connected. Without it
    // we'd just create a row in our DB that nobody sees on a real calendar —
    // and the attendee has no way to "add to my calendar". Make them connect
    // first; the UI surfaces a clear CTA when this 412 is returned.
    const calendarAccount = await db.query.accounts.findFirst({
      where: and(
        eq(schema.accounts.userId, session.appUserId),
        eq(schema.accounts.provider, 'google'),
      ),
    })
    if (!calendarAccount?.access_token) {
      return NextResponse.json(
        {
          error: 'calendar_not_connected',
          message:
            'Connect Google Calendar from Settings → Integrations before scheduling. We need it to put the meeting on both of your calendars.',
        },
        { status: 412 },
      )
    }

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
    try {
      const insertRes = await fetch(
        'https://www.googleapis.com/calendar/v3/calendars/primary/events?conferenceDataVersion=1&sendUpdates=all',
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${calendarAccount.access_token}`,
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
    })
  } catch (err) {
    if (err instanceof HttpError) {
      return NextResponse.json({ error: err.message }, { status: err.status })
    }
    console.error('schedule meeting failed', err)
    return NextResponse.json({ error: 'internal' }, { status: 500 })
  }
}
