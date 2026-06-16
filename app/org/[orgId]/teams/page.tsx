import { notFound, redirect } from 'next/navigation'
import { and, asc, eq, inArray, isNull } from 'drizzle-orm'
import { db, schema } from '@/lib/db/client'
import { HttpError, requireMembership } from '@/lib/auth/guards'
import { hasCap } from '@/lib/auth/capabilities'
import { getVisibleScope } from '@/lib/auth/scope'
import TeamsClient from './client'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

/**
 * Teams + Org chart. Two surfaces in one:
 *   1. Teams list — every team in the org, who manages it, who's in it.
 *   2. Org chart — interactive draggable boxes connected by reports-to
 *      edges. Exportable.
 *
 * Read-access for any active member (so employees can see what teams they
 * belong to and who they report to). Edit-access is gated on
 * `manage_members` — managers + owner + anyone with the extra cap.
 */
export default async function TeamsPage({
  params,
}: {
  params: Promise<{ orgId: string }>
}) {
  const { orgId: raw } = await params
  const orgId = Number(raw)
  if (!Number.isInteger(orgId)) notFound()

  let session
  let viewerMembership
  try {
    const res = await requireMembership(orgId, 'member')
    session = res.session
    viewerMembership = res.membership
  } catch (err) {
    if (err instanceof HttpError && err.status === 401) redirect('/')
    if (err instanceof HttpError && err.status === 403) redirect('/dashboard')
    throw err
  }

  const canEdit = hasCap(
    viewerMembership.role,
    (viewerMembership as { extraCaps?: string[] }).extraCaps ?? [],
    'manage_members',
  )

  // RBAC: a team-scoped manager must NOT see the whole org's people + org chart.
  // Scope everything to the viewer's visible set (admins / view_all_data → all).
  const scope = await getVisibleScope(orgId, {
    userId: session.appUserId,
    membershipId: viewerMembership.id,
    role: viewerMembership.role as 'admin' | 'manager' | 'lead' | 'member',
  })

  const allMemberRows = await db
    .select({ m: schema.memberships, u: schema.users })
    .from(schema.memberships)
    .innerJoin(schema.users, eq(schema.memberships.userId, schema.users.id))
    .where(and(eq(schema.memberships.orgId, orgId), isNull(schema.memberships.endedAt)))
    .orderBy(asc(schema.users.name))
  const memberRows = scope.isAdminScope ? allMemberRows : allMemberRows.filter((r) => scope.membershipIds.has(r.m.id))
  const visibleMemIds = new Set(memberRows.map((r) => r.m.id))

  const allTeamRows = await db
    .select()
    .from(schema.teams)
    .where(eq(schema.teams.orgId, orgId))
    .orderBy(asc(schema.teams.name))
  const allTeamIds = allTeamRows.map((t) => t.id)
  const allTeamMemberRows = allTeamIds.length
    ? await db.select().from(schema.teamMembers).where(inArray(schema.teamMembers.teamId, allTeamIds))
    : []
  // Only teams the viewer manages or that contain someone they can see.
  const teamRows = scope.isAdminScope
    ? allTeamRows
    : allTeamRows.filter(
        (t) =>
          (t.managerMembershipId != null && scope.membershipIds.has(t.managerMembershipId)) ||
          allTeamMemberRows.some((tm) => tm.teamId === t.id && visibleMemIds.has(tm.membershipId)),
      )
  const teamIdSet = new Set(teamRows.map((t) => t.id))
  const teamMemberRows = allTeamMemberRows.filter(
    (tm) => teamIdSet.has(tm.teamId) && (scope.isAdminScope || visibleMemIds.has(tm.membershipId)),
  )

  // Multi-manager rows. We catch() so a missing table (fresh DB without the
  // migration applied) degrades gracefully. Only keep edges where BOTH endpoints
  // are visible, so the chart never references a person outside scope.
  const managerRows = (await db.select().from(schema.membershipManagers).catch(() => [])).filter(
    (r) => scope.isAdminScope || (visibleMemIds.has(r.membershipId) && visibleMemIds.has(r.managerMembershipId)),
  )
  const managerEdges = new Map<number, number[]>()
  for (const r of managerRows) {
    if (!managerEdges.has(r.membershipId)) managerEdges.set(r.membershipId, [])
    managerEdges.get(r.membershipId)!.push(r.managerMembershipId)
  }

  return (
    <TeamsClient
      orgId={orgId}
      viewerUserId={session.appUserId}
      viewerMembershipId={viewerMembership.id}
      canEdit={canEdit}
      members={memberRows.map((r) => {
        const fromTable = (managerEdges.get(r.m.id) ?? []).filter((id) => scope.isAdminScope || visibleMemIds.has(id))
        // Legacy primary manager column also counts — but only if that manager
        // is in scope, so we never draw an edge to a hidden person.
        const legacy = r.m.reportsToMembershipId
        const legacyVisible = legacy != null && (scope.isAdminScope || visibleMemIds.has(legacy)) ? legacy : null
        const all = Array.from(new Set([...fromTable, ...(legacyVisible ? [legacyVisible] : [])]))
        return {
          membershipId: r.m.id,
          userId: r.u.id,
          login: r.u.login,
          name: r.u.name,
          characterKey: r.u.characterKey,
          avatarUrl: r.u.avatarUrl,
          role: r.m.role,
          discipline: r.m.discipline,
          jobTitle: r.m.jobTitle ?? null,
          reportsToMembershipId: legacyVisible,
          managerMembershipIds: all,
        }
      })}
      teams={teamRows.map((t) => ({
        id: t.id,
        name: t.name,
        description: t.description,
        managerMembershipId: t.managerMembershipId,
        color: t.color,
        memberMembershipIds: teamMemberRows
          .filter((tm) => tm.teamId === t.id)
          .map((tm) => tm.membershipId),
      }))}
    />
  )
}
