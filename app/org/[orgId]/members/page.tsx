import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { and, desc, eq, isNull } from 'drizzle-orm'
import { db, schema } from '@/lib/db/client'
import { HttpError, requireMembership, roleAtLeast } from '@/lib/auth/guards'
import MembersClient from './client'

export const dynamic = 'force-dynamic'

export default async function MembersPage({ params }: { params: Promise<{ orgId: string }> }) {
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
    <main className="min-h-screen bg-zinc-50 dark:bg-black">
      <header className="border-b border-zinc-200 bg-white dark:border-zinc-800 dark:bg-black">
        <div className="max-w-3xl mx-auto px-6 py-4 flex items-center justify-between">
          <div>
            <p className="text-xs uppercase tracking-widest text-zinc-500">{org.name}</p>
            <h1 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">Members & invites</h1>
          </div>
          <Link
            href={`/org/${orgId}`}
            className="text-sm text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
          >
            ← Team dashboard
          </Link>
        </div>
      </header>

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
    </main>
  )
}
