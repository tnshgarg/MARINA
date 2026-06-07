import { and, desc, eq } from 'drizzle-orm'
import { db, schema } from '@/lib/db/client'
import { listMembershipsForCurrentUser, requireSessionOrRedirect, roleAtLeast } from '@/lib/auth/guards'
import { SettingsTabs } from '@/components/org-tabs'
import SettingsClient from './client'

export const dynamic = 'force-dynamic'

export default async function SettingsPage() {
  const session = await requireSessionOrRedirect()

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

  const devices = await db
    .select()
    .from(schema.agentTokens)
    .where(eq(schema.agentTokens.userId, session.appUserId))
    .orderBy(desc(schema.agentTokens.pairedAt))

  // Detect a connected Google account so the Calendar card can show status.
  const googleAccount = await db.query.accounts.findFirst({
    where: and(
      eq(schema.accounts.userId, session.appUserId),
      eq(schema.accounts.provider, 'google'),
    ),
  })

  // Find an org we can scope the workspace tab to, if any.
  const memberships = await listMembershipsForCurrentUser()
  const managerOrg = memberships.find((m) => roleAtLeast(m.role, 'manager'))?.orgId ?? null

  return (
    <>
      <div className="mb-4 flex items-baseline justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-[22px] font-semibold text-slate-900 tracking-tight">Settings</h1>
          <p className="mt-1.5 text-[13px] text-slate-600">
            Workspace-wide configuration on the left, your personal preferences here.
          </p>
        </div>
        <p className="text-[12px] text-slate-500">
          Signed in as <span className="text-slate-800 font-medium">{me?.name ?? `@${session.login}`}</span>
        </p>
      </div>
      {managerOrg && <SettingsTabs orgId={managerOrg} />}

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
        googleConnected={!!googleAccount}
      />
    </>
  )
}
