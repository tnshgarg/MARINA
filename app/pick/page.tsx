import { redirect } from 'next/navigation'
import { eq } from 'drizzle-orm'
import { db, schema } from '@/lib/db/client'
import { requireSessionOrRedirect } from '@/lib/auth/guards'
import { CHARACTERS } from '@/lib/characters/data'
import PickClient from './client'

export const dynamic = 'force-dynamic'

export default async function PickPage() {
  const session = await requireSessionOrRedirect()
  const user = await db.query.users.findFirst({
    where: eq(schema.users.id, session.appUserId),
  })
  if (user?.characterKey) redirect('/')

  return (
    <main className="min-h-screen bg-[var(--m-bg)] px-6 py-16">
      <div className="max-w-5xl mx-auto">
        <p className="app-eyebrow">Step 02 · Choose your hero</p>
        <h1 className="app-h1 mt-2 text-[32px]">Pick your hero</h1>
        <p className="app-sub mt-2 max-w-2xl">
          Every operator on MARINA suits up. Choose a hero — your team will see this avatar next to
          your name across every dashboard.
        </p>
        <PickClient
          characters={CHARACTERS.map((c) => ({
            key: c.key,
            name: c.name,
            codename: c.codename,
            tagline: c.tagline,
            color: c.color,
            glow: c.glow,
          }))}
        />
      </div>
    </main>
  )
}
