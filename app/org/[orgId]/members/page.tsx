import { notFound, redirect } from 'next/navigation'
import { and, desc, eq, isNull } from 'drizzle-orm'
import { auth } from '@/auth'
import { db, schema } from '@/lib/db/client'
import { HttpError, requireMembership, roleAtLeast } from '@/lib/auth/guards'
import { hasCap } from '@/lib/auth/capabilities'
import { SetupGuideCard } from '@/components/setup-guide-card'
import MembersClient from './client'

export const dynamic = 'force-dynamic'

// Manager+ guard from parent layout. We still check role here to compute
// isOwner — owners can remove members, managers cannot.
export default async function MembersPage({ params }: { params: Promise<{ orgId: string }> }) {
  const { orgId: raw } = await params
  const orgId = Number(raw)
  if (!Number.isInteger(orgId)) notFound()

  let viewer
  try {
    viewer = await requireMembership(orgId, 'manager')
  } catch (err) {
    if (err instanceof HttpError && err.status === 401) redirect('/')
    if (err instanceof HttpError && err.status === 403) redirect(`/dashboard`)
    throw err
  }

  const session = await auth()
  if (!session?.appUserId) redirect('/')

  const isOwner = roleAtLeast(viewer.membership.role, 'admin')

  // Scope: managers only see their reports + members of teams they manage.
  // Admins see everyone. Invitation form is gated on the manage_members cap
  // which is admin-only by default.
  const { getVisibleScope } = await import('@/lib/auth/scope')
  const scope = await getVisibleScope(orgId, {
    userId: session.appUserId,
    membershipId: viewer.membership.id,
    role: viewer.membership.role as 'admin' | 'manager' | 'lead' | 'member',
  })

  const allMemberRows = await db
    .select({ m: schema.memberships, u: schema.users })
    .from(schema.memberships)
    .innerJoin(schema.users, eq(schema.memberships.userId, schema.users.id))
    .where(and(eq(schema.memberships.orgId, orgId), isNull(schema.memberships.endedAt)))

  const rawMembers = scope.isAdminScope
    ? allMemberRows
    : allMemberRows.filter((r) => scope.userIds.has(r.u.id))

  const pendingInvites = await db
    .select()
    .from(schema.invites)
    .where(and(eq(schema.invites.orgId, orgId), isNull(schema.invites.acceptedAt)))
    .orderBy(desc(schema.invites.createdAt))

  return (
    <>
      <div className="mb-4">
        <h1 className="app-h1">People</h1>
        <p className="mt-1.5 text-[13px] text-slate-600">
          Manage the roster, invite teammates, and review punched-in shifts.
        </p>
      </div>

      {/* Manager toolkit — onboarding handout + desktop-agent download links,
          right where managers add and onboard people. */}
      <SetupGuideCard />

      <MembersClient
        orgId={orgId}
        isOwner={isOwner}
        viewerMembershipId={viewer.membership.id}
        canViewReports={hasCap(
          viewer.membership.role,
          (viewer.membership as { extraCaps?: string[] }).extraCaps ?? [],
          'view_all_data',
        )}
        members={rawMembers.map((r) => ({
          membershipId: r.m.id,
          userId: r.u.id,
          login: r.u.login,
          name: r.u.name,
          email: r.u.email,
          avatarUrl: r.u.avatarUrl,
          characterKey: r.u.characterKey,
          role: r.m.role,
          discipline: (r.m as { discipline?: string }).discipline ?? 'other',
          jobTitle: (r.m as { jobTitle?: string | null }).jobTitle ?? null,
        }))}
        pendingInvites={pendingInvites.map((i) => ({
          id: i.id,
          email: i.email,
          role: i.role,
          discipline: (i as { discipline?: string }).discipline ?? 'other',
          jobTitle: (i as { jobTitle?: string | null }).jobTitle ?? null,
          token: i.token,
          expiresAt: i.expiresAt.toISOString(),
        }))}
      />
    </>
  )
}
