import { notFound } from 'next/navigation'
import Link from 'next/link'
import { and, desc, eq, gte, inArray, isNull, like, not } from 'drizzle-orm'
import { db, schema } from '@/lib/db/client'
import { githubAppConfigured } from '@/lib/github/app'
import GithubSyncButton from './sync-button'
import { HubHeader, StatCard, Card, EmptyState } from '../ui'
import GithubConstellation, { type GhDetail } from './constellation'
import type { CNode, CEdge } from '@/components/collaboration-constellation'

export const dynamic = 'force-dynamic'

const DAY_MS = 24 * 60 * 60 * 1000

const TYPE_STYLE: Record<string, { label: string; bg: string; fg: string }> = {
  commit: { label: 'commit', bg: 'var(--m-accent-soft)', fg: 'var(--m-accent-2)' },
  pr_opened: { label: 'PR', bg: 'var(--m-clay-soft)', fg: 'var(--m-clay-deep)' },
  pr_reviewed: { label: 'review', bg: 'var(--m-gold-soft)', fg: '#9a7a2e' },
  issue_closed: { label: 'issue', bg: 'var(--m-bg-soft)', fg: 'var(--m-ink-3)' },
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function prStatus(raw: any): string {
  const s = (raw?.status as string) ?? 'open'
  if (s === 'open' && (raw?.requestedReviewers ?? 0) > 0) return 'in_review'
  return s
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
          raw: schema.githubEvents.raw,
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
        .limit(600)
    : []

  const nameByUser = new Map(members.map((m) => [m.userId, m.name ?? `@${m.login}`]))
  const loginToUserId = new Map(members.map((m) => [m.login.toLowerCase(), m.userId]))
  const detail: Record<number, GhDetail> = {}
  for (const m of members) detail[m.userId] = { name: nameByUser.get(m.userId)!, commits: 0, prs: [], reviewsGiven: [], reviewsReceived: [], recentCommitTitles: [] }
  const seenCommit = new Map<number, Set<string>>()
  const repoCount = new Map<string, number>()
  const edgeW = new Map<string, number>()
  const totals = { commits: 0, prs: 0, reviews: 0 }

  for (const e of events) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const r = (e.raw ?? {}) as any
    const d = detail[e.userId]
    repoCount.set(e.repo, (repoCount.get(e.repo) ?? 0) + 1)
    if (e.type === 'commit') {
      totals.commits++
      if (d) {
        d.commits++
        const key = e.title.trim().toLowerCase()
        const set = seenCommit.get(e.userId) ?? new Set<string>()
        if (key.length >= 3 && !set.has(key) && d.recentCommitTitles.length < 6) {
          set.add(key)
          d.recentCommitTitles.push(e.title)
          seenCommit.set(e.userId, set)
        }
      }
    } else if (e.type === 'pr_opened') {
      totals.prs++
      if (d) d.prs.push({ title: e.title, url: e.url, status: prStatus(r) })
    } else if (e.type === 'pr_reviewed') {
      totals.reviews++
      if (d) d.reviewsGiven.push({ title: e.title, url: e.url, prAuthor: r?.prAuthor ?? null, verdict: r?.verdict ?? null })
      const authorId = loginToUserId.get(String(r?.prAuthor ?? '').toLowerCase())
      if (authorId != null && detail[authorId]) detail[authorId].reviewsReceived.push({ title: e.title, url: e.url, reviewer: nameByUser.get(e.userId)!, verdict: r?.verdict ?? null })
      if (authorId != null && authorId !== e.userId) {
        const a = Math.min(authorId, e.userId)
        const b = Math.max(authorId, e.userId)
        const k = `${a}|${b}`
        edgeW.set(k, (edgeW.get(k) ?? 0) + 1)
      }
    }
  }

  const nodes: CNode[] = []
  const nodeIds = new Set<number>()
  for (const m of members) {
    const d = detail[m.userId]
    const own = d.commits + d.prs.length + d.reviewsGiven.length
    const touched = own + d.reviewsReceived.length
    if (touched > 0) {
      nodes.push({ id: m.userId, label: d.name, value: Math.max(1, own) })
      nodeIds.add(m.userId)
    }
  }
  const edges: CEdge[] = Array.from(edgeW.entries())
    .map(([k, w]) => {
      const [a, b] = k.split('|').map(Number)
      return { source: a, target: b, weight: w }
    })
    .filter((e) => nodeIds.has(e.source) && nodeIds.has(e.target))

  const topRepos = Array.from(repoCount.entries()).sort((a, b) => b[1] - a[1]).slice(0, 10)
  const feed = events.slice(0, 18).map((e) => ({ ...e, name: nameByUser.get(e.userId) ?? `#${e.userId}` }))

  return (
    <div className="max-w-5xl">
      <HubHeader
        brand="github"
        title="GitHub"
        subtitle="Org-wide code activity from the GitHub App — last 14 days."
        actions={installationId ? <GithubSyncButton orgId={orgId} /> : undefined}
      />

      <div className="rounded-xl border border-[var(--m-border)] bg-white px-4 py-2.5 mb-5 flex items-center gap-3 flex-wrap">
        <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${installationId ? 'bg-[var(--m-good-soft)] text-[var(--m-good)]' : 'bg-[var(--m-bg-soft)] text-[var(--m-ink-4)]'}`}>
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
          action={<Link href={`/org/${orgId}/settings/integrations`} className="btn-primary inline-flex">Go to Integrations</Link>}
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
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 mb-5">
            <StatCard value={totals.commits} label="commits" accent="var(--m-accent-2)" />
            <StatCard value={totals.prs} label="pull requests" accent="var(--m-clay-deep)" />
            <StatCard value={totals.reviews} label="reviews" accent="#9a7a2e" />
            <StatCard value={repoCount.size} label="active repos" />
          </div>

          {/* Constellation — the centrepiece */}
          <div className="mb-5">
            <div className="flex items-baseline justify-between gap-3 mb-2 flex-wrap">
              <h2 className="text-[12.5px] font-semibold text-[var(--m-ink)]">Collaboration map</h2>
              <p className="text-[11px] text-[var(--m-ink-4)]">
                ★ size = activity · lines = code reviews · <span className="text-[var(--m-ink-3)]">click a teammate to drill in</span>
              </p>
            </div>
            <GithubConstellation nodes={nodes} edges={edges} detail={detail} />
          </div>

          <div className="grid lg:grid-cols-5 gap-4">
            {/* Recent feed */}
            <div className="lg:col-span-3">
              <Card title="Recent activity" hint="newest first">
                <ul className="divide-y divide-[var(--m-border-soft)] -my-1">
                  {feed.map((e, i) => {
                    const st = TYPE_STYLE[e.type] ?? TYPE_STYLE.issue_closed
                    return (
                      <li key={i} className="py-1.5">
                        <a href={e.url} target="_blank" rel="noreferrer" className="flex items-center gap-2.5 group">
                          <span className="shrink-0 text-[9.5px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded w-[52px] text-center" style={{ background: st.bg, color: st.fg }}>
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

            {/* Active repos */}
            <div className="lg:col-span-2">
              <Card title="Active repos" hint={`${topRepos.length}`}>
                <div className="flex flex-wrap gap-1.5">
                  {topRepos.map(([repo, n]) => (
                    <span key={repo} className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--m-border)] bg-white px-2.5 py-1 text-[12px] text-[var(--m-ink-2)]">
                      {repo.split('/').pop()}
                      <span className="text-[10.5px] text-[var(--m-ink-4)] tabular-nums bg-[var(--m-bg-soft)] rounded px-1">{n}</span>
                    </span>
                  ))}
                </div>
              </Card>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
