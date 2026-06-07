import { notFound, redirect } from 'next/navigation'
import { eq } from 'drizzle-orm'
import { db, schema } from '@/lib/db/client'
import { HttpError, requireMembership } from '@/lib/auth/guards'
import { INDIA_REGIONS } from '@/lib/holidays/india'
import OrgSettingsClient from './client'

export const dynamic = 'force-dynamic'

export default async function OrgSettingsPage({ params }: { params: Promise<{ orgId: string }> }) {
  const { orgId: raw } = await params
  const orgId = Number(raw)
  if (!Number.isInteger(orgId)) notFound()

  try {
    await requireMembership(orgId, 'owner')
  } catch (err) {
    if (err instanceof HttpError && err.status === 401) redirect('/')
    if (err instanceof HttpError && err.status === 403) redirect(`/org/${orgId}`)
    throw err
  }

  const org = await db.query.orgs.findFirst({ where: eq(schema.orgs.id, orgId) })
  if (!org) notFound()

  // Don't ship the secret webhook URL — just whether it's set.
  const hasSlack = !!org.slackWebhookUrl

  return (
    <>
      <div className="mb-6">
        <h1 className="app-h1">Org Settings</h1>
        <p className="mt-1 app-sub">Manage workspace-wide configuration. Owner only.</p>
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
        }}
        regions={INDIA_REGIONS}
      />
    </>
  )
}
