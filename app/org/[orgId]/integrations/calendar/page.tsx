import { notFound } from 'next/navigation'
import { and, desc, eq, gte, isNotNull, isNull, lt } from 'drizzle-orm'
import { auth } from '@/auth'
import { db, schema } from '@/lib/db/client'
import CalendarHubClient from './client'

export const dynamic = 'force-dynamic'

const DAY_MS = 24 * 60 * 60 * 1000

/**
 * Calendar integration detail — the viewer's own Google Calendar, surfaced as a
 * full workspace tab: today / tomorrow / upcoming meetings, a past-meeting
 * count + recent history, sync, and "schedule a meeting with anyone".
 */
export default async function CalendarHubPage({
  params,
}: {
  params: Promise<{ orgId: string }>
}) {
  const { orgId: raw } = await params
  const orgId = Number(raw)
  if (!Number.isInteger(orgId)) notFound()

  const session = await auth()
  if (!session?.appUserId) notFound()
  const userId = session.appUserId

  const googleAccount = await db.query.accounts.findFirst({
    where: and(
      eq(schema.accounts.userId, userId),
      eq(schema.accounts.provider, 'google'),
      isNotNull(schema.accounts.access_token),
    ),
  })
  const connected = !!googleAccount

  const now = new Date()
  const todayMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate())

  const [upcoming, pastRecent, pastCountRows] = await Promise.all([
    db
      .select()
      .from(schema.meetings)
      .where(and(eq(schema.meetings.userId, userId), gte(schema.meetings.startAt, todayMidnight)))
      .orderBy(schema.meetings.startAt)
      .limit(60),
    db
      .select()
      .from(schema.meetings)
      .where(and(eq(schema.meetings.userId, userId), lt(schema.meetings.startAt, now)))
      .orderBy(desc(schema.meetings.startAt))
      .limit(8),
    db
      .select({ id: schema.meetings.id })
      .from(schema.meetings)
      .where(and(eq(schema.meetings.userId, userId), lt(schema.meetings.startAt, now))),
  ])

  // Active teammates for the "schedule with anyone" picker.
  const teammates = await db
    .select({ membershipId: schema.memberships.id, name: schema.users.name, login: schema.users.login, userId: schema.users.id })
    .from(schema.memberships)
    .innerJoin(schema.users, eq(schema.memberships.userId, schema.users.id))
    .where(and(eq(schema.memberships.orgId, orgId), isNull(schema.memberships.endedAt)))

  const ser = (m: typeof upcoming[number]) => ({
    id: m.id,
    title: m.title,
    startAt: m.startAt.toISOString(),
    endAt: m.endAt.toISOString(),
    location: m.location,
    conferenceUrl: m.conferenceUrl,
    rsvpStatus: m.rsvpStatus,
    attendeeCount: Array.isArray(m.attendees) ? m.attendees.length : 0,
  })

  const todayEnd = new Date(todayMidnight.getTime() + DAY_MS)
  const tomorrowEnd = new Date(todayMidnight.getTime() + 2 * DAY_MS)
  const todayMeetings = upcoming.filter((m) => m.startAt < todayEnd).map(ser)
  const tomorrowMeetings = upcoming.filter((m) => m.startAt >= todayEnd && m.startAt < tomorrowEnd).map(ser)
  const laterMeetings = upcoming.filter((m) => m.startAt >= tomorrowEnd).map(ser)

  return (
    <CalendarHubClient
      orgId={orgId}
      connected={connected}
      today={todayMeetings}
      tomorrow={tomorrowMeetings}
      later={laterMeetings}
      pastRecent={pastRecent.map(ser)}
      pastCount={pastCountRows.length}
      teammates={teammates
        .filter((t) => t.userId !== userId)
        .map((t) => ({ membershipId: t.membershipId, name: t.name ?? `@${t.login}` }))}
    />
  )
}
