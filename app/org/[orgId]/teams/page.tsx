import { notFound, redirect } from 'next/navigation'
import { and, asc, eq, inArray, isNull } from 'drizzle-orm'
import { db, schema } from '@/lib/db/client'
import { HttpError, requireMembership } from '@/lib/auth/guards'
import { hasCap } from '@/lib/auth/capabilities'
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

  // Pull every active membership + user — used to populate the picker AND
  // the org chart.
  const memberRows = await db
    .select({ m: schema.memberships, u: schema.users })
    .from(schema.memberships)
    .innerJoin(schema.users, eq(schema.memberships.userId, schema.users.id))
    .where(and(eq(schema.memberships.orgId, orgId), isNull(schema.memberships.endedAt)))
    .orderBy(asc(schema.users.name))

  const teamRows = await db
    .select()
    .from(schema.teams)
    .where(eq(schema.teams.orgId, orgId))
    .orderBy(asc(schema.teams.name))
  const teamIds = teamRows.map((t) => t.id)
  const teamMemberRows = teamIds.length
    ? await db
        .select()
        .from(schema.teamMembers)
        .where(inArray(schema.teamMembers.teamId, teamIds))
    : []

  // Multi-manager rows. We catch() so a missing table (fresh DB without
  // the migration applied) degrades to "everyone has at most one manager"
  // instead of crashing the whole page.
  const managerRows = await db
    .select()
    .from(schema.membershipManagers)
    .catch(() => [])
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
        const fromTable = managerEdges.get(r.m.id) ?? []
        // Legacy primary manager column also counts — include it so we
        // don't lose edges while the live DB transitions to the m:n model.
        const legacy = r.m.reportsToMembershipId
        const all = Array.from(new Set([...fromTable, ...(legacy ? [legacy] : [])]))
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
          reportsToMembershipId: legacy ?? null,
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
