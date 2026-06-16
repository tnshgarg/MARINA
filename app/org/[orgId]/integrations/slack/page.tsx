import { notFound } from 'next/navigation'
import Link from 'next/link'
import { and, eq, isNull, isNotNull, sql } from 'drizzle-orm'
import { db, schema } from '@/lib/db/client'
import { getSlackInstall } from '@/lib/slack/client'
import { HubHeader, Card, EmptyState } from '../ui'

export const dynamic = 'force-dynamic'

export default async function SlackHubPage({ params }: { params: Promise<{ orgId: string }> }) {
  const { orgId: raw } = await params
  const orgId = Number(raw)
  if (!Number.isInteger(orgId)) notFound()

  const org = await db.query.orgs.findFirst({ where: eq(schema.orgs.id, orgId) })
  if (!org) notFound()

  const install = await getSlackInstall(orgId)

  const [memberCountRow, resolvedCountRow] = await Promise.all([
    db
      .select({ n: sql<number>`count(*)` })
      .from(schema.memberships)
      .where(and(eq(schema.memberships.orgId, orgId), isNull(schema.memberships.endedAt))),
    db
      .select({ n: sql<number>`count(*)` })
      .from(schema.memberships)
      .where(and(eq(schema.memberships.orgId, orgId), isNull(schema.memberships.endedAt), isNotNull(schema.memberships.slackUserId))),
  ])
  const memberCount = Number(memberCountRow[0]?.n ?? 0)
  const resolvedCount = Number(resolvedCountRow[0]?.n ?? 0)

  return (
    <div className="max-w-3xl">
      <HubHeader
        brand="slack"
        title="Slack"
        subtitle="Where MARINA sends nudges, digests, and DMs."
        actions={
          <Link href={`/org/${orgId}/settings/integrations`} className="btn-secondary inline-flex">
            Manage
          </Link>
        }
      />

      {!install ? (
        <EmptyState
          brand="slack"
          title="Slack isn't connected"
          body="Connect Slack so MARINA can DM teammates their daily brief, post blocker alerts to a channel, and answer slash-command questions about the team."
          action={
            <a href={`/api/connect/slack/install?orgId=${orgId}`} className="inline-flex px-4 py-2 rounded-lg text-white text-[13px] font-medium transition" style={{ background: '#4A154B' }}>
              Connect Slack
            </a>
          }
        />
      ) : (
        <div className="space-y-4">
          {/* Connection banner */}
          <div className="rounded-xl border border-[var(--m-border)] bg-white px-4 py-3 flex items-center gap-3 flex-wrap">
            <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-[var(--m-good-soft)] text-[var(--m-good)]">● Connected</span>
            <span className="text-[13.5px] font-semibold text-[var(--m-ink)]">{install.teamName || 'Slack workspace'}</span>
            {org.slackInstalledAt && (
              <span className="text-[11.5px] text-[var(--m-ink-4)]">
                since {new Date(org.slackInstalledAt).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })}
              </span>
            )}
          </div>

          <div className="grid sm:grid-cols-2 gap-3">
            <Card title="Default channel">
              {install.defaultChannelId ? (
                <p className="font-mono text-[13px] text-[var(--m-ink)]">#{install.defaultChannelId}</p>
              ) : (
                <p className="text-[12.5px] text-[var(--m-ink-3)] italic">Not set — channel posts are off until you pick one in settings.</p>
              )}
            </Card>
            <Card title="Reachable by DM">
              <p className="text-[23px] font-semibold tabular-nums text-[var(--m-clay-deep)] leading-none">
                {resolvedCount}
                <span className="text-[13px] font-medium text-[var(--m-ink-4)]"> / {memberCount} teammates</span>
              </p>
              {resolvedCount < memberCount && (
                <p className="mt-2 text-[11px] text-[var(--m-ink-4)] leading-snug">Unresolved teammates are matched by email on first DM.</p>
              )}
            </Card>
          </div>

          <p className="text-[12px] text-[var(--m-ink-4)]">
            Connect, disconnect, the default channel, and the legacy webhook are all managed under{' '}
            <Link href={`/org/${orgId}/settings/integrations`} className="text-[var(--m-accent)] hover:underline">
              Settings → Integrations
            </Link>
            .
          </p>
        </div>
      )}
    </div>
  )
}
