import { redirect } from 'next/navigation'
import { and, eq, isNull } from 'drizzle-orm'
import { auth } from '@/auth'
import { db, schema } from '@/lib/db/client'
import type { Membership, Role, User } from '@/lib/db/schema'

export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message)
  }
}

const ROLE_RANK: Record<Role, number> = { member: 1, manager: 2, owner: 3 }

export function roleAtLeast(actual: Role, min: Role): boolean {
  return ROLE_RANK[actual] >= ROLE_RANK[min]
}

export type ResolvedSession = {
  appUserId: number
  login: string
  accessToken?: string
}

export async function requireSession(): Promise<ResolvedSession> {
  const session = await auth()
  if (!session?.appUserId || !session.login) {
    throw new HttpError(401, 'unauthorized')
  }
  return {
    appUserId: session.appUserId,
    login: session.login,
    accessToken: session.accessToken,
  }
}

export async function requireSessionOrRedirect(): Promise<ResolvedSession> {
  const session = await auth()
  if (!session?.appUserId || !session.login) redirect('/')
  return {
    appUserId: session.appUserId,
    login: session.login,
    accessToken: session.accessToken,
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
  if (membership.role === 'owner') return { session, membership }
  const extra = (membership as { extraCaps?: string[] }).extraCaps ?? []
  if (extra.includes(cap)) return { session, membership }
  throw new HttpError(403, `missing capability: ${cap}`)
}
