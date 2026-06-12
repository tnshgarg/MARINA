import { and, eq, gte, isNull, lt, sql } from 'drizzle-orm'
import { db, schema } from '@/lib/db/client'

/**
 * Weekly performance ranking. Pulls the same signals the per-employee
 * review uses (shifts, deliverables, blockers, focus %) for the last
 * trailing 7 days, then ranks everyone in the org so HR can spot the
 * top performers and the struggling teammates at a glance.
 *
 * Grading is intentionally simple — we don't want to over-engineer this
 * into a black box. Each person gets a 0–100 score:
 *   focus%        0–40 pts
 *   deliverables  0–30 pts (>= 5 in a week is full)
 *   on-time rate  0–15 pts
 *   blocker tax   0–15 pts (no blockers = full; >3h stuck = 0)
 *
 * Sorted descending. The "exceptional" bucket is anyone >= 75; the
 * "struggling" bucket is anyone <= 45.
 */
export type WeeklyRow = {
  userId: number
  membershipId: number
  name: string
  login: string
  jobTitle: string | null
  discipline: string
  characterKey: string | null
  hours: number
  focusPct: number
  deliverables: number
  blockersFaced: number
  blockersHours: number
  onTimePct: number
  meetings: number
  score: number
  band: 'exceptional' | 'steady' | 'watch' | 'struggling'
  highlight: string | null  // top deliverable title, if any
}

export type WeeklyReport = {
  orgId: number
  orgName: string
  weekStart: string  // ISO date
  weekEnd: string
  rows: WeeklyRow[]
  totals: {
    members: number
    exceptional: number
    struggling: number
    deliverablesShipped: number
    blockersOpen: number
    avgFocus: number
  }
}

export async function buildWeeklyReport(orgId: number): Promise<WeeklyReport | null> {
  const org = await db.query.orgs.findFirst({ where: eq(schema.orgs.id, orgId) })
  if (!org) return null

  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const weekEnd = new Date(today.getTime() + 24 * 60 * 60 * 1000)
  const weekStart = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000)

  // Active memberships only — soft-deleted shouldn't show up in HR ranking.
  const memberships = await db
    .select({ m: schema.memberships, u: schema.users })
    .from(schema.memberships)
    .innerJoin(schema.users, eq(schema.memberships.userId, schema.users.id))
    .where(and(eq(schema.memberships.orgId, orgId), isNull(schema.memberships.endedAt)))

  if (memberships.length === 0) return null

  // Pull everyone's data in three queries instead of N*3 — much faster
  // for orgs above 20 people. We post-process in JS to bucket by user.
  const [shifts, deliverables, blockers, focus, openBlockerRows] = await Promise.all([
    db
      .select()
      .from(schema.shifts)
      .where(
        and(
          eq(schema.shifts.orgId, orgId),
          gte(schema.shifts.punchedInAt, weekStart),
          lt(schema.shifts.punchedInAt, weekEnd),
        ),
      ),
    db
      .select()
      .from(schema.deliverables)
      .where(
        and(
          eq(schema.deliverables.orgId, orgId),
          gte(schema.deliverables.completedAt, weekStart),
          lt(schema.deliverables.completedAt, weekEnd),
        ),
      ),
    db
      .select()
      .from(schema.breaks)
      .where(
        and(
          eq(schema.breaks.orgId, orgId),
          eq(schema.breaks.category, 'blocked'),
          gte(schema.breaks.startedAt, weekStart),
          lt(schema.breaks.startedAt, weekEnd),
        ),
      ),
    db
      .select({
        userId: schema.localActivity.userId,
        active: sql<number>`COALESCE(SUM(${schema.localActivity.activeSeconds}), 0)`,
        idle: sql<number>`COALESCE(SUM(${schema.localActivity.idleSeconds}), 0)`,
      })
      .from(schema.localActivity)
      .where(
        and(
          gte(schema.localActivity.windowStart, weekStart),
          lt(schema.localActivity.windowStart, weekEnd),
        ),
      )
      .groupBy(schema.localActivity.userId),
    db
      .select()
      .from(schema.breaks)
      .where(
        and(
          eq(schema.breaks.orgId, orgId),
          eq(schema.breaks.category, 'blocked'),
          isNull(schema.breaks.endedAt),
        ),
      ),
  ])

  const focusByUser = new Map(focus.map((r) => [r.userId, { active: Number(r.active), idle: Number(r.idle) }]))

  const rows: WeeklyRow[] = memberships.map(({ m, u }) => {
    const personShifts = shifts.filter((s) => s.userId === u.id)
    const personDelivs = deliverables.filter((d) => d.userId === u.id)
    const personBlockers = blockers.filter((b) => b.userId === u.id)

    const totalMin = personShifts.reduce((acc, s) => {
      const end = s.punchedOutAt ?? new Date()
      return acc + Math.max(0, Math.round((end.getTime() - s.punchedInAt.getTime()) / 60_000))
    }, 0)
    const focusRow = focusByUser.get(u.id) ?? { active: 0, idle: 0 }
    const focusPct =
      focusRow.active + focusRow.idle > 0
        ? Math.round((focusRow.active / (focusRow.active + focusRow.idle)) * 100)
        : 0

    const onTimeCount = personShifts.filter((s) => s.punchedInAt.getHours() <= org.workdayStartHour + 1).length
    const onTimePct = personShifts.length > 0 ? Math.round((onTimeCount / personShifts.length) * 100) : 0

    const blockersHours = personBlockers.reduce((acc, b) => {
      const end = b.endedAt ?? new Date()
      return acc + Math.max(0, (end.getTime() - b.startedAt.getTime()) / (60 * 60 * 1000))
    }, 0)

    // Scoring
    const focusScore = Math.min(40, Math.round((focusPct / 100) * 40))
    const deliverableScore = Math.min(30, Math.round((personDelivs.length / 5) * 30))
    const onTimeScore = Math.min(15, Math.round((onTimePct / 100) * 15))
    const blockerScore = Math.max(0, 15 - Math.round(blockersHours * 5)) // -5 pts per hour stuck
    const score = focusScore + deliverableScore + onTimeScore + blockerScore

    const band: WeeklyRow['band'] =
      score >= 75 ? 'exceptional' :
      score >= 55 ? 'steady' :
      score >= 35 ? 'watch' :
      'struggling'

    return {
      userId: u.id,
      membershipId: m.id,
      name: u.name ?? `@${u.login}`,
      login: u.login,
      jobTitle: m.jobTitle ?? null,
      discipline: m.discipline,
      characterKey: u.characterKey,
      hours: Math.round((totalMin / 60) * 10) / 10,
      focusPct,
      deliverables: personDelivs.length,
      blockersFaced: personBlockers.length,
      blockersHours: Math.round(blockersHours * 10) / 10,
      onTimePct,
      meetings: 0, // meetings query elided for speed; we can pull per-person if needed
      score,
      band,
      highlight: personDelivs[0]?.title ?? null,
    }
  })

  rows.sort((a, b) => b.score - a.score)

  const avgFocus = rows.length > 0 ? Math.round(rows.reduce((acc, r) => acc + r.focusPct, 0) / rows.length) : 0

  return {
    orgId,
    orgName: org.name,
    weekStart: weekStart.toISOString().slice(0, 10),
    weekEnd: weekEnd.toISOString().slice(0, 10),
    rows,
    totals: {
      members: rows.length,
      exceptional: rows.filter((r) => r.band === 'exceptional').length,
      struggling: rows.filter((r) => r.band === 'struggling').length,
      deliverablesShipped: deliverables.length,
      blockersOpen: openBlockerRows.length,
      avgFocus,
    },
  }
}
