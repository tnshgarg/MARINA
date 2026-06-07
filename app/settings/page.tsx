import Link from 'next/link'
import { desc, eq } from 'drizzle-orm'
import { db, schema } from '@/lib/db/client'
import { requireSessionOrRedirect, listMembershipsForCurrentUser } from '@/lib/auth/guards'
import { CharacterAvatar } from '@/components/character-avatar'
import { getCharacter } from '@/lib/characters/data'
import SettingsClient from './client'

export const dynamic = 'force-dynamic'

export default async function SettingsPage() {
  const session = await requireSessionOrRedirect()

  // Ensure a settings row exists.
  let settings = await db.query.userSettings.findFirst({
    where: eq(schema.userSettings.userId, session.appUserId),
  })
  if (!settings) {
    const [created] = await db
      .insert(schema.userSettings)
      .values({ userId: session.appUserId })
      .returning()
    settings = created
  }

  const me = await db.query.users.findFirst({ where: eq(schema.users.id, session.appUserId) })
  const character = me ? getCharacter(me.characterKey) : null

  const devices = await db
    .select()
    .from(schema.agentTokens)
    .where(eq(schema.agentTokens.userId, session.appUserId))
    .orderBy(desc(schema.agentTokens.pairedAt))

  const memberships = await listMembershipsForCurrentUser()
  const primaryOrgId = memberships[0]?.orgId ?? null

  return (
    <main className="min-h-screen bg-[var(--m-bg)]">
      <header className="bg-white border-b border-slate-200">
        <div className="max-w-3xl mx-auto px-6 py-4 flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <CharacterAvatar characterKey={me?.characterKey} size={40} />
            <div>
              <p className="app-eyebrow">Settings</p>
              <h1 className="app-h2">
                {character?.name ?? me?.name ?? `@${session.login}`}
              </h1>
            </div>
          </div>
          <div className="flex items-center gap-3 text-[13px]">
            <Link href="/dashboard" className="text-slate-600 hover:text-indigo-600">My console</Link>
            {primaryOrgId && (
              <Link href={`/org/${primaryOrgId}`} className="text-slate-600 hover:text-indigo-600">Team</Link>
            )}
            <Link href="/me/shots" className="text-slate-600 hover:text-indigo-600">My captures</Link>
          </div>
        </div>
      </header>

      <SettingsClient
        initialSettings={{
          trackingPausedAt: settings.trackingPausedAt?.toISOString() ?? null,
          windowTitlesEnabled: settings.windowTitlesEnabled,
          consentAt: settings.consentAt?.toISOString() ?? null,
        }}
        initialDevices={devices.map((d) => ({
          id: d.id,
          label: d.label,
          platform: d.platform,
          tokenPrefix: d.tokenPrefix,
          agentVersion: d.agentVersion,
          pairedAt: d.pairedAt.toISOString(),
          lastSeenAt: d.lastSeenAt?.toISOString() ?? null,
          revokedAt: d.revokedAt?.toISOString() ?? null,
        }))}
      />
    </main>
  )
}
