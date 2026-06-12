import { notFound, redirect } from 'next/navigation'
import { eq } from 'drizzle-orm'
import { db, schema } from '@/lib/db/client'
import { HttpError, requireCapability } from '@/lib/auth/guards'
import { INDIA_REGIONS } from '@/lib/holidays/india'
import { SettingsTabs } from '@/components/org-tabs'
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
      // Manager without workspace rights → bounce them to their personal
      // /settings page where they can manage their own profile + agent.
      redirect('/settings')
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
        <p className="mt-1.5 text-[13px] text-slate-600">
          Workspace-wide configuration on the left, your personal preferences in Profile.
        </p>
      </div>
      <SettingsTabs orgId={orgId} />

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
        }}
        regions={INDIA_REGIONS}
      />
    </>
  )
}
