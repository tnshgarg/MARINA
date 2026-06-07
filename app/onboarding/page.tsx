import { redirect } from 'next/navigation'
import { and, eq, gt, isNull } from 'drizzle-orm'
import { db, schema } from '@/lib/db/client'
import {
  getCurrentUser,
  listMembershipsForCurrentUser,
  requireSessionOrRedirect,
} from '@/lib/auth/guards'
import { CharacterAvatar } from '@/components/character-avatar'
import { getCharacter } from '@/lib/characters/data'
import OnboardingClient from './client'

export const dynamic = 'force-dynamic'

export default async function OnboardingPage() {
  await requireSessionOrRedirect()

  const memberships = await listMembershipsForCurrentUser()
  if (memberships.length > 0) {
    redirect(`/org/${memberships[0].orgId}`)
  }

  const user = await getCurrentUser()
  if (!user?.characterKey) redirect('/pick')
  const character = getCharacter(user.characterKey)

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
    <main className="min-h-screen bg-[var(--m-bg)] flex items-start justify-center pt-16 px-6">
      <div className="w-full max-w-xl">
        <p className="app-eyebrow">Step 03 · Form a squad</p>
        <h1 className="app-h1 mt-2 text-[32px]">Welcome, @{user?.login}</h1>
        <div className="mt-4 flex items-center gap-4">
          <CharacterAvatar characterKey={user?.characterKey} size={56} />
          <p className="app-sub max-w-md">
            You&apos;re {character?.name ?? 'suited up'}. Now form a squad — spin up a new
            organization (you&apos;ll be the founder) or accept one of the pending invites below.
          </p>
        </div>

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
