import { and, asc, desc, eq, gte, isNull, lt, or } from 'drizzle-orm'
import { db, schema } from '@/lib/db/client'

/**
 * Upcoming / recent meetings for a user, drawn from `scheduled_meetings`
 * (Marina-created 1:1s and team meetings). Multi-member meetings are stored as
 * one row per attendee sharing a `googleEventId`; we dedupe on that so a team
 * meeting shows once.
 */
export type MeetingCard = {
  id: number
  title: string
  agenda: string | null
  startAt: string
  endAt: string
  conferenceUrl: string | null
  role: 'organiser' | 'attendee'
}

function dedupe(rows: (typeof schema.scheduledMeetings.$inferSelect)[], userId: number, limit: number): MeetingCard[] {
  const seen = new Set<string>()
  const out: MeetingCard[] = []
  for (const r of rows) {
    const key = r.googleEventId ?? `id-${r.id}`
    if (seen.has(key)) continue
    seen.add(key)
    out.push({
      id: r.id,
      title: r.title,
      agenda: r.agenda,
      startAt: r.startAt.toISOString(),
      endAt: r.endAt.toISOString(),
      conferenceUrl: r.conferenceUrl,
      role: r.organiserUserId === userId ? 'organiser' : 'attendee',
    })
    if (out.length >= limit) break
  }
  return out
}

export async function upcomingMeetingsForUser(userId: number, limit = 25): Promise<MeetingCard[]> {
  const now = new Date()
  const rows = await db
    .select()
    .from(schema.scheduledMeetings)
    .where(
      and(
        isNull(schema.scheduledMeetings.cancelledAt),
        gte(schema.scheduledMeetings.endAt, now),
        or(
          eq(schema.scheduledMeetings.organiserUserId, userId),
          eq(schema.scheduledMeetings.attendeeUserId, userId),
        ),
      ),
    )
    .orderBy(asc(schema.scheduledMeetings.startAt))
  return dedupe(rows, userId, limit)
}

export async function pastMeetingsForUser(userId: number, limit = 15): Promise<MeetingCard[]> {
  const now = new Date()
  const rows = await db
    .select()
    .from(schema.scheduledMeetings)
    .where(
      and(
        isNull(schema.scheduledMeetings.cancelledAt),
        lt(schema.scheduledMeetings.endAt, now),
        or(
          eq(schema.scheduledMeetings.organiserUserId, userId),
          eq(schema.scheduledMeetings.attendeeUserId, userId),
        ),
      ),
    )
    .orderBy(desc(schema.scheduledMeetings.startAt))
  return dedupe(rows, userId, limit)
}

export async function nextMeetingForUser(userId: number): Promise<MeetingCard | null> {
  const list = await upcomingMeetingsForUser(userId, 1)
  return list[0] ?? null
}
