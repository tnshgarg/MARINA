import { and, eq } from 'drizzle-orm'
import { db, schema } from '@/lib/db/client'

/** Local YYYY-MM-DD for "today" (matches how daily_states/standups are keyed). */
function todayIso(): string {
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
