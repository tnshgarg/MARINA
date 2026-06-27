import { and, desc, eq } from 'drizzle-orm'
import { db, schema } from '@/lib/db/client'

/** Local YYYY-MM-DD for "today" (matches how daily_states/standups are keyed). */
export function todayIso(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/**
 * Persist today's standup (one row per user per day; re-submitting updates it).
 * Channel-agnostic — Slack writes here and the web Scrum page reads it.
 */
export async function saveStandup(input: {
  orgId: number
  userId: number
  yesterday: string
  today: string
  blockers: string
  source?: 'slack' | 'web'
  mentions?: number[]
}): Promise<void> {
  const day = todayIso()
  const existing = await db.query.standups.findFirst({
    where: and(eq(schema.standups.userId, input.userId), eq(schema.standups.day, day)),
  })
  const values = {
    yesterday: input.yesterday.slice(0, 4000),
    today: input.today.slice(0, 4000),
    blockers: input.blockers.slice(0, 4000),
    source: input.source ?? 'slack',
    mentions: Array.isArray(input.mentions) ? Array.from(new Set(input.mentions.filter((n) => Number.isInteger(n)))).slice(0, 30) : [],
  }
  if (existing) {
    await db.update(schema.standups).set(values).where(eq(schema.standups.id, existing.id))
  } else {
    await db.insert(schema.standups).values({ orgId: input.orgId, userId: input.userId, day, ...values })
  }
}

/** Today's standup for one user, or null if they haven't submitted. */
export async function getTodayStandup(
  userId: number,
): Promise<{ yesterday: string; today: string; blockers: string } | null> {
  const row = await db.query.standups.findFirst({
    where: and(eq(schema.standups.userId, userId), eq(schema.standups.day, todayIso())),
  })
  return row ? { yesterday: row.yesterday, today: row.today, blockers: row.blockers } : null
}

/** Block Kit rendering of a standup for a channel post (shared by Slack + web). */
export function standupBlocks(
  name: string,
  s: { yesterday: string; today: string; blockers: string },
): unknown[] {
  return [
    { type: 'section', text: { type: 'mrkdwn', text: `*${name}'s standup*` } },
    { type: 'section', text: { type: 'mrkdwn', text: `*Yesterday*\n${s.yesterday || '—'}` } },
    { type: 'section', text: { type: 'mrkdwn', text: `*Today*\n${s.today || '—'}` } },
    ...(s.blockers ? [{ type: 'section', text: { type: 'mrkdwn', text: `*Blockers*\n${s.blockers}` } }] : []),
  ]
}

/** Set of userIds in the org who have already submitted a standup today. */
export async function usersWithStandupToday(orgId: number): Promise<Set<number>> {
  const rows = await db
    .select({ userId: schema.standups.userId })
    .from(schema.standups)
    .where(and(eq(schema.standups.orgId, orgId), eq(schema.standups.day, todayIso())))
  return new Set(rows.map((r) => r.userId))
}

/** A user's recent standups, newest first — powers the "previous days" list. */
export async function recentStandupsForUser(userId: number, limit = 21) {
  return db
    .select()
    .from(schema.standups)
    .where(eq(schema.standups.userId, userId))
    .orderBy(desc(schema.standups.day))
    .limit(limit)
}

/** Every standup in the org for a given day (content per user). */
export async function standupsForOrgDay(orgId: number, day: string) {
  return db
    .select()
    .from(schema.standups)
    .where(and(eq(schema.standups.orgId, orgId), eq(schema.standups.day, day)))
}
