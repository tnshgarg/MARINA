import { notFound } from 'next/navigation'
import Link from 'next/link'
import { and, desc, eq, gte, inArray, isNull, like, not } from 'drizzle-orm'
import { db, schema } from '@/lib/db/client'
import { githubAppConfigured } from '@/lib/github/app'
import GithubSyncButton from './sync-button'

export const dynamic = 'force-dynamic'

const DAY_MS = 24 * 60 * 60 * 1000

const TYPE_LABEL: Record<string, string> = {
  commit: 'commit',
  pr_opened: 'PR',
  pr_reviewed: 'review',
  issue_closed: 'issue',
}

/**
 * GitHub integration detail — the org-wide read of the App installation:
 * connection status, a 14-day activity leaderboard per teammate, the recent
 * cross-team feed, and top repos. Reuses the same github_events the per-person
 * Work view is built from.
 */
export default async function GithubHubPage({
  params,
}: {
  params: Promise<{ orgId: string }>
}) {
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

  // Per-person leaderboard.
  const nameByUser = new Map(members.map((m) => [m.userId, m.name ?? `@${m.login}`]))
  const per = new Map<number, { commits: number; prs: number; reviews: number }>()
  const repoCount = new Map<string, number>()
  for (const e of events) {
    const p = per.get(e.userId) ?? { commits: 0, prs: 0, reviews: 0 }
    if (e.type === 'commit') p.commits++
    else if (e.type === 'pr_opened') p.prs++
    else if (e.type === 'pr_reviewed') p.reviews++
    per.set(e.userId, p)
    repoCount.set(e.repo, (repoCount.get(e.repo) ?? 0) + 1)
  }
  const leaderboard = Array.from(per.entries())
    .map(([userId, c]) => ({ name: nameByUser.get(userId) ?? `#${userId}`, ...c, total: c.commits + c.prs + c.reviews }))
    .sort((a, b) => b.total - a.total)
  const topRepos = Array.from(repoCount.entries()).sort((a, b) => b[1] - a[1]).slice(0, 8)
  const feed = events.slice(0, 30).map((e) => ({ ...e, name: nameByUser.get(e.userId) ?? `#${e.userId}` }))

  return (
    <div className="max-w-3xl">
      <div className="flex items-start justify-between gap-3 mb-4">
        <div>
          <h1 className="app-h1">GitHub</h1>
          <p className="mt-1 text-[13px] text-[var(--m-ink-3)]">
            Org-wide code activity from the GitHub App — last 14 days.
          </p>
        </div>
        {installationId && <GithubSyncButton orgId={orgId} />}
      </div>

      {/* Status */}
      <div className="rounded-xl border border-[var(--m-border)] bg-white px-4 py-3 mb-5 flex items-center gap-3 flex-wrap">
        <span
          className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${
            installationId ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'
          }`}
        >
          {installationId ? 'App installed' : 'Not installed'}
        </span>
        <span className="text-[12px] text-[var(--m-ink-3)]">
          {linkedCount} of {members.length} teammate{members.length === 1 ? '' : 's'} linked their GitHub identity
        </span>
        <Link
          href={`/org/${orgId}/settings/integrations`}
          className="ml-auto text-[12px] font-medium text-[var(--m-accent)] hover:text-[var(--m-accent-2)]"
        >
          Manage in settings →
        </Link>
      </div>

      {!installationId ? (
        <div className="rounded-xl border border-[var(--m-border)] bg-white p-6 text-center">
          <p className="text-[14px] font-medium text-[var(--m-ink)]">
            {configured ? 'Install the GitHub App to start tracking' : 'GitHub App not configured on this deployment'}
          </p>
          <p className="mt-1.5 text-[12.5px] text-[var(--m-ink-3)] max-w-md mx-auto">
            Once installed on your org and pointed at the repos you choose, MARINA reads commits, PRs,
            and reviews server-side and attributes each to the teammate who did the work.
          </p>
          <Link
            href={`/org/${orgId}/settings/integrations`}
            className="mt-4 inline-flex px-4 py-2 rounded-lg bg-[var(--m-ink)] hover:bg-[var(--m-ink-2)] text-white text-[13px] font-medium transition"
          >
            Go to Integrations
          </Link>
        </div>
      ) : events.length === 0 ? (
        <p className="text-[13px] text-[var(--m-ink-3)] italic">
          No activity in the last 14 days. Click <strong>Sync now</strong>, and make sure teammates have linked their GitHub.
        </p>
      ) : (
        <div className="space-y-6">
          {/* Leaderboard */}
          <section>
            <h2 className="text-[11px] uppercase tracking-wider font-semibold text-[var(--m-ink-4)] mb-2">By teammate</h2>
            <div className="rounded-xl border border-[var(--m-border-soft)] bg-white divide-y divide-[var(--m-border-soft)]">
              {leaderboard.map((p) => (
                <div key={p.name} className="flex items-center gap-3 px-3.5 py-2.5">
                  <span className="text-[13px] font-medium text-[var(--m-ink)] truncate flex-1 min-w-0">{p.name}</span>
                  <span className="text-[11.5px] text-[var(--m-ink-3)] tabular-nums shrink-0">
                    {p.commits} commits · {p.prs} PRs · {p.reviews} reviews
                  </span>
                </div>
              ))}
            </div>
          </section>

          {/* Recent feed */}
          <section>
            <h2 className="text-[11px] uppercase tracking-wider font-semibold text-[var(--m-ink-4)] mb-2">Recent activity</h2>
            <ul className="space-y-1">
              {feed.map((e, i) => (
                <li key={i}>
                  <a href={e.url} target="_blank" rel="noreferrer" className="flex items-baseline gap-2 group">
                    <span className="shrink-0 text-[10px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded bg-slate-100 text-slate-600">
                      {TYPE_LABEL[e.type] ?? e.type}
                    </span>
                    <span className="text-[12.5px] text-[var(--m-ink)] group-hover:text-[var(--m-accent)] truncate">
                      <span className="text-[var(--m-ink-3)]">{e.name}: </span>
                      {e.title}
                    </span>
                    <span className="ml-auto shrink-0 text-[10.5px] text-[var(--m-ink-4)] truncate max-w-[120px]">{e.repo}</span>
                  </a>
                </li>
              ))}
            </ul>
          </section>

          {/* Repos */}
          {topRepos.length > 0 && (
            <section>
              <h2 className="text-[11px] uppercase tracking-wider font-semibold text-[var(--m-ink-4)] mb-2">Active repos</h2>
              <div className="flex flex-wrap gap-1.5">
                {topRepos.map(([repo, n]) => (
                  <span key={repo} className="inline-flex items-baseline gap-1 rounded-md border border-[var(--m-border-soft)] bg-white px-2 py-1 text-[11.5px] text-[var(--m-ink-2)]">
                    {repo.split('/').pop()} <span className="text-[var(--m-ink-4)] tabular-nums">{n}</span>
                  </span>
                ))}
              </div>
            </section>
          )}
        </div>
      )}
    </div>
  )
}
