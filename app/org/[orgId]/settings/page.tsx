import { notFound, redirect } from 'next/navigation'
import { eq } from 'drizzle-orm'
import { db, schema } from '@/lib/db/client'
import { HttpError, requireCapability } from '@/lib/auth/guards'
import { INDIA_REGIONS } from '@/lib/holidays/india'
import { NoAccess } from '@/components/no-access'
import OrgSettingsClient from './client'

export const dynamic = 'force-dynamic'

export default async function OrgSettingsPage({ params }: { params: Promise<{ orgId: string }> }) {
  const { orgId: raw } = await params
  const orgId = Number(raw)
  if (!Number.isInteger(orgId)) notFound()

  try {
    await requireCapability(orgId, 'manage_workspace')
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

  return (
    <>
      <div className="mb-4">
        <h1 className="app-h1">Settings</h1>
        <p className="mt-1.5 text-[13px] text-[var(--m-ink-2)]">
          Workspace-wide configuration on the left, your personal preferences in Profile.
        </p>
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
        }}
        regions={INDIA_REGIONS}
      />
    </>
  )
}
