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

    // Best-effort push to Google Calendar when the organiser has it linked.
    let googleEventId: string | null = null
    let conferenceUrl: string | null = null
    let googleError: string | null = null
    try {
      const account = await db.query.accounts.findFirst({
        where: and(
          eq(schema.accounts.userId, session.appUserId),
          eq(schema.accounts.provider, 'google'),
        ),
      })
      if (account?.access_token && attendee.email) {
        const insertRes = await fetch(
          'https://www.googleapis.com/calendar/v3/calendars/primary/events?conferenceDataVersion=1&sendUpdates=all',
          {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${account.access_token}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              summary: title,
              description: agenda ?? 'Scheduled from MARINA.',
              start: { dateTime: startAt.toISOString() },
              end: { dateTime: endAt.toISOString() },
              attendees: [{ email: attendee.email }],
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
          await db
            .update(schema.scheduledMeetings)
            .set({ googleEventId, conferenceUrl })
            .where(eq(schema.scheduledMeetings.id, row.id))
        } else {
          googleError = `Calendar insert failed: ${insertRes.status}`
        }
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
      void sendEmail({
        to: attendee.email,
        subject: `Meeting scheduled: ${title}`,
        html: `<p>Hi ${attendee.name ?? attendee.login},</p>
               <p><strong>${organiser.name ?? organiser.login}</strong> scheduled a meeting with you:</p>
               <p><strong>${title}</strong><br/>
               ${startAt.toLocaleString()} – ${endAt.toLocaleString()}</p>
               ${agenda ? `<p><em>Agenda:</em> ${agenda}</p>` : ''}
               ${conferenceUrl ? `<p><a href="${conferenceUrl}">Join the meeting</a></p>` : ''}
               <p>You'll find it on your MARINA dashboard.</p>`,
        text: `${organiser.name ?? organiser.login} scheduled "${title}" at ${startAt.toLocaleString()}.\n${
          conferenceUrl ? `\nJoin: ${conferenceUrl}\n` : ''
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
