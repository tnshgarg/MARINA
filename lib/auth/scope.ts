import { and, eq, inArray, isNull } from 'drizzle-orm'
import { db, schema } from '@/lib/db/client'
import { capabilitiesFor } from '@/lib/auth/capabilities'

/**
 * Compute the set of `user_id`s a viewer is allowed to see inside an org.
 *
 * Why this exists: previously, every manager could see every teammate in the
 * org — same view as the workspace admin. That made org-wide leaks impossible
 * to contain ("our marketing manager can see what engineering is doing all
 * day"). The new model:
 *
 *   admin   → sees everyone
 *   manager → sees themselves + their reports-to chain + members of teams
 *             they're listed as manager of
 *   lead    → same as manager (lighter-weight role, same scope)
 *   member  → just themselves
 *
 * The result is a `Set<number>` of MARINA user-ids. Callers SQL-filter rows
 * by `userId IN (...)`. Returning a Set lets callers cheaply check `set.has(id)`
 * for in-memory filtering of an already-loaded list.
 *
 * Performance: a single chained query for direct reports + teams + members.
 * For very large orgs (10k+ memberships) we'd want a recursive CTE; for now
 * the iterative BFS over `membership_managers` is fine.
 */
export type ViewerForScope = {
  userId: number
  membershipId: number
  role: 'admin' | 'manager' | 'lead' | 'member'
}

export type VisibleScope = {
  /** Every user id the viewer can see. Includes the viewer themselves. */
  userIds: Set<number>
  /** Every membership id the viewer can see. */
  membershipIds: Set<number>
  /** True when the viewer is an admin and the scope is unrestricted. */
  isAdminScope: boolean
}

export async function getVisibleScope(
  orgId: number,
  viewer: ViewerForScope,
): Promise<VisibleScope> {
  // Full-org access: admins, AND anyone explicitly granted `view_all_data`
  // (e.g. an HR head who's a "manager" role but needs to see everyone).
  // Without this, an HR manager would be scoped to just their direct reports —
  // which is exactly the "Aisha only sees 6 people" bug.
  let fullAccess = viewer.role === 'admin'
  if (!fullAccess) {
    const meRow = await db
      .select({ extraCaps: schema.memberships.extraCaps })
      .from(schema.memberships)
      .where(
        and(
          eq(schema.memberships.id, viewer.membershipId),
          eq(schema.memberships.orgId, orgId),
          isNull(schema.memberships.endedAt),
        ),
      )
      .limit(1)
    const extraCaps = (meRow[0]?.extraCaps as string[] | undefined) ?? []
    fullAccess = capabilitiesFor(viewer.role, extraCaps).has('view_all_data')
  }
  if (fullAccess) {
    const rows = await db
      .select({
        userId: schema.memberships.userId,
        membershipId: schema.memberships.id,
      })
      .from(schema.memberships)
      .where(and(eq(schema.memberships.orgId, orgId), isNull(schema.memberships.endedAt)))
    return {
      userIds: new Set(rows.map((r) => r.userId)),
      membershipIds: new Set(rows.map((r) => r.membershipId)),
      isAdminScope: true,
    }
  }

  // Plain members see only themselves.
  if (viewer.role === 'member') {
    return {
      userIds: new Set([viewer.userId]),
      membershipIds: new Set([viewer.membershipId]),
      isAdminScope: false,
    }
  }

  // Manager / lead — union of reports-to chain + teams they manage.
  const visibleMembershipIds = new Set<number>([viewer.membershipId])

  // 1. Reports-to chain: BFS down. We have two data sources:
  //    - legacy `memberships.reportsToMembershipId` (single manager column)
  //    - new `membership_managers` join table (m:n)
  //    Both contribute; combine into a single "subordinates of M" map.
  const allMemberships = await db
    .select({
      id: schema.memberships.id,
      userId: schema.memberships.userId,
      reportsToMembershipId: schema.memberships.reportsToMembershipId,
    })
    .from(schema.memberships)
    .where(and(eq(schema.memberships.orgId, orgId), isNull(schema.memberships.endedAt)))

  // membership_managers has no orgId column, so we MUST constrain it to this
  // org ourselves. The old query loaded the ENTIRE table across all orgs;
  // since membership ids are a global serial PK, a cross-org edge could leak
  // into this org's scope graph. We only keep edges where BOTH endpoints are
  // memberships of THIS org.
  const orgMemIds = new Set(allMemberships.map((m) => m.id))
  const mgrEdgesRaw = await db
    .select()
    .from(schema.membershipManagers)
    .catch(() => [])
  const mgrEdges = mgrEdgesRaw.filter(
    (e) => orgMemIds.has(e.managerMembershipId) && orgMemIds.has(e.membershipId),
  )

  /** managerMembershipId → child membershipIds */
  const directReports = new Map<number, Set<number>>()
  for (const m of allMemberships) {
    if (m.reportsToMembershipId != null) {
      const set = directReports.get(m.reportsToMembershipId) ?? new Set<number>()
      set.add(m.id)
      directReports.set(m.reportsToMembershipId, set)
    }
  }
  for (const e of mgrEdges) {
    const set = directReports.get(e.managerMembershipId) ?? new Set<number>()
    set.add(e.membershipId)
    directReports.set(e.managerMembershipId, set)
  }

  // BFS from the viewer down. Stop at depth 10 to avoid pathological cycles.
  const queue: number[] = [viewer.membershipId]
  let depth = 0
  while (queue.length > 0 && depth < 12) {
    const next: number[] = []
    for (const id of queue) {
      const children = directReports.get(id)
      if (!children) continue
      for (const childId of children) {
        if (!visibleMembershipIds.has(childId)) {
          visibleMembershipIds.add(childId)
          next.push(childId)
        }
      }
    }
    queue.length = 0
    queue.push(...next)
    depth++
  }

  // 2. Teams they manage. The membership of each team that the viewer is the
  //    manager of is added to the visible set, regardless of reports-to.
  const teamsManaged = await db
    .select({ id: schema.teams.id })
    .from(schema.teams)
    .where(
      and(
        eq(schema.teams.orgId, orgId),
        eq(schema.teams.managerMembershipId, viewer.membershipId),
      ),
    )
    .catch(() => [])

  if (teamsManaged.length > 0) {
    const teamIds = teamsManaged.map((t) => t.id)
    const teamMems = await db
      .select({ membershipId: schema.teamMembers.membershipId })
      .from(schema.teamMembers)
      .where(inArray(schema.teamMembers.teamId, teamIds))
    for (const tm of teamMems) {
      visibleMembershipIds.add(tm.membershipId)
    }
  }

  // 3. Resolve membership ids → user ids via the loaded list.
  const memToUser = new Map(allMemberships.map((m) => [m.id, m.userId]))
  const userIds = new Set<number>([viewer.userId])
  for (const mid of visibleMembershipIds) {
    const uid = memToUser.get(mid)
    if (uid != null) userIds.add(uid)
  }

  return {
    userIds,
    membershipIds: visibleMembershipIds,
    isAdminScope: false,
  }
}
