import { redirect } from 'next/navigation'
import { and, eq, isNull } from 'drizzle-orm'
import { auth } from '@/auth'
import { db, schema } from '@/lib/db/client'
import type { Membership, Role, User } from '@/lib/db/schema'
import { getVisibleScope, type VisibleScope } from '@/lib/auth/scope'

export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message)
  }
}

// NOTE on lead vs manager: they intentionally share read-rank 2. `lead` is a
// lightweight manager (capabilities: view_reports_only + schedule_meetings)
// that should see the SAME scoped console as a manager — just their own
// reports. Tenant safety for reads comes from getVisibleScope (every list/
// detail surface filters to the viewer's reports), and every sensitive
// MUTATION is gated by a fine-grained capability (manage_members, decide_leaves,
// manage_workspace, …) — NOT by this rank — so a lead cannot escalate. Do not
// gate a destructive/admin action on `roleAtLeast(..,'manager')`; use
// requireCapability instead.
const ROLE_RANK: Record<Role, number> = { member: 1, lead: 2, manager: 2, admin: 3 }

export function roleAtLeast(actual: Role, min: Role): boolean {
  return ROLE_RANK[actual] >= ROLE_RANK[min]
}

export type ResolvedSession = {
  appUserId: number
  login: string
}

export async function requireSession(): Promise<ResolvedSession> {
  const session = await auth()
  if (!session?.appUserId || !session.login) {
    throw new HttpError(401, 'unauthorized')
  }
  return {
    appUserId: session.appUserId,
    login: session.login,
  }
}

export async function requireSessionOrRedirect(): Promise<ResolvedSession> {
  const session = await auth()
  if (!session?.appUserId || !session.login) redirect('/')
  return {
    appUserId: session.appUserId,
    login: session.login,
  }
}

export async function getCurrentUser(): Promise<User | null> {
  const session = await auth()
  if (!session?.appUserId) return null
  const u = await db.query.users.findFirst({
    where: eq(schema.users.id, session.appUserId),
  })
  return u ?? null
}

export async function listMembershipsForCurrentUser(): Promise<Array<Membership & { org: typeof schema.orgs.$inferSelect }>> {
  const session = await auth()
  if (!session?.appUserId) return []
  const rows = await db
    .select({
      m: schema.memberships,
      o: schema.orgs,
    })
    .from(schema.memberships)
    .innerJoin(schema.orgs, eq(schema.memberships.orgId, schema.orgs.id))
    .where(
      and(
        eq(schema.memberships.userId, session.appUserId),
        // Soft-deleted memberships shouldn't appear in nav / org picker.
        isNull(schema.memberships.endedAt),
      ),
    )
  return rows.map((r) => ({ ...r.m, org: r.o }))
}

export async function requireMembership(orgId: number, minRole: Role = 'member'): Promise<{
  session: ResolvedSession
  membership: Membership
}> {
  const session = await requireSession()
  const membership = await db.query.memberships.findFirst({
    where: and(
      eq(schema.memberships.orgId, orgId),
      eq(schema.memberships.userId, session.appUserId),
      // Removed-and-not-reinvited members can't be guarded as active members.
      isNull(schema.memberships.endedAt),
    ),
  })
  if (!membership) throw new HttpError(403, 'not a member of this org')
  if (!roleAtLeast(membership.role, minRole)) {
    throw new HttpError(403, `requires role >= ${minRole}`)
  }
  return { session, membership }
}

/**
 * Capability-based guard. Owners always pass; managers/members pass if the
 * capability has been explicitly granted on their membership via extraCaps.
 *
 * Use this for surfaces the owner may want to delegate (e.g. let a People
 * manager edit celebrations, let a Finance manager view all data) without
 * giving them full owner powers.
 */
export async function requireCapability(orgId: number, cap: string): Promise<{
  session: ResolvedSession
  membership: Membership
}> {
  const { session, membership } = await requireMembership(orgId, 'member')
  // Admins implicitly have every capability — that's the whole point of the
  // role. We still consult extraCaps for non-admins so a manager can be
  // granted, say, manage_celebrations without becoming an admin.
  if (membership.role === 'admin') return { session, membership }
  const extra = (membership as { extraCaps?: string[] }).extraCaps ?? []
  if (extra.includes(cap)) return { session, membership }
  throw new HttpError(403, `missing capability: ${cap}`)
}

/**
 * The scope-aware guard every teammate-touching endpoint should use.
 *
 * Combines requireMembership(minRole) with getVisibleScope so a manager/lead
 * is limited to the people they actually manage (reports-to chain + teams they
 * manage); admins get the whole org. Returns the resolved scope so the caller
 * can filter lists (`scope.userIds`) or assert a single target is visible
 * (use `ensureScopeUser` / `ensureScopeMembership` below).
 *
 * This is the single highest-leverage RBAC primitive — routing every
 * `membershipId`/`breakId`/`leaveId`/`userId`-bearing handler through it closes
 * the "any manager can see/act on the whole org" class of leaks.
 */
export async function requireScope(
  orgId: number,
  minRole: Role = 'manager',
): Promise<{ session: ResolvedSession; membership: Membership; scope: VisibleScope }> {
  const { session, membership } = await requireMembership(orgId, minRole)
  const scope = await getVisibleScope(orgId, {
    userId: session.appUserId,
    membershipId: membership.id,
    role: membership.role as 'admin' | 'manager' | 'lead' | 'member',
  })
  return { session, membership, scope }
}

/** Throw a 404 (don't leak existence) unless the target user is in scope. */
export function ensureScopeUser(scope: VisibleScope, targetUserId: number): void {
  if (!scope.isAdminScope && !scope.userIds.has(targetUserId)) {
    throw new HttpError(404, 'not found')
  }
}

/** Throw a 404 unless the target membership is in scope. */
export function ensureScopeMembership(scope: VisibleScope, targetMembershipId: number): void {
  if (!scope.isAdminScope && !scope.membershipIds.has(targetMembershipId)) {
    throw new HttpError(404, 'not found')
  }
}
