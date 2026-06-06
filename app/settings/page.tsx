import Link from 'next/link'
import { desc, eq } from 'drizzle-orm'
import { db, schema } from '@/lib/db/client'
import { requireSessionOrRedirect, listMembershipsForCurrentUser } from '@/lib/auth/guards'
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

  const devices = await db
    .select()
    .from(schema.agentTokens)
    .where(eq(schema.agentTokens.userId, session.appUserId))
    .orderBy(desc(schema.agentTokens.pairedAt))

  const memberships = await listMembershipsForCurrentUser()
  const primaryOrgId = memberships[0]?.orgId ?? null

  return (
    <main className="min-h-screen bg-zinc-50 dark:bg-black">
      <header className="border-b border-zinc-200 bg-white dark:border-zinc-800 dark:bg-black">
        <div className="max-w-3xl mx-auto px-6 py-4 flex items-center justify-between">
          <div>
            <p className="text-xs uppercase tracking-widest text-zinc-500">Project MARINA</p>
            <h1 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">Settings</h1>
          </div>
          <div className="flex items-center gap-4 text-sm">
            <Link
              href="/dashboard"
              className="text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
            >
              My view
            </Link>
            {primaryOrgId && (
              <Link
                href={`/org/${primaryOrgId}`}
                className="text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
              >
                Team
              </Link>
            )}
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
