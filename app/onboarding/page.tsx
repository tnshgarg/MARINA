import { redirect } from 'next/navigation'
import { and, eq, gt, isNull } from 'drizzle-orm'
import { db, schema } from '@/lib/db/client'
import {
  getCurrentUser,
  listMembershipsForCurrentUser,
  requireSessionOrRedirect,
} from '@/lib/auth/guards'
import OnboardingClient from './client'

export const dynamic = 'force-dynamic'

export default async function OnboardingPage() {
  await requireSessionOrRedirect()

  const memberships = await listMembershipsForCurrentUser()
  if (memberships.length > 0) {
    redirect(`/org/${memberships[0].orgId}`)
  }

  const user = await getCurrentUser()
  const pendingInvites = user?.email
    ? await db
        .select({ invite: schema.invites, org: schema.orgs })
        .from(schema.invites)
        .innerJoin(schema.orgs, eq(schema.invites.orgId, schema.orgs.id))
        .where(
          and(
            eq(schema.invites.email, user.email.toLowerCase()),
            isNull(schema.invites.acceptedAt),
            gt(schema.invites.expiresAt, new Date())
          )
        )
    : []

  return (
    <main className="min-h-screen bg-zinc-50 dark:bg-black flex items-start justify-center pt-20 px-6">
      <div className="w-full max-w-xl">
        <p className="text-xs uppercase tracking-widest text-zinc-500">Project MARINA</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
          Welcome, @{user?.login}
        </h1>
        <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
          You&apos;re not in any organization yet. Create one, or accept an invite.
        </p>

        <OnboardingClient
          email={user?.email ?? null}
          pendingInvites={pendingInvites.map((r) => ({
            id: r.invite.id,
            token: r.invite.token,
            role: r.invite.role,
            orgName: r.org.name,
            orgId: r.org.id,
          }))}
        />
      </div>
    </main>
  )
}
