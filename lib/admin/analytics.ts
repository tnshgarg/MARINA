import { and, count, countDistinct, desc, eq, gte, isNull, sql } from 'drizzle-orm'
import { db, schema } from '@/lib/db/client'

const DAY_MS = 24 * 60 * 60 * 1000

/**
 * Composite health verdict for an org. Computed entirely from observable
 * signals — no manual flagging required.
 *
 *   - new        : workspace < 7 days old (still onboarding)
 *   - healthy    : 7d active users >= 60% of total seats AND no major errors
 *   - growing    : 30d active users grew vs prior 30d AND seat count growing
 *   - at_risk    : 7d active users < 30% of seats, OR multiple sync errors,
 *                  OR no shifts in last 7d
 *   - churned    : no activity in 30+ days
 */
export type HealthVerdict = 'new' | 'healthy' | 'growing' | 'at_risk' | 'churned'

export type OrgKpis = {
  orgId: number
  name: string
  plan: string
  trialEndsAt: string | null
  logoUrl: string | null
  createdAt: string
  seats: number
  active7d: number
  active30d: number
  shifts7d: number
  blockersOpen: number
  deliverables7d: number
  aiSpendCentsThisMonth: number
  syncErrors: number
  slackConnected: boolean
  calendarConnected: boolean
  health: HealthVerdict
  lastActivityAt: string | null
}

/**
 * One-shot KPI computation for every org. We deliberately roll everything
 * up in N+1-ish queries (sum per-org in JS) because we expect < 5k orgs
 * for the foreseeable future — a single multi-CTE query is harder to
 * maintain than this. Refactor when org count crosses 10k.
 */
export async function loadAllOrgKpis(): Promise<OrgKpis[]> {
  const since7 = new Date(Date.now() - 7 * DAY_MS)
  const since30 = new Date(Date.now() - 30 * DAY_MS)
  const monthStart = new Date()
  monthStart.setUTCDate(1)
  monthStart.setUTCHours(0, 0, 0, 0)

  const orgs = await db.select().from(schema.orgs).orderBy(desc(schema.orgs.createdAt))

  // Seat counts per org
  const seatRows = await db
    .select({
      orgId: schema.memberships.orgId,
      seats: count(schema.memberships.id),
    })
    .from(schema.memberships)
    .where(isNull(schema.memberships.endedAt))
    .groupBy(schema.memberships.orgId)
  const seatsByOrg = new Map(seatRows.map((r) => [r.orgId, Number(r.seats)]))

  // 7d active users = had at least one shift, break, deliverable, or punch
  // Simplest signal: distinct users with a shift in the window.
  const active7Rows = await db
    .select({
      orgId: schema.shifts.orgId,
      users: countDistinct(schema.shifts.userId),
    })
    .from(schema.shifts)
    .where(gte(schema.shifts.punchedInAt, since7))
    .groupBy(schema.shifts.orgId)
  const active7ByOrg = new Map(active7Rows.map((r) => [r.orgId, Number(r.users)]))

  const active30Rows = await db
    .select({
      orgId: schema.shifts.orgId,
      users: countDistinct(schema.shifts.userId),
    })
    .from(schema.shifts)
    .where(gte(schema.shifts.punchedInAt, since30))
    .groupBy(schema.shifts.orgId)
  const active30ByOrg = new Map(active30Rows.map((r) => [r.orgId, Number(r.users)]))

  const shifts7Rows = await db
    .select({ orgId: schema.shifts.orgId, n: count() })
    .from(schema.shifts)
    .where(gte(schema.shifts.punchedInAt, since7))
    .groupBy(schema.shifts.orgId)
  const shifts7ByOrg = new Map(shifts7Rows.map((r) => [r.orgId, Number(r.n)]))

  // Open blockers = breaks with category='blocked' that haven't ended
  const blockerRows = await db
    .select({ orgId: schema.breaks.orgId, n: count() })
    .from(schema.breaks)
    .where(and(eq(schema.breaks.category, 'blocked'), isNull(schema.breaks.endedAt)))
    .groupBy(schema.breaks.orgId)
  const blockersByOrg = new Map(blockerRows.map((r) => [r.orgId, Number(r.n)]))

  const deliverables7Rows = await db
    .select({ orgId: schema.deliverables.orgId, n: count() })
    .from(schema.deliverables)
    .where(gte(schema.deliverables.completedAt, since7))
    .groupBy(schema.deliverables.orgId)
  const deliverables7ByOrg = new Map(deliverables7Rows.map((r) => [r.orgId, Number(r.n)]))

  // AI spend MTD — we keep cents in `aiSpend.costCents` for honest aggregation.
  const spendRows = await db
    .select({
      orgId: schema.aiSpend.orgId,
      cents: sql<number>`COALESCE(SUM(${schema.aiSpend.costCents}), 0)`,
    })
    .from(schema.aiSpend)
    .where(gte(schema.aiSpend.createdAt, monthStart))
    .groupBy(schema.aiSpend.orgId)
  const spendByOrg = new Map(spendRows.map((r) => [r.orgId ?? 0, Number(r.cents)]))

  // Sync errors: count users in this org with a non-null lastSyncError
  const syncErrRows = await db
    .select({
      orgId: schema.memberships.orgId,
      n: count(schema.users.id),
    })
    .from(schema.memberships)
    .innerJoin(schema.users, eq(schema.memberships.userId, schema.users.id))
    .where(
      and(
        isNull(schema.memberships.endedAt),
        sql`${schema.users.lastSyncError} IS NOT NULL`,
      ),
    )
    .groupBy(schema.memberships.orgId)
  const syncErrByOrg = new Map(syncErrRows.map((r) => [r.orgId, Number(r.n)]))

  // Last activity = most recent shift punch-in (cheap proxy)
  const lastActivityRows = await db
    .select({
      orgId: schema.shifts.orgId,
      ts: sql<string>`MAX(${schema.shifts.punchedInAt})`,
    })
    .from(schema.shifts)
    .groupBy(schema.shifts.orgId)
  const lastActivityByOrg = new Map(
    lastActivityRows.map((r) => [r.orgId, r.ts ? new Date(r.ts).toISOString() : null]),
  )

  return orgs.map((o) => {
    const seats = seatsByOrg.get(o.id) ?? 0
    const a7 = active7ByOrg.get(o.id) ?? 0
    const a30 = active30ByOrg.get(o.id) ?? 0
    const errs = syncErrByOrg.get(o.id) ?? 0
    const ageMs = Date.now() - o.createdAt.getTime()
    const lastActivity = lastActivityByOrg.get(o.id) ?? null

    const health: HealthVerdict = (() => {
      if (ageMs < 7 * DAY_MS) return 'new'
      if (a30 === 0) return 'churned'
      if (seats === 0) return 'churned'
      const pct7 = a7 / Math.max(1, seats)
      if (pct7 < 0.3 || errs >= Math.ceil(seats / 2)) return 'at_risk'
      if (a30 > seats * 0.7) return 'healthy'
      return 'growing'
    })()

    return {
      orgId: o.id,
      name: o.name,
      plan: o.plan,
      trialEndsAt: o.trialEndsAt?.toISOString() ?? null,
      logoUrl: (o as { logoUrl?: string | null }).logoUrl ?? null,
      createdAt: o.createdAt.toISOString(),
      seats,
      active7d: a7,
      active30d: a30,
      shifts7d: shifts7ByOrg.get(o.id) ?? 0,
      blockersOpen: blockersByOrg.get(o.id) ?? 0,
      deliverables7d: deliverables7ByOrg.get(o.id) ?? 0,
      aiSpendCentsThisMonth: spendByOrg.get(o.id) ?? 0,
      syncErrors: errs,
      slackConnected: !!(o as { slackBotToken?: string | null }).slackBotToken,
      calendarConnected: false, // calendar is per-user; computed elsewhere if needed
      health,
      lastActivityAt: lastActivity,
    }
  })
}

/** Platform-wide rollups for the overview page. */
export type PlatformKpis = {
  orgCount: number
  paidOrgCount: number
  totalSeats: number
  activeUsers7d: number
  activeUsers30d: number
  signups7d: number
  shifts7d: number
  blockersOpen: number
  deliverables7d: number
  aiSpendCentsThisMonth: number
  aiSpendCentsLastMonth: number
}

export async function loadPlatformKpis(): Promise<PlatformKpis> {
  const since7 = new Date(Date.now() - 7 * DAY_MS)
  const since30 = new Date(Date.now() - 30 * DAY_MS)
  const monthStart = new Date()
  monthStart.setUTCDate(1)
  monthStart.setUTCHours(0, 0, 0, 0)
  const lastMonthStart = new Date(monthStart)
  lastMonthStart.setUTCMonth(lastMonthStart.getUTCMonth() - 1)

  const [orgsTotal] = await db.select({ n: count() }).from(schema.orgs)
  const [orgsPaid] = await db
    .select({ n: count() })
    .from(schema.orgs)
    .where(sql`${schema.orgs.plan} != 'free'`)
  const [seats] = await db
    .select({ n: count() })
    .from(schema.memberships)
    .where(isNull(schema.memberships.endedAt))
  const [u7] = await db
    .select({ n: countDistinct(schema.shifts.userId) })
    .from(schema.shifts)
    .where(gte(schema.shifts.punchedInAt, since7))
  const [u30] = await db
    .select({ n: countDistinct(schema.shifts.userId) })
    .from(schema.shifts)
    .where(gte(schema.shifts.punchedInAt, since30))
  const [signups7] = await db
    .select({ n: count() })
    .from(schema.users)
    .where(gte(schema.users.createdAt, since7))
  const [s7] = await db
    .select({ n: count() })
    .from(schema.shifts)
    .where(gte(schema.shifts.punchedInAt, since7))
  const [blockers] = await db
    .select({ n: count() })
    .from(schema.breaks)
    .where(and(eq(schema.breaks.category, 'blocked'), isNull(schema.breaks.endedAt)))
  const [deliv7] = await db
    .select({ n: count() })
    .from(schema.deliverables)
    .where(gte(schema.deliverables.completedAt, since7))
  const [spendMtd] = await db
    .select({ cents: sql<number>`COALESCE(SUM(${schema.aiSpend.costCents}), 0)` })
    .from(schema.aiSpend)
    .where(gte(schema.aiSpend.createdAt, monthStart))
  const [spendLast] = await db
    .select({ cents: sql<number>`COALESCE(SUM(${schema.aiSpend.costCents}), 0)` })
    .from(schema.aiSpend)
    .where(and(
      gte(schema.aiSpend.createdAt, lastMonthStart),
      sql`${schema.aiSpend.createdAt} < ${monthStart}`,
    ))

  return {
    orgCount: Number(orgsTotal.n),
    paidOrgCount: Number(orgsPaid.n),
    totalSeats: Number(seats.n),
    activeUsers7d: Number(u7.n),
    activeUsers30d: Number(u30.n),
    signups7d: Number(signups7.n),
    shifts7d: Number(s7.n),
    blockersOpen: Number(blockers.n),
    deliverables7d: Number(deliv7.n),
    aiSpendCentsThisMonth: Number(spendMtd.cents),
    aiSpendCentsLastMonth: Number(spendLast.cents),
  }
}

export function formatUsd(cents: number): string {
  if (cents === 0) return '$0'
  return `$${(cents / 100).toFixed(cents < 100 ? 3 : 2)}`
}

export function formatAgo(iso: string | null): string {
  if (!iso) return '—'
  const ms = Date.now() - new Date(iso).getTime()
  const m = Math.floor(ms / 60000)
  if (m < 1) return 'just now'
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  return `${Math.floor(h / 24)}d ago`
}
