import { notFound } from 'next/navigation'
import Link from 'next/link'
import { and, eq, isNull, isNotNull, sql } from 'drizzle-orm'
import { db, schema } from '@/lib/db/client'
import { getSlackInstall } from '@/lib/slack/client'

export const dynamic = 'force-dynamic'

/**
 * Slack integration detail — workspace connection status, the channel MARINA
 * posts to, and how many teammates are resolved for DMs. Connect / disconnect
 * still lives in Settings → Integrations; this is the at-a-glance health view.
 */
export default async function SlackHubPage({
  params,
}: {
  params: Promise<{ orgId: string }>
}) {
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
      .where(
        and(
          eq(schema.memberships.orgId, orgId),
          isNull(schema.memberships.endedAt),
          isNotNull(schema.memberships.slackUserId),
        ),
      ),
  ])
  const memberCount = Number(memberCountRow[0]?.n ?? 0)
  const resolvedCount = Number(resolvedCountRow[0]?.n ?? 0)

  return (
    <div className="max-w-2xl">
      <div className="flex items-start justify-between gap-3 mb-4">
        <div>
          <h1 className="app-h1">Slack</h1>
          <p className="mt-1 text-[13px] text-[var(--m-ink-3)]">
            Where MARINA sends nudges, digests, and DMs.
          </p>
        </div>
        <Link
          href={`/org/${orgId}/settings/integrations`}
          className="shrink-0 text-[12px] font-medium text-[var(--m-accent)] hover:text-[var(--m-accent-2)]"
        >
          Manage in settings →
        </Link>
      </div>

      {!install ? (
        <div className="rounded-xl border border-[var(--m-border)] bg-white p-6 text-center">
          <p className="text-[14px] font-medium text-[var(--m-ink)]">Slack isn&apos;t connected</p>
          <p className="mt-1.5 text-[12.5px] text-[var(--m-ink-3)] max-w-md mx-auto">
            Connect Slack so MARINA can DM teammates their daily brief, post blocker alerts to a
            channel, and answer slash-command questions about the team.
          </p>
          <a
            href={`/api/connect/slack/install?orgId=${orgId}`}
            className="mt-4 inline-flex px-4 py-2 rounded-lg bg-[#4A154B] hover:bg-[#611f64] text-white text-[13px] font-medium transition"
          >
            Connect Slack
          </a>
        </div>
      ) : (
        <div className="space-y-5">
          <div className="rounded-xl border border-[var(--m-border)] bg-white px-4 py-3 flex items-center gap-3 flex-wrap">
            <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700">Connected</span>
            <span className="text-[13px] font-medium text-[var(--m-ink)]">{install.teamName ?? 'Slack workspace'}</span>
            {org.slackInstalledAt && (
              <span className="text-[11.5px] text-[var(--m-ink-4)]">
                since {new Date(org.slackInstalledAt).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })}
              </span>
            )}
          </div>

          <div className="grid sm:grid-cols-2 gap-3">
            <Card label="Default channel">
              {install.defaultChannelId ? (
                <span className="font-mono text-[12.5px] text-[var(--m-ink)]">#{install.defaultChannelId}</span>
              ) : (
                <span className="text-[12.5px] text-[var(--m-ink-3)] italic">Not set — channel posts are off</span>
              )}
            </Card>
            <Card label="Teammates reachable by DM">
              <span className="text-[15px] font-semibold text-[var(--m-ink)] tabular-nums">
                {resolvedCount}
              </span>
              <span className="text-[12px] text-[var(--m-ink-4)]"> of {memberCount}</span>
              {resolvedCount < memberCount && (
                <p className="mt-1 text-[11px] text-[var(--m-ink-4)]">
                  Unresolved teammates are matched by email on first DM.
                </p>
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

function Card({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-[var(--m-border-soft)] bg-white px-4 py-3">
      <p className="text-[10.5px] uppercase tracking-wider font-semibold text-[var(--m-ink-4)] mb-1">{label}</p>
      <div>{children}</div>
    </div>
  )
}
