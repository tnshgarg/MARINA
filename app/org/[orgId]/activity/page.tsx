import { notFound } from 'next/navigation'
import { and, desc, eq, inArray, not, like } from 'drizzle-orm'
import { db, schema } from '@/lib/db/client'
import { CharacterAvatar } from '@/components/character-avatar'
import { ActivityTabs } from '@/components/org-tabs'
import { SyncTeamButton } from './sync-button'

export const dynamic = 'force-dynamic'

const TYPE_LABEL: Record<string, string> = {
  commit: 'commit',
  pr_opened: 'PR opened',
  pr_reviewed: 'review',
  issue_closed: 'issue closed',
}
const TYPE_PILL: Record<string, string> = {
  commit: 'pill-info',
  pr_opened: 'pill-violet',
  pr_reviewed: 'pill-good',
  issue_closed: 'pill-pink',
}

// Manager+ guard from parent layout.
export default async function ActivityPage({ params }: { params: Promise<{ orgId: string }> }) {
  const { orgId: raw } = await params
  const orgId = Number(raw)
  if (!Number.isInteger(orgId)) notFound()

  const memberRows = await db
    .select({ userId: schema.memberships.userId })
    .from(schema.memberships)
    .where(eq(schema.memberships.orgId, orgId))
  const userIds = memberRows.map((m) => m.userId)

  const [events, members] = await Promise.all([
    userIds.length
      ? db
          .select({ e: schema.githubEvents, u: schema.users })
          .from(schema.githubEvents)
          .innerJoin(schema.users, eq(schema.githubEvents.userId, schema.users.id))
          .where(
            and(
              inArray(schema.githubEvents.userId, userIds),
              // Hide demo seed rows from the real activity view.
              // Real events have numeric or SHA externalIds; seed rows start with "seed-".
              not(like(schema.githubEvents.externalId, 'seed-%')),
            ),
          )
          .orderBy(desc(schema.githubEvents.occurredAt))
          .limit(100)
      : Promise.resolve([] as Array<{ e: typeof schema.githubEvents.$inferSelect; u: typeof schema.users.$inferSelect }>),
    userIds.length
      ? db
          .select()
          .from(schema.users)
          .where(inArray(schema.users.id, userIds))
      : Promise.resolve([] as Array<typeof schema.users.$inferSelect>),
  ])

  const membersWithGitHub = members.filter((m) => !!m.accessToken)
  const membersWithoutGitHub = members.filter((m) => !m.accessToken)
  const membersWithSyncErrors = members.filter((m) => !!m.lastSyncError)
  const mostRecentSync = members
    .map((m) => m.lastSyncedAt)
    .filter((d): d is Date => d !== null)
    .sort((a, b) => b.getTime() - a.getTime())[0]

  return (
    <>
      <div className="mb-4 flex items-end justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-[22px] font-semibold text-slate-900 tracking-tight">Activity</h1>
          <p className="mt-1.5 text-[13px] text-slate-600">
            Recent GitHub activity and weekly insights across the team.
          </p>
        </div>
        <div className="flex flex-col items-end gap-1">
          <SyncTeamButton orgId={orgId} />
          <p className="text-[11px] text-slate-500">
            {mostRecentSync ? (
              <>Last sync · {timeAgo(mostRecentSync.toISOString())}</>
            ) : (
              <>Never synced</>
            )}
          </p>
        </div>
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

      {/* Coverage strip — be honest about who has GitHub linked */}
      {membersWithoutGitHub.length > 0 && (
        <div className="mb-5 rounded-xl border border-amber-200 bg-amber-50/70 px-4 py-2.5">
          <p className="text-[12.5px] text-amber-900 leading-snug">
            <strong>{membersWithoutGitHub.length}</strong> of {members.length} member
            {members.length === 1 ? '' : 's'} haven&apos;t connected GitHub — their activity won&apos;t appear here.
            {membersWithoutGitHub.length <= 5 && (
              <>
                {' '}Missing:{' '}
                {membersWithoutGitHub.map((m, i) => (
                  <span key={m.id}>
                    {i > 0 && ', '}@{m.login}
                  </span>
                ))}
                .
              </>
            )}
          </p>
        </div>
      )}

      <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
        {events.length === 0 ? (
          <EmptyState withGitHub={membersWithGitHub.length} totalMembers={members.length} />
        ) : (
          <ul className="divide-y divide-slate-100">
            {events.map(({ e, u }) => (
              <li
                key={e.id}
                className="px-5 py-3 flex items-start gap-3 hover:bg-slate-50/60 transition-colors"
              >
                <CharacterAvatar characterKey={u.characterKey} size={28} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={`pill ${TYPE_PILL[e.type] ?? 'pill-slate'}`}>
                      {TYPE_LABEL[e.type] ?? e.type}
                    </span>
                    <a
                      href={e.url}
                      target="_blank"
                      rel="noreferrer"
                      className="text-[13px] text-slate-900 hover:text-indigo-600 truncate"
                    >
                      {e.title}
                    </a>
                  </div>
                  <p className="text-[11.5px] text-slate-500 mt-0.5">
                    {u.name ?? `@${u.login}`} · {e.repo} · {timeAgo(e.occurredAt.toISOString())}
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
