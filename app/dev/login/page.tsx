import { notFound, redirect } from 'next/navigation'
import { desc, eq, inArray } from 'drizzle-orm'
import { db, schema } from '@/lib/db/client'
import { auth, signIn } from '@/auth'
import { CharacterAvatar } from '@/components/character-avatar'
import DevLoginClient from './client'

export const dynamic = 'force-dynamic'

export default async function DevLoginPage() {
  if (process.env.NODE_ENV === 'production') {
    notFound()
  }

  const session = await auth()
  if (session?.appUserId) {
    redirect('/')
  }

  // Pull users + their org memberships. The demo seed creates founders/owners
  // FIRST, so a small limit ordered newest-first would push the admins off the
  // list. Keep the limit generous so every seeded user — admins included — is
  // pickable here.
  const users = await db
    .select()
    .from(schema.users)
    .orderBy(desc(schema.users.createdAt))
    .limit(200)

  const memberships = users.length
    ? await db
        .select({ m: schema.memberships, o: schema.orgs })
        .from(schema.memberships)
        .innerJoin(schema.orgs, eq(schema.memberships.orgId, schema.orgs.id))
        .where(inArray(schema.memberships.userId, users.map((u) => u.id)))
    : []

  const byUserId = new Map<number, Array<{ orgName: string; role: string }>>()
  for (const m of memberships) {
    if (!byUserId.has(m.m.userId)) byUserId.set(m.m.userId, [])
    byUserId.get(m.m.userId)!.push({ orgName: m.o.name, role: m.m.role })
  }

  async function devSignIn(formData: FormData) {
    'use server'
    if (process.env.NODE_ENV === 'production') return
    const userId = formData.get('userId')
    if (typeof userId !== 'string') return
    await signIn('dev', { userId, redirectTo: '/' })
  }

  return (
    <main className="min-h-screen bg-gradient-to-br from-[var(--m-bg-soft)] to-[var(--m-accent-soft)] px-6 py-16">
      <div className="max-w-4xl mx-auto">
        <div className="rounded-2xl bg-gradient-to-br from-rose-50 to-amber-50 border border-rose-200 p-4 mb-8">
          <p className="text-[12px] font-semibold uppercase tracking-widest text-rose-700">
            🛠 Development only
          </p>
          <p className="mt-1 text-[13px] text-rose-900">
            This page is disabled when NODE_ENV is production. Click any user to instantly sign in
            as them — no email, no GitHub, no token. Use for testing role boundaries and member flows.
          </p>
        </div>

        <h1 className="text-[28px] font-semibold text-[var(--m-ink)] mb-2">Dev login</h1>
        <p className="text-[var(--m-ink-2)] mb-8">
          {users.length} seeded user{users.length === 1 ? '' : 's'} found. Pick one to sign in as.
          {users.length === 0 && (
            <span className="block mt-2 text-amber-700 font-medium">
              No users yet — run <code className="px-1.5 py-0.5 rounded bg-amber-100 font-mono text-[12px]">pnpm seed:demo</code>.
            </span>
          )}
        </p>

        <DevLoginClient
          devSignIn={devSignIn}
          users={users.map((u) => ({
            id: u.id,
            login: u.login,
            name: u.name,
            email: u.email,
            characterKey: u.characterKey,
            orgs: byUserId.get(u.id) ?? [],
          }))}
        />
      </div>
    </main>
  )
}

// Keep the import non-stripped
void CharacterAvatar
