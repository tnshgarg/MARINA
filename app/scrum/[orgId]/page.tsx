import { notFound, redirect } from 'next/navigation'
import { and, eq, isNull } from 'drizzle-orm'
import { db, schema } from '@/lib/db/client'
import { HttpError, requireMembership } from '@/lib/auth/guards'
import ScrumClient from './client'

export const dynamic = 'force-dynamic'

/**
 * Scrum Mode — projection-friendly standup helper. Lives at /scrum/[orgId]
 * (outside the org chrome) so it owns the full viewport. The manager picks an
 * employee, sees a one-screen brief of yesterday's work, active blockers and
 * recent context. Arrow keys advance through the roster.
 */
export default async function ScrumPage({ params }: { params: Promise<{ orgId: string }> }) {
  const { orgId: raw } = await params
  const orgId = Number(raw)
  if (!Number.isInteger(orgId)) notFound()

  let viewer: Awaited<ReturnType<typeof requireMembership>>
  try {
    viewer = await requireMembership(orgId, 'manager')
  } catch (err) {
    if (err instanceof HttpError && err.status === 401) redirect('/')
    if (err instanceof HttpError && err.status === 403) redirect(`/org/${orgId}`)
    throw err
  }

  const org = await db.query.orgs.findFirst({ where: eq(schema.orgs.id, orgId) })
  if (!org) notFound()

  const { getVisibleScope } = await import('@/lib/auth/scope')
  const scope = await getVisibleScope(orgId, {
    userId: viewer.session.appUserId,
    membershipId: viewer.membership.id,
    role: viewer.membership.role as 'admin' | 'manager' | 'lead' | 'member',
  })

  const allMemberRows = await db
    .select({
      membershipId: schema.memberships.id,
      userId: schema.users.id,
      login: schema.users.login,
      name: schema.users.name,
      characterKey: schema.users.characterKey,
      role: schema.memberships.role,
      teamId: schema.teams.id,
      teamName: schema.teams.name,
      teamColor: schema.teams.color,
    })
    .from(schema.memberships)
    .innerJoin(schema.users, eq(schema.memberships.userId, schema.users.id))
    .leftJoin(schema.teamMembers, eq(schema.teamMembers.membershipId, schema.memberships.id))
    .leftJoin(
      schema.teams,
      and(eq(schema.teams.id, schema.teamMembers.teamId), eq(schema.teams.orgId, orgId)),
    )
    .where(and(eq(schema.memberships.orgId, orgId), isNull(schema.memberships.endedAt)))

  // Scope: managers only run scrum for their reports + teams they manage.
  // Admins see the whole org so they can audit "are managers running scrums
  // for every team?" and step in when needed.
  const scopedRows = scope.isAdminScope
    ? allMemberRows
    : allMemberRows.filter((r) => scope.userIds.has(r.userId))

  // The team leftJoin fans out one row per team membership. Collapse back to one
  // row per person, keeping their first team (the roster groups by a single team).
  const byMembership = new Map<number, (typeof scopedRows)[number]>()
  for (const r of scopedRows) {
    const existing = byMembership.get(r.membershipId)
    if (!existing) byMembership.set(r.membershipId, r)
    else if (existing.teamId == null && r.teamId != null) byMembership.set(r.membershipId, r)
  }
  const memberRows = [...byMembership.values()]

  memberRows.sort((a, b) => {
    if (a.role !== b.role) {
      const order = { admin: 0, manager: 1, lead: 1, member: 2 } as const
      return (order[a.role as keyof typeof order] ?? 9) - (order[b.role as keyof typeof order] ?? 9)
    }
    return (a.name ?? a.login).localeCompare(b.name ?? b.login)
  })

  return (
    <ScrumClient
      orgId={orgId}
      orgName={org.name}
      members={memberRows}
    />
  )
}
