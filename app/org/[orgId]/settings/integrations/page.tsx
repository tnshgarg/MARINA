import { notFound, redirect } from 'next/navigation'
import { and, eq, isNotNull, isNull } from 'drizzle-orm'
import { db, schema } from '@/lib/db/client'
import { HttpError, requireCapability } from '@/lib/auth/guards'
import { NoAccess } from '@/components/no-access'
import { appInstallUrl, githubAppConfigured } from '@/lib/github/app'
import IntegrationsClient from './client'

export const dynamic = 'force-dynamic'

/**
 * Org-level Integrations page. Each integration is a modular card with the
 * same shape: identity (name + icon), status (connected / available / coming
 * soon), optional config. New integrations slot in by adding a card and an
 * endpoint — the page itself does not need to know about them ahead of time.
 */
export default async function IntegrationsPage({
  params,
}: {
  params: Promise<{ orgId: string }>
}) {
  const { orgId: raw } = await params
  const orgId = Number(raw)
  if (!Number.isInteger(orgId)) notFound()

  try {
    await requireCapability(orgId, 'manage_integrations')
  } catch (err) {
    if (err instanceof HttpError && err.status === 401) redirect('/')
    if (err instanceof HttpError && err.status === 403) {
      return (
        <NoAccess
          title="You can't manage integrations"
          message="Connecting GitHub, Slack and Google Calendar for the workspace is limited to people with the integrations permission. Ask an owner to grant it if you need to set these up."
          backHref={`/org/${orgId}`}
          backLabel="Back to dashboard"
        />
      )
    }
    throw err
  }

  const org = await db.query.orgs.findFirst({ where: eq(schema.orgs.id, orgId) })
  if (!org) notFound()

  // Per-user GitHub link status across the org. Used by the Integrations
  // card so the owner can see "5 of 8 teammates have connected" instead of
  // wondering what an org-level GitHub "connect" button would even mean.
  const teammates = await db
    .select({
      userId: schema.users.id,
      hasGithub: schema.users.accessToken,
      githubId: schema.users.githubId,
      githubLogin: schema.users.githubLogin,
    })
    .from(schema.memberships)
    .innerJoin(schema.users, eq(schema.memberships.userId, schema.users.id))
    .where(
      and(
        eq(schema.memberships.orgId, orgId),
        isNull(schema.memberships.endedAt),
      ),
    )
  // "Linked" = OAuth token, known githubId, OR an invite-supplied username —
  // any of these lets the App attribute their work.
  const githubLinked = teammates.filter((t) => !!t.hasGithub || t.githubId != null || !!t.githubLogin).length
  const teamSize = teammates.length

  // Google Calendar tokens live on `accounts` (provider='google'). Count
  // active calendar links across the team for the "5 of 8 connected" badge.
  const calendarLinks = await db
    .select({ userId: schema.accounts.userId })
    .from(schema.accounts)
    .innerJoin(schema.memberships, eq(schema.memberships.userId, schema.accounts.userId))
    .where(
      and(
        eq(schema.memberships.orgId, orgId),
        isNull(schema.memberships.endedAt),
        eq(schema.accounts.provider, 'google'),
        isNotNull(schema.accounts.access_token),
      ),
    )
  const calendarLinked = calendarLinks.length

  return (
    <>
      <div className="mb-4">
        <h1 className="app-h1">Settings</h1>
        <p className="mt-1.5 text-[13px] text-[var(--m-ink-2)]">
          Connect the tools your team uses. Each integration adds context to the
          per-person view without forcing engineering-shaped data on everyone.
        </p>
      </div>

      <IntegrationsClient
        orgId={orgId}
        initial={{
          trackedGithubOrgs: (org as { trackedGithubOrgs?: string[] }).trackedGithubOrgs ?? [],
          hasSlack: !!org.slackWebhookUrl,
          slackInstall: org.slackBotToken
            ? {
                teamName: org.slackTeamName ?? 'Slack workspace',
                installedAt: org.slackInstalledAt?.toISOString() ?? null,
                defaultChannelId: org.slackDefaultChannelId,
              }
            : null,
          githubLinked,
          calendarLinked,
          teamSize,
          githubApp: {
            configured: githubAppConfigured(),
            installationId: (org as { githubInstallationId?: number | null }).githubInstallationId ?? null,
            installUrl: appInstallUrl(orgId),
          },
        }}
      />
    </>
  )
}
