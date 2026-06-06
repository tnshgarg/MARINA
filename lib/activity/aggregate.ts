import { and, eq, gte, lte, inArray, sum, sql } from 'drizzle-orm'
import { db, schema } from '@/lib/db/client'

export type DailySummary = {
  userId: number
  activeSeconds: number
  idleSeconds: number
  sampleCount: number
  topApps: Array<{ app: string; seconds: number }>
}

export function dayBounds(date = new Date()): { start: Date; end: Date } {
  const start = new Date(date)
  start.setHours(0, 0, 0, 0)
  const end = new Date(start)
  end.setDate(end.getDate() + 1)
  return { start, end }
}

export async function getDailySummary(userId: number, date = new Date()): Promise<DailySummary> {
  const { start, end } = dayBounds(date)
  const [totals, byApp] = await Promise.all([
    db
      .select({
        activeSeconds: sum(schema.localActivity.activeSeconds).mapWith(Number),
        idleSeconds: sum(schema.localActivity.idleSeconds).mapWith(Number),
        sampleCount: sum(schema.localActivity.sampleCount).mapWith(Number),
      })
      .from(schema.localActivity)
      .where(
        and(
          eq(schema.localActivity.userId, userId),
          gte(schema.localActivity.windowStart, start),
          lte(schema.localActivity.windowStart, end)
        )
      ),
    db
      .select({
        app: schema.localActivity.activeApp,
        seconds: sum(schema.localActivity.activeSeconds).mapWith(Number),
      })
      .from(schema.localActivity)
      .where(
        and(
          eq(schema.localActivity.userId, userId),
          gte(schema.localActivity.windowStart, start),
          lte(schema.localActivity.windowStart, end)
        )
      )
      .groupBy(schema.localActivity.activeApp)
      .orderBy(sql`2 desc`)
      .limit(5),
  ])
  const t = totals[0]
  return {
    userId,
    activeSeconds: Number(t?.activeSeconds ?? 0),
    idleSeconds: Number(t?.idleSeconds ?? 0),
    sampleCount: Number(t?.sampleCount ?? 0),
    topApps: byApp.map((a) => ({ app: a.app, seconds: Number(a.seconds ?? 0) })),
  }
}

export type CompactSummary = {
  userId: number
  activeSeconds: number
  idleSeconds: number
  topApp: string | null
}

export async function getCompactSummaries(
  userIds: number[],
  date = new Date()
): Promise<Map<number, CompactSummary>> {
  const out = new Map<number, CompactSummary>()
  if (userIds.length === 0) return out
  const { start, end } = dayBounds(date)

  const totals = await db
    .select({
      userId: schema.localActivity.userId,
      activeSeconds: sum(schema.localActivity.activeSeconds).mapWith(Number),
      idleSeconds: sum(schema.localActivity.idleSeconds).mapWith(Number),
    })
    .from(schema.localActivity)
    .where(
      and(
        inArray(schema.localActivity.userId, userIds),
        gte(schema.localActivity.windowStart, start),
        lte(schema.localActivity.windowStart, end)
      )
    )
    .groupBy(schema.localActivity.userId)

  for (const t of totals) {
    out.set(t.userId, {
      userId: t.userId,
      activeSeconds: Number(t.activeSeconds ?? 0),
      idleSeconds: Number(t.idleSeconds ?? 0),
      topApp: null,
    })
  }

  // Best-effort: fetch top app per user via a window function.
  const topApps = await db
    .select({
      userId: schema.localActivity.userId,
      app: schema.localActivity.activeApp,
      seconds: sum(schema.localActivity.activeSeconds).mapWith(Number),
      rank: sql<number>`row_number() over (partition by ${schema.localActivity.userId} order by sum(${schema.localActivity.activeSeconds}) desc)`,
    })
    .from(schema.localActivity)
    .where(
      and(
        inArray(schema.localActivity.userId, userIds),
        gte(schema.localActivity.windowStart, start),
        lte(schema.localActivity.windowStart, end)
      )
    )
    .groupBy(schema.localActivity.userId, schema.localActivity.activeApp)

  for (const r of topApps) {
    if (r.rank === 1) {
      const existing = out.get(r.userId)
      if (existing) existing.topApp = r.app
    }
  }

  return out
}

export function formatDuration(seconds: number): string {
  if (seconds <= 0) return '0m'
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  if (h > 0) return `${h}h ${m}m`
  return `${m}m`
}
