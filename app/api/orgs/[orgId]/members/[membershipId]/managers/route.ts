import { NextResponse } from 'next/server'
import { and, eq } from 'drizzle-orm'
import { db, schema } from '@/lib/db/client'
import { HttpError, requireCapability } from '@/lib/auth/guards'

export const runtime = 'nodejs'

/**
 * Reports-to manager management. Replaces the single-manager
 * `reportsToMembershipId` column with a many-to-many join so a person can
 * have several bosses (matrix orgs).
 *
 * Endpoints:
 *   - POST   add a manager
 *   - DELETE remove a manager
 *
 * Both gated on `manage_members`. We also keep `reportsToMembershipId`
 * in sync as the "primary" — whichever manager was added first, or
 * whichever is left after the last removal.
 */
export async function POST(req: Request, ctx: { params: Promise<{ orgId: string; membershipId: string }> }) {
  const { orgId: rawO, membershipId: rawM } = await ctx.params
  const orgId = Number(rawO)
  const membershipId = Number(rawM)
  if (!Number.isInteger(orgId) || !Number.isInteger(membershipId)) {
    return NextResponse.json({ error: 'invalid ids' }, { status: 400 })
  }

  try {
    await requireCapability(orgId, 'manage_members')
    const body = (await req.json().catch(() => ({}))) as { managerMembershipId?: number }
    const managerId = body.managerMembershipId
    if (typeof managerId !== 'number' || managerId === membershipId) {
      return NextResponse.json({ error: 'invalid managerMembershipId' }, { status: 400 })
    }

    // Validate both rows belong to the org.
    const both = await db
      .select({ id: schema.memberships.id })
      .from(schema.memberships)
      .where(eq(schema.memberships.orgId, orgId))
    const ids = new Set(both.map((b) => b.id))
    if (!ids.has(membershipId) || !ids.has(managerId)) {
      return NextResponse.json({ error: 'memberships not in this org' }, { status: 400 })
    }

    // Cycle guard: walk the manager's chain to make sure we don't create
    // A → B → A. We only check the new edge — pre-existing cycles are
    // out of scope (and can't happen unless someone hand-edits the DB).
    if (await wouldCycle(managerId, membershipId)) {
      return NextResponse.json({ error: 'that would create a reports-to cycle' }, { status: 400 })
    }

    await db
      .insert(schema.membershipManagers)
      .values({ membershipId, managerMembershipId: managerId })
      .onConflictDoNothing()

    // Keep `reportsToMembershipId` synced as "primary" manager. We set it
    // to the manager we just added if the membership had no primary, so
    // any code still reading the legacy column keeps working.
    const sub = await db.query.memberships.findFirst({
      where: eq(schema.memberships.id, membershipId),
    })
    if (sub && !sub.reportsToMembershipId) {
      await db
        .update(schema.memberships)
        .set({ reportsToMembershipId: managerId })
        .where(eq(schema.memberships.id, membershipId))
    }

    return NextResponse.json({ ok: true })
  } catch (e) {
    if (e instanceof HttpError) {
      return NextResponse.json({ error: e.message }, { status: e.status })
    }
    console.error('[membership.managers POST]', e)
    return NextResponse.json({ error: 'internal' }, { status: 500 })
  }
}

export async function DELETE(req: Request, ctx: { params: Promise<{ orgId: string; membershipId: string }> }) {
  const { orgId: rawO, membershipId: rawM } = await ctx.params
  const orgId = Number(rawO)
  const membershipId = Number(rawM)
  if (!Number.isInteger(orgId) || !Number.isInteger(membershipId)) {
    return NextResponse.json({ error: 'invalid ids' }, { status: 400 })
  }
  try {
    await requireCapability(orgId, 'manage_members')
    const body = (await req.json().catch(() => ({}))) as { managerMembershipId?: number }
    const managerId = body.managerMembershipId
    if (typeof managerId !== 'number') {
      return NextResponse.json({ error: 'managerMembershipId required' }, { status: 400 })
    }
    await db
      .delete(schema.membershipManagers)
      .where(
        and(
          eq(schema.membershipManagers.membershipId, membershipId),
          eq(schema.membershipManagers.managerMembershipId, managerId),
        ),
      )

    // If we just removed the primary, pick any remaining manager as the
    // new primary so leave-routing etc. still has a target.
    const sub = await db.query.memberships.findFirst({
      where: eq(schema.memberships.id, membershipId),
    })
    if (sub?.reportsToMembershipId === managerId) {
      const remaining = await db
        .select({ id: schema.membershipManagers.managerMembershipId })
        .from(schema.membershipManagers)
        .where(eq(schema.membershipManagers.membershipId, membershipId))
      await db
        .update(schema.memberships)
        .set({ reportsToMembershipId: remaining[0]?.id ?? null })
        .where(eq(schema.memberships.id, membershipId))
    }

    return NextResponse.json({ ok: true })
  } catch (e) {
    if (e instanceof HttpError) {
      return NextResponse.json({ error: e.message }, { status: e.status })
    }
    return NextResponse.json({ error: 'internal' }, { status: 500 })
  }
}

async function wouldCycle(candidateManager: number, subordinate: number): Promise<boolean> {
  // Walk every manager-chain from `candidateManager` upwards. If we hit
  // `subordinate`, we'd create a cycle.
  const visited = new Set<number>()
  const stack: number[] = [candidateManager]
  while (stack.length) {
    const cur = stack.pop()!
    if (cur === subordinate) return true
    if (visited.has(cur)) continue
    visited.add(cur)
    if (visited.size > 200) return false // hard guard
    const parents = await db
      .select({ id: schema.membershipManagers.managerMembershipId })
      .from(schema.membershipManagers)
      .where(eq(schema.membershipManagers.membershipId, cur))
    for (const p of parents) stack.push(p.id)
  }
  return false
}
