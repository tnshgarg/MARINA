import { redirect } from 'next/navigation'
import { eq } from 'drizzle-orm'
import { db, schema } from '@/lib/db/client'
import { requireSessionOrRedirect } from '@/lib/auth/guards'
import { CHARACTERS } from '@/lib/characters/data'
import { primaryOrgIdFor, takenCharacterKeysForOrg } from '@/lib/characters/availability'
import PickClient from './client'

export const dynamic = 'force-dynamic'

export default async function PickPage() {
  const session = await requireSessionOrRedirect()
  const user = await db.query.users.findFirst({
    where: eq(schema.users.id, session.appUserId),
  })
  if (user?.characterKey) redirect('/')

  // Per-org uniqueness — figure out which keys are already claimed by
  // teammates in the user's primary org so we can grey them out.
  const orgId = await primaryOrgIdFor(session.appUserId)
  const taken = orgId
    ? await takenCharacterKeysForOrg(orgId, session.appUserId)
    : new Set<string>()

  return (
    <main className="min-h-screen bg-[var(--m-bg)] px-6 py-16">
      <div className="max-w-5xl mx-auto">
        <p className="app-eyebrow">Step 02 · Pick your identity</p>
        <h1 className="app-h1 mt-2">Choose your character</h1>
        <p className="app-sub mt-2 max-w-2xl">
          Pick a legendary archetype — Navigator, Sentinel, Scholar, Oracle. Your team will see
          this avatar next to your name across every surface. One character per workspace, so each
          teammate stays distinct.
        </p>
        <PickClient
          characters={CHARACTERS.map((c) => ({
            key: c.key,
            name: c.name,
            codename: c.codename,
            tagline: c.tagline,
            color: c.color,
            glow: c.glow,
            taken: taken.has(c.key),
          }))}
        />
      </div>
    </main>
  )
}
