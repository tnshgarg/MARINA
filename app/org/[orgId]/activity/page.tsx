import { notFound } from 'next/navigation'
import { and, desc, eq, gte, inArray, not, like, sql } from 'drizzle-orm'
import { db, schema } from '@/lib/db/client'
import { withMembershipWindow } from '@/lib/auth/tenant-scope'
import { CharacterAvatar } from '@/components/character-avatar'
import { ActivityTabs } from '@/components/org-tabs'
import { afterResponse } from '@/lib/after'
import { syncUserActivity } from '@/lib/github/sync'

export const dynamic = 'force-dynamic'

const TYPE_LABEL: Record<string, string> = {
  commit: 'commit',
  pr_opened: 'PR opened',
  pr_reviewed: 'review',
  issue_closed: 'issue closed',
  deliverable: 'shipped',
}
const TYPE_PILL: Record<string, string> = {
  commit: 'pill-info',
  pr_opened: 'pill-violet',
  pr_reviewed: 'pill-good',
  issue_closed: 'pill-pink',
  deliverable: 'pill-good',
}

type FeedItem = {
  id: string
  occurredAt: Date
  type: 'commit' | 'pr_opened' | 'pr_reviewed' | 'issue_closed' | 'deliverable'
  title: string
  url: string | null
  source: string  // repo for GH events, "self-reported · <kind>" for deliverables
  user: { id: number; login: string; name: string | null; characterKey: string | null }
}

// Manager+ guard from parent layout.
export default async function ActivityPage({ params }: { params: Promise<{ orgId: string }> }) {
  const { orgId: raw } = await params
  const orgId = Number(raw)
  if (!Number.isInteger(orgId)) notFound()

  const memberRows = await db
    .select({ userId: schema.memberships.userId })
    .from(schema.memberships)
    .where(and(eq(schema.memberships.orgId, orgId), sql`${schema.memberships.endedAt} IS NULL`))
  const userIds = memberRows.map((m) => m.userId)

  // We read the org separately so we can pass `trackedGithubOrgs` to the
  // auto-sync below (it filters out repos owned by orgs the workspace
  // hasn't allowlisted).
  const org = await db.query.orgs.findFirst({ where: eq(schema.orgs.id, orgId) })

  const since30 = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)

  const [ghRows, deliverableRows, members] = await Promise.all([
    userIds.length
      ? db
          .select({ e: schema.githubEvents, u: schema.users })
          .from(schema.githubEvents)
          .innerJoin(schema.users, eq(schema.githubEvents.userId, schema.users.id))
          .where(
            and(
              inArray(schema.githubEvents.userId, userIds),
              not(like(schema.githubEvents.externalId, 'seed-%')),
              // Multi-tenant isolation: only show events that fell within
              // the user's membership window for THIS org. Without this a
              // user in two orgs leaks data across them.
              withMembershipWindow(
                orgId,
                sql.raw('github_events.user_id'),
                sql.raw('github_events.occurred_at'),
              ),
            ),
          )
          .orderBy(desc(schema.githubEvents.occurredAt))
          .limit(100)
      : Promise.resolve([] as Array<{ e: typeof schema.githubEvents.$inferSelect; u: typeof schema.users.$inferSelect }>),
    // Self-reported deliverables — universal output, works for non-engineers.
    userIds.length
      ? db
          .select({ d: schema.deliverables, u: schema.users })
          .from(schema.deliverables)
          .innerJoin(schema.users, eq(schema.deliverables.userId, schema.users.id))
          .where(
            and(
              eq(schema.deliverables.orgId, orgId),
              inArray(schema.deliverables.userId, userIds),
              gte(schema.deliverables.completedAt, since30),
            ),
          )
          .orderBy(desc(schema.deliverables.completedAt))
          .limit(100)
      : Promise.resolve([] as Array<{ d: typeof schema.deliverables.$inferSelect; u: typeof schema.users.$inferSelect }>),
    userIds.length
      ? db
          .select()
          .from(schema.users)
          .where(inArray(schema.users.id, userIds))
      : Promise.resolve([] as Array<typeof schema.users.$inferSelect>),
  ])

  // Merge into one feed sorted by time so engineers' PRs and designers'
  // deliverables sit side by side, not in two separate lists.
  const feed: FeedItem[] = []
  for (const { e, u } of ghRows) {
    feed.push({
      id: `gh-${e.id}`,
      occurredAt: e.occurredAt,
      type: e.type as FeedItem['type'],
      title: e.title,
      url: e.url,
      source: e.repo,
      user: { id: u.id, login: u.login, name: u.name, characterKey: u.characterKey },
    })
  }
  for (const { d, u } of deliverableRows) {
    feed.push({
      id: `dl-${d.id}`,
      occurredAt: d.completedAt,
      type: 'deliverable',
      title: d.title,
      url: d.url,
      source: d.kind ? `self-reported · ${d.kind}` : 'self-reported',
      user: { id: u.id, login: u.login, name: u.name, characterKey: u.characterKey },
    })
  }
  feed.sort((a, b) => b.occurredAt.getTime() - a.occurredAt.getTime())
  const events = feed.slice(0, 150)

  const membersWithGitHub = members.filter((m) => !!m.accessToken)
  const membersWithoutGitHub = members.filter((m) => !m.accessToken)
  const membersWithSyncErrors = members.filter((m) => !!m.lastSyncError)
  const mostRecentSync = members
    .map((m) => m.lastSyncedAt)
    .filter((d): d is Date => d !== null)
    .sort((a, b) => b.getTime() - a.getTime())[0]

  // Fire-and-forget background sync. Anyone whose last sync is more than
  // 10 minutes stale gets a quiet refresh — no UI button, no waiting. The
  // refreshed events show up on the next visit (or after `router.refresh`).
  const STALE_MS = 10 * 60 * 1000
  const stale = membersWithGitHub.filter(
    (m) => !m.lastSyncedAt || Date.now() - m.lastSyncedAt.getTime() > STALE_MS,
  )
  if (stale.length > 0) {
    const tracked = (org as { trackedGithubOrgs?: string[] }).trackedGithubOrgs ?? []
    afterResponse(async () => {
      for (const m of stale) {
        if (!m.accessToken) continue
        try {
          await syncUserActivity(m.id, m.login, m.accessToken, 30, tracked)
        } catch (err) {
          console.warn(`[activity/auto-sync] user ${m.id} failed`, err)
        }
      }
    }, `activity auto-sync (${stale.length} stale)`)
  }

  return (
    <>
      <div className="mb-4 flex items-end justify-between gap-4 flex-wrap">
        <div>
          <h1 className="app-h1">Activity</h1>
          <p className="mt-1.5 text-[13px] text-slate-600">
            Recent activity across the team — GitHub events plus self-reported deliverables.
          </p>
        </div>
        {/* Auto-sync chip — replaces the noisy "Sync now" button. We refresh
            GitHub events in the background after every Activity page load,
            and just show when the most recent member sync completed. The
            actual sync is fire-and-forget via `afterResponse()` so it never
            blocks the page render. */}
        <p className="text-[11.5px] text-slate-500 inline-flex items-center gap-1.5">
          <span className="relative inline-flex">
            <span className="absolute inset-0 rounded-full bg-[var(--m-accent)]/40 animate-ping" />
            <span className="relative inline-block w-1.5 h-1.5 rounded-full bg-[var(--m-accent)]" />
          </span>
          {mostRecentSync ? <>Auto-sync · {timeAgo(mostRecentSync.toISOString())}</> : <>Syncing…</>}
        </p>
      </div>
      <ActivityTabs orgId={orgId} />

      {/* Sync error strip — surface failed syncs so they don't silently rot */}
      {membersWithSyncErrors.length > 0 && (
        <div className="mb-3 rounded-xl border border-rose-200 bg-rose-50/70 px-4 py-2.5">
          <p className="text-[12.5px] text-rose-900 font-medium leading-snug">
            <strong>{membersWithSyncErrors.length}</strong> sync error
            {membersWithSyncErrors.length === 1 ? '' : 's'}
          </p>
          <ul className="mt-1 space-y-0.5">
            {membersWithSyncErrors.slice(0, 5).map((m) => (
              <li key={m.id} className="text-[11.5px] text-rose-700/90">
                @{m.login}: <span className="text-rose-800/80">{m.lastSyncError}</span>
              </li>
            ))}
            {membersWithSyncErrors.length > 5 && (
              <li className="text-[11.5px] text-rose-600">
                · and {membersWithSyncErrors.length - 5} more
              </li>
            )}
          </ul>
        </div>
      )}

      {/* Coverage strip — but only nag about GitHub if at least one teammate
          IS an engineer with it linked, otherwise the message is misleading
          for design / sales / support teams who don't need GitHub. */}
      {membersWithGitHub.length > 0 && membersWithoutGitHub.length > 0 && (
        <div className="mb-5 rounded-xl border border-amber-200 bg-amber-50/70 px-4 py-2.5">
          <p className="text-[12.5px] text-amber-900 leading-snug">
            <strong>{membersWithoutGitHub.length}</strong> of {members.length} teammate
            {members.length === 1 ? '' : 's'} haven&apos;t connected GitHub.
            They can still appear here by marking work as done from their personal dashboard.
          </p>
        </div>
      )}

      <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
        {events.length === 0 ? (
          <EmptyState withGitHub={membersWithGitHub.length} totalMembers={members.length} />
        ) : (
          <ul className="divide-y divide-slate-100">
            {events.map((e) => (
              <li
                key={e.id}
                className="px-5 py-3 flex items-start gap-3 hover:bg-slate-50/60 transition-colors"
              >
                <CharacterAvatar characterKey={e.user.characterKey} size={28} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={`pill ${TYPE_PILL[e.type] ?? 'pill-slate'}`}>
                      {TYPE_LABEL[e.type] ?? e.type}
                    </span>
                    {e.url ? (
                      <a
                        href={e.url}
                        target="_blank"
                        rel="noreferrer"
                        className="text-[13px] text-slate-900 hover:text-[var(--m-accent)] truncate"
                      >
                        {e.title}
                      </a>
                    ) : (
                      <span className="text-[13px] text-slate-900 truncate">{e.title}</span>
                    )}
                  </div>
                  <p className="text-[11.5px] text-slate-500 mt-0.5">
                    {e.user.name ?? `@${e.user.login}`} · {e.source} · {timeAgo(e.occurredAt.toISOString())}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </>
  )
}

function EmptyState({ withGitHub, totalMembers }: { withGitHub: number; totalMembers: number }) {
  return (
    <div className="p-12 text-center">
      <h2 className="text-[15px] font-semibold text-slate-900">No activity yet</h2>
      <p className="mt-1.5 max-w-md mx-auto text-[12.5px] text-slate-600 leading-relaxed">
        {withGitHub === 0 && totalMembers > 0
          ? "Nobody on the team has signed in with GitHub yet, so we have no commits or PRs to show. Members who sign in with GitHub will have their activity auto-synced."
          : withGitHub > 0
            ? "Your team has GitHub linked but no recent activity matches. Click “Sync now” above to fetch the last 30 days."
            : "No team members yet. Invite teammates from the Members page."}
      </p>
    </div>
  )
}

function timeAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime()
  const m = Math.floor(ms / 60000)
  if (m < 1) return 'just now'
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  const d = Math.floor(h / 24)
  return `${d}d ago`
}
