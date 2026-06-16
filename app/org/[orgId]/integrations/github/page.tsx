import { notFound } from 'next/navigation'
import Link from 'next/link'
import { and, desc, eq, gte, inArray, isNull, like, not } from 'drizzle-orm'
import { db, schema } from '@/lib/db/client'
import { githubAppConfigured } from '@/lib/github/app'
import GithubSyncButton from './sync-button'
import { HubHeader, StatCard, Card, EmptyState } from '../ui'

export const dynamic = 'force-dynamic'

const DAY_MS = 24 * 60 * 60 * 1000

const TYPE_STYLE: Record<string, { label: string; bg: string; fg: string }> = {
  commit: { label: 'commit', bg: 'var(--m-accent-soft)', fg: 'var(--m-accent-2)' },
  pr_opened: { label: 'PR', bg: 'var(--m-clay-soft)', fg: 'var(--m-clay-deep)' },
  pr_reviewed: { label: 'review', bg: 'var(--m-gold-soft)', fg: '#9a7a2e' },
  issue_closed: { label: 'issue', bg: 'var(--m-bg-soft)', fg: 'var(--m-ink-3)' },
}

export default async function GithubHubPage({ params }: { params: Promise<{ orgId: string }> }) {
  const { orgId: raw } = await params
  const orgId = Number(raw)
  if (!Number.isInteger(orgId)) notFound()

  const org = await db.query.orgs.findFirst({ where: eq(schema.orgs.id, orgId) })
  if (!org) notFound()
  const installationId = (org as { githubInstallationId?: number | null }).githubInstallationId ?? null
  const configured = githubAppConfigured()

  const members = await db
    .select({ userId: schema.users.id, name: schema.users.name, login: schema.users.login, hasGithub: schema.users.accessToken })
    .from(schema.memberships)
    .innerJoin(schema.users, eq(schema.memberships.userId, schema.users.id))
    .where(and(eq(schema.memberships.orgId, orgId), isNull(schema.memberships.endedAt)))
  const userIds = members.map((m) => m.userId)
  const linkedCount = members.filter((m) => m.hasGithub).length

  const since14 = new Date(Date.now() - 14 * DAY_MS)
  const events = userIds.length
    ? await db
        .select({
          userId: schema.githubEvents.userId,
          type: schema.githubEvents.type,
          repo: schema.githubEvents.repo,
          title: schema.githubEvents.title,
          url: schema.githubEvents.url,
          occurredAt: schema.githubEvents.occurredAt,
        })
        .from(schema.githubEvents)
        .where(
          and(
            inArray(schema.githubEvents.userId, userIds),
            gte(schema.githubEvents.occurredAt, since14),
            not(like(schema.githubEvents.externalId, 'seed-%')),
          ),
        )
        .orderBy(desc(schema.githubEvents.occurredAt))
        .limit(400)
    : []

  const nameByUser = new Map(members.map((m) => [m.userId, m.name ?? `@${m.login}`]))
  const per = new Map<number, { commits: number; prs: number; reviews: number }>()
  const repoCount = new Map<string, number>()
  const totals = { commits: 0, prs: 0, reviews: 0 }
  for (const e of events) {
    const p = per.get(e.userId) ?? { commits: 0, prs: 0, reviews: 0 }
    if (e.type === 'commit') { p.commits++; totals.commits++ }
    else if (e.type === 'pr_opened') { p.prs++; totals.prs++ }
    else if (e.type === 'pr_reviewed') { p.reviews++; totals.reviews++ }
    per.set(e.userId, p)
    repoCount.set(e.repo, (repoCount.get(e.repo) ?? 0) + 1)
  }
  const leaderboard = Array.from(per.entries())
    .map(([userId, c]) => ({ name: nameByUser.get(userId) ?? `#${userId}`, ...c, total: c.commits + c.prs + c.reviews }))
    .sort((a, b) => b.total - a.total)
  const maxTotal = leaderboard[0]?.total ?? 1
  const topRepos = Array.from(repoCount.entries()).sort((a, b) => b[1] - a[1]).slice(0, 10)
  const feed = events.slice(0, 40).map((e) => ({ ...e, name: nameByUser.get(e.userId) ?? `#${e.userId}` }))

  return (
    <div className="max-w-5xl">
      <HubHeader
        brand="github"
        title="GitHub"
        subtitle="Org-wide code activity from the GitHub App — last 14 days."
        actions={installationId ? <GithubSyncButton orgId={orgId} /> : undefined}
      />

      {/* Status strip */}
      <div className="rounded-xl border border-[var(--m-border)] bg-white px-4 py-2.5 mb-5 flex items-center gap-3 flex-wrap">
        <span
          className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${
            installationId ? 'bg-[var(--m-good-soft)] text-[var(--m-good)]' : 'bg-[var(--m-bg-soft)] text-[var(--m-ink-4)]'
          }`}
        >
          {installationId ? '● App installed' : 'Not installed'}
        </span>
        <span className="text-[12px] text-[var(--m-ink-3)]">
          {linkedCount} of {members.length} teammate{members.length === 1 ? '' : 's'} linked their GitHub identity
        </span>
        <Link href={`/org/${orgId}/settings/integrations`} className="ml-auto text-[12px] font-medium text-[var(--m-accent)] hover:text-[var(--m-accent-2)]">
          Manage →
        </Link>
      </div>

      {!installationId ? (
        <EmptyState
          brand="github"
          title={configured ? 'Install the GitHub App to start tracking' : 'GitHub App not configured on this deployment'}
          body="Install it on your org and pick the repos to share — MARINA reads commits, PRs and reviews server-side and attributes each to the teammate who did the work."
          action={
            <Link href={`/org/${orgId}/settings/integrations`} className="btn-primary inline-flex">
              Go to Integrations
            </Link>
          }
        />
      ) : events.length === 0 ? (
        <EmptyState
          brand="github"
          title="No activity in the last 14 days"
          body="Click Sync now to pull from GitHub, and make sure teammates have linked their GitHub identity so their commits attribute."
          action={<GithubSyncButton orgId={orgId} />}
        />
      ) : (
        <>
          {/* Hero stats */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 mb-5">
            <StatCard value={totals.commits} label="commits" accent="var(--m-accent-2)" />
            <StatCard value={totals.prs} label="pull requests" accent="var(--m-clay-deep)" />
            <StatCard value={totals.reviews} label="reviews" accent="#9a7a2e" />
            <StatCard value={repoCount.size} label="active repos" />
          </div>

          <div className="grid lg:grid-cols-5 gap-4">
            {/* Leaderboard */}
            <div className="lg:col-span-2">
              <Card title="By teammate" hint={`${leaderboard.length}`}>
                <ul className="space-y-3">
                  {leaderboard.map((p) => (
                    <li key={p.name}>
                      <div className="flex items-baseline justify-between gap-2 mb-1">
                        <span className="text-[12.5px] font-medium text-[var(--m-ink)] truncate">{p.name}</span>
                        <span className="text-[11px] text-[var(--m-ink-4)] tabular-nums shrink-0">{p.total}</span>
                      </div>
                      {/* Proportional contribution bar */}
                      <div className="flex h-1.5 rounded-full overflow-hidden bg-[var(--m-bg-soft)]" style={{ width: `${Math.max(8, (p.total / maxTotal) * 100)}%` }}>
                        {p.commits > 0 && <span style={{ flex: p.commits, background: 'var(--m-accent)' }} />}
                        {p.prs > 0 && <span style={{ flex: p.prs, background: 'var(--m-clay)' }} />}
                        {p.reviews > 0 && <span style={{ flex: p.reviews, background: 'var(--m-gold)' }} />}
                      </div>
                      <p className="mt-1 text-[10.5px] text-[var(--m-ink-4)] tabular-nums">
                        {p.commits}c · {p.prs} PR · {p.reviews} rev
                      </p>
                    </li>
                  ))}
                </ul>
                {/* legend */}
                <div className="mt-3 pt-2.5 border-t border-[var(--m-border-soft)] flex items-center gap-3 text-[10px] text-[var(--m-ink-4)]">
                  <Legend color="var(--m-accent)" label="commits" />
                  <Legend color="var(--m-clay)" label="PRs" />
                  <Legend color="var(--m-gold)" label="reviews" />
                </div>
              </Card>
            </div>

            {/* Recent activity feed */}
            <div className="lg:col-span-3">
              <Card title="Recent activity" hint="newest first" className="h-full">
                <ul className="divide-y divide-[var(--m-border-soft)] -my-1">
                  {feed.map((e, i) => {
                    const st = TYPE_STYLE[e.type] ?? TYPE_STYLE.issue_closed
                    return (
                      <li key={i} className="py-1.5">
                        <a href={e.url} target="_blank" rel="noreferrer" className="flex items-center gap-2.5 group">
                          <span
                            className="shrink-0 text-[9.5px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded w-[52px] text-center"
                            style={{ background: st.bg, color: st.fg }}
                          >
                            {st.label}
                          </span>
                          <span className="min-w-0 flex-1 text-[12.5px] text-[var(--m-ink)] group-hover:text-[var(--m-accent)] truncate">
                            <span className="text-[var(--m-ink-3)]">{e.name}: </span>
                            {e.title}
                          </span>
                          <span className="shrink-0 text-[10.5px] text-[var(--m-ink-4)] truncate max-w-[120px]">{e.repo.split('/').pop()}</span>
                        </a>
                      </li>
                    )
                  })}
                </ul>
              </Card>
            </div>
          </div>

          {/* Active repos */}
          {topRepos.length > 0 && (
            <div className="mt-4">
              <p className="text-[10.5px] uppercase tracking-wider font-semibold text-[var(--m-ink-4)] mb-2">Active repos</p>
              <div className="flex flex-wrap gap-1.5">
                {topRepos.map(([repo, n]) => (
                  <span key={repo} className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--m-border)] bg-white px-2.5 py-1 text-[12px] text-[var(--m-ink-2)]">
                    {repo.split('/').pop()}
                    <span className="text-[10.5px] text-[var(--m-ink-4)] tabular-nums bg-[var(--m-bg-soft)] rounded px-1">{n}</span>
                  </span>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1">
      <span className="w-2 h-2 rounded-sm" style={{ background: color }} /> {label}
    </span>
  )
}
