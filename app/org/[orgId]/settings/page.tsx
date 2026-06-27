import { notFound, redirect } from 'next/navigation'
import { and, eq, isNotNull } from 'drizzle-orm'
import { db, schema } from '@/lib/db/client'
import { HttpError, requireCapability } from '@/lib/auth/guards'
import { INDIA_REGIONS } from '@/lib/holidays/india'
import { appInstallUrl } from '@/lib/github/app'
import { NoAccess } from '@/components/no-access'
import { IntegrationsPanel } from '@/components/integrations-panel'
import OrgSettingsClient from './client'

export const dynamic = 'force-dynamic'

export default async function OrgSettingsPage({ params }: { params: Promise<{ orgId: string }> }) {
  const { orgId: raw } = await params
  const orgId = Number(raw)
  if (!Number.isInteger(orgId)) notFound()

  let viewerUserId: number
  try {
    const { session } = await requireCapability(orgId, 'manage_workspace')
    viewerUserId = session.appUserId
  } catch (err) {
    if (err instanceof HttpError && err.status === 401) redirect('/')
    if (err instanceof HttpError && err.status === 403) {
      return (
        <NoAccess
          title="Workspace settings are owner-only"
          message="Editing the workspace (name, logo, leave policy, holidays, cost rates) is limited to owners and admins. Your own preferences live under Settings → My settings."
          backHref="/settings"
          backLabel="Go to my settings"
        />
      )
    }
    throw err
  }

  const org = await db.query.orgs.findFirst({ where: eq(schema.orgs.id, orgId) })
  if (!org) notFound()

  // Don't ship the secret webhook URL — just whether it's set.
  const hasSlack = !!org.slackWebhookUrl

  // Connection state for the inline "Connections" card (also on the dashboard,
  // but here it's the permanent home if a manager dismissed it there).
  const myGoogle = await db.query.accounts.findFirst({
    where: and(
      eq(schema.accounts.userId, viewerUserId),
      eq(schema.accounts.provider, 'google'),
      isNotNull(schema.accounts.access_token),
    ),
  })

  return (
    <>
      <div className="mb-4">
        <h1 className="app-h1">Settings</h1>
        <p className="mt-1.5 text-[13px] text-[var(--m-ink-2)]">
          Workspace-wide configuration on the left, your personal preferences in Profile.
        </p>
      </div>

      <div className="mb-5 max-w-3xl">
        <IntegrationsPanel
          variant="manager"
          orgId={orgId}
          github={{ connected: (org as { githubInstallationId?: number | null }).githubInstallationId != null }}
          calendar={{ connected: !!myGoogle }}
          slack={{
            connected: !!org.slackBotToken,
            detail: (org as { slackTeamName?: string | null }).slackTeamName
              ? `Connected to ${(org as { slackTeamName?: string | null }).slackTeamName}.`
              : undefined,
          }}
          githubAppInstallUrl={appInstallUrl(orgId)}
          calendarReturnTo={`/org/${orgId}/settings`}
        />
      </div>

      <OrgSettingsClient
        orgId={orgId}
        initial={{
          name: org.name,
          hasSlack,
          holidayRegion: org.holidayRegion ?? 'IN',
          avatarMode: org.avatarMode,
          workdayStartHour: org.workdayStartHour,
          workdayEndHour: org.workdayEndHour,
          plan: org.plan,
          trialEndsAt: org.trialEndsAt?.toISOString() ?? null,
          logoUrl: (org as { logoUrl?: string | null }).logoUrl ?? null,
          leavePolicy: (org as { leavePolicy?: Record<string, number> | null }).leavePolicy ?? null,
          agentEnabled: (org as { agentEnabled?: boolean }).agentEnabled ?? true,
        }}
        regions={INDIA_REGIONS}
      />
    </>
  )
}
