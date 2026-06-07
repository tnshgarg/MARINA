import { notFound, redirect } from 'next/navigation'
import { and, desc, eq, isNull } from 'drizzle-orm'
import { auth } from '@/auth'
import { db, schema } from '@/lib/db/client'
import { HttpError, requireMembership, roleAtLeast } from '@/lib/auth/guards'
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

  const isOwner = roleAtLeast(viewer.membership.role, 'owner')

  const rawMembers = await db
    .select({ m: schema.memberships, u: schema.users })
    .from(schema.memberships)
    .innerJoin(schema.users, eq(schema.memberships.userId, schema.users.id))
    .where(eq(schema.memberships.orgId, orgId))

  const pendingInvites = await db
    .select()
    .from(schema.invites)
    .where(and(eq(schema.invites.orgId, orgId), isNull(schema.invites.acceptedAt)))
    .orderBy(desc(schema.invites.createdAt))

  return (
    <>
      <div className="mb-6">
        <h1 className="app-h1">Team Members</h1>
        <p className="mt-1 app-sub">Recruit, manage, and remove members.</p>
      </div>

      <MembersClient
        orgId={orgId}
        isOwner={isOwner}
        viewerMembershipId={viewer.membership.id}
        members={rawMembers.map((r) => ({
          membershipId: r.m.id,
          login: r.u.login,
          name: r.u.name,
          email: r.u.email,
          avatarUrl: r.u.avatarUrl,
          characterKey: r.u.characterKey,
          role: r.m.role,
        }))}
        pendingInvites={pendingInvites.map((i) => ({
          id: i.id,
          email: i.email,
          role: i.role,
          token: i.token,
          expiresAt: i.expiresAt.toISOString(),
        }))}
      />
    </>
  )
}
