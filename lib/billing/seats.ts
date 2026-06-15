import { and, count, eq, isNull } from 'drizzle-orm'
import { db, schema } from '@/lib/db/client'
import { planFor } from '@/lib/billing/plans'

/**
 * Single source of truth for seat-cap enforcement. Used at BOTH invite
 * creation and invite acceptance — the accept-time check matters because
 * pending invites created before a plan downgrade (or accepted concurrently)
 * would otherwise push an org past its plan.
 *
 * `usedSeats` = active memberships + outstanding (unaccepted) invites, so we
 * never sell the same seat twice.
 *
 * Pass `includePendingInvites: false` at accept time if you want to count only
 * realized members (the invite being accepted is already in the pending count,
 * so we exclude pending there to avoid off-by-one).
 */
export async function seatUsage(orgId: number, opts?: { includePendingInvites?: boolean }): Promise<{
  used: number
  cap: number
  planKey: string
}> {
  const org = await db.query.orgs.findFirst({ where: eq(schema.orgs.id, orgId) })
  const plan = planFor(org?.plan)
  const cap = plan.seatCap ?? org?.seatsPurchased ?? plan.seatCap ?? 5
  const includePending = opts?.includePendingInvites ?? true

  const [activeMembers, pendingInvites] = await Promise.all([
    db
      .select({ n: count() })
      .from(schema.memberships)
      .where(and(eq(schema.memberships.orgId, orgId), isNull(schema.memberships.endedAt))),
    includePending
      ? db
          .select({ n: count() })
          .from(schema.invites)
          .where(and(eq(schema.invites.orgId, orgId), isNull(schema.invites.acceptedAt)))
      : Promise.resolve([{ n: 0 }] as Array<{ n: number }>),
  ])

  const used = Number(activeMembers[0]?.n ?? 0) + Number(pendingInvites[0]?.n ?? 0)
  return { used, cap, planKey: plan.key }
}

/**
 * Returns a human error string if adding one more member would exceed the cap,
 * else null. At accept time we count active members only (the invite being
 * redeemed is about to flip from pending → active, so counting it as both would
 * be a double-count).
 */
export async function seatCapError(orgId: number): Promise<string | null> {
  const { used, cap } = await seatUsage(orgId, { includePendingInvites: false })
  if (used >= cap) {
    return `This workspace is at its seat limit (${used}/${cap}). Ask an admin to upgrade the plan before adding more members.`
  }
  return null
}
