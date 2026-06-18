import { and, desc, eq, gte, isNull } from 'drizzle-orm'
import { db, schema } from '@/lib/db/client'
import { leaveBalanceForUser } from '@/lib/leave/balance'

/**
 * Channel-agnostic personal brief for one user in one org. Powers the Slack
 * App Home "my day" panel (and reusable by any future surface). Read-only.
 */
export type PersonalBrief = {
  activeShift: { id: number; sinceMin: number } | null
  deliverablesToday: { count: number; titles: string[] }
  myBlockers: { reason: string; sinceMin: number }[]
  leave: { type: string; remaining: number; quota: number } | null
  pendingLeaves: number
}

export async function getPersonalBrief(userId: number, orgId: number): Promise<PersonalBrief> {
  const shift = await db.query.shifts.findFirst({
    where: and(eq(schema.shifts.userId, userId), isNull(schema.shifts.punchedOutAt)),
  })

  const startOfDay = new Date()
  startOfDay.setHours(0, 0, 0, 0)
  const delivs = await db
    .select({ title: schema.deliverables.title })
    .from(schema.deliverables)
    .where(and(eq(schema.deliverables.userId, userId), gte(schema.deliverables.completedAt, startOfDay)))
    .orderBy(desc(schema.deliverables.completedAt))

  const blockers = await db
    .select()
    .from(schema.breaks)
    .where(
      and(
        eq(schema.breaks.userId, userId),
        eq(schema.breaks.category, 'blocked'),
        isNull(schema.breaks.endedAt),
      ),
    )

  const pending = await db
    .select({ id: schema.leaveRequests.id })
    .from(schema.leaveRequests)
    .where(
      and(
        eq(schema.leaveRequests.userId, userId),
        eq(schema.leaveRequests.orgId, orgId),
        eq(schema.leaveRequests.status, 'pending'),
      ),
    )

  const org = await db.query.orgs.findFirst({ where: eq(schema.orgs.id, orgId) })
  const balance = await leaveBalanceForUser(userId, orgId, org?.leavePolicy ?? null)
  const headline = balance.rows.find((r) => r.type === 'casual') ?? balance.rows[0] ?? null

  return {
    activeShift: shift
      ? { id: shift.id, sinceMin: Math.floor((Date.now() - new Date(shift.punchedInAt).getTime()) / 60000) }
      : null,
    deliverablesToday: { count: delivs.length, titles: delivs.slice(0, 5).map((d) => d.title) },
    myBlockers: blockers.map((b) => ({
      reason: b.reason,
      sinceMin: Math.floor((Date.now() - new Date(b.startedAt).getTime()) / 60000),
    })),
    leave: headline ? { type: headline.type, remaining: headline.remaining, quota: headline.quota } : null,
    pendingLeaves: pending.length,
  }
}
