import { notFound } from 'next/navigation'
import { and, desc, eq, gte, inArray, isNull, like, lt, not, sql } from 'drizzle-orm'
import { db, schema } from '@/lib/db/client'
import { CharacterAvatar } from '@/components/character-avatar'
import { ActivityTabs } from '@/components/org-tabs'
import { withMembershipWindow } from '@/lib/auth/tenant-scope'

export const dynamic = 'force-dynamic'

// Demo seed rows have externalId LIKE 'seed-%'. Filter them from any
// authentic-data view so the org doesn't see fake GitHub events.
const NOT_SEED = not(like(schema.githubEvents.externalId, 'seed-%'))
const inThisOrgWindow = (orgId: number) =>
  withMembershipWindow(
    orgId,
    sql.raw('github_events.user_id'),
    sql.raw('github_events.occurred_at'),
  )

const DAY_MS = 24 * 60 * 60 * 1000

/**
 * Manager Insights — the "what should I do today" view.
 *
 * Designed to answer six questions a head-of-engineering actually asks every
 * morning, not abstract "output mix" bar charts.
 */
export default async function InsightsPage({ params }: { params: Promise<{ orgId: string }> }) {
  const { orgId: raw } = await params
  const orgId = Number(raw)
  if (!Number.isInteger(orgId)) notFound()

  // ---- Members in this org -------------------------------------------------
  const memberRows = await db
    .select({
      userId: schema.memberships.userId,
      login: schema.users.login,
      name: schema.users.name,
      characterKey: schema.users.characterKey,
      hasGithub: schema.users.accessToken,
      lastSyncedAt: schema.users.lastSyncedAt,
    })
    .from(schema.memberships)
    .innerJoin(schema.users, eq(schema.memberships.userId, schema.users.id))
    .where(and(eq(schema.memberships.orgId, orgId), isNull(schema.memberships.endedAt)))

  const userIds = memberRows.map((m) => m.userId)
  const userById = new Map(memberRows.map((m) => [m.userId, m]))

  const now = new Date()
  const since7 = new Date(now.getTime() - 7 * DAY_MS)
  const since14 = new Date(now.getTime() - 14 * DAY_MS)
  const since3 = new Date(now.getTime() - 3 * DAY_MS)

  // ---- Parallel queries ----------------------------------------------------
  const [
    activeBlockers,
    eventsLast7,
    eventsPrev7,
    openShiftsLong,
    upcomingLeaves,
    quietMembers,
    stalePrs,
  ] = await Promise.all([
    // Active blockers
    userIds.length
      ? db
          .select({ b: schema.breaks, u: schema.users })
          .from(schema.breaks)
          .innerJoin(schema.users, eq(schema.breaks.userId, schema.users.id))
          .where(
            and(
              inArray(schema.breaks.userId, userIds),
              isNull(schema.breaks.endedAt),
              eq(schema.breaks.category, 'blocked'),
            ),
          )
          .orderBy(schema.breaks.startedAt)
      : Promise.resolve([] as Array<{ b: typeof schema.breaks.$inferSelect; u: typeof schema.users.$inferSelect }>),
    userIds.length
      ? db
          .select()
          .from(schema.githubEvents)
          .where(
            and(
              inArray(schema.githubEvents.userId, userIds),
              gte(schema.githubEvents.occurredAt, since7),
              NOT_SEED,
              inThisOrgWindow(orgId),
            ),
          )
      : Promise.resolve([] as (typeof schema.githubEvents.$inferSelect)[]),
    userIds.length
      ? db
          .select()
          .from(schema.githubEvents)
          .where(
            and(
              inArray(schema.githubEvents.userId, userIds),
              gte(schema.githubEvents.occurredAt, since14),
              lt(schema.githubEvents.occurredAt, since7),
              NOT_SEED,
              inThisOrgWindow(orgId),
            ),
          )
      : Promise.resolve([] as (typeof schema.githubEvents.$inferSelect)[]),
    // Long open shifts — punched in >9h ago, not punched out
    userIds.length
      ? db
          .select()
          .from(schema.shifts)
          .where(
            and(
              inArray(schema.shifts.userId, userIds),
              isNull(schema.shifts.punchedOutAt),
              lt(schema.shifts.punchedInAt, new Date(now.getTime() - 9 * 3600 * 1000)),
            ),
          )
      : Promise.resolve([] as (typeof schema.shifts.$inferSelect)[]),
    // Approved leaves starting within 7d (so manager can plan coverage)
    userIds.length
      ? db
          .select({ l: schema.leaveRequests, u: schema.users })
          .from(schema.leaveRequests)
          .innerJoin(schema.users, eq(schema.leaveRequests.userId, schema.users.id))
          .where(
            and(
              eq(schema.leaveRequests.orgId, orgId),
              eq(schema.leaveRequests.status, 'approved'),
            ),
          )
      : Promise.resolve([] as Array<{ l: typeof schema.leaveRequests.$inferSelect; u: typeof schema.users.$inferSelect }>),
    // Members with NO GitHub events in 3 days (signals possibly quiet / stuck)
    userIds.length
      ? db
          .select()
          .from(schema.githubEvents)
          .where(
            and(
              inArray(schema.githubEvents.userId, userIds),
              gte(schema.githubEvents.occurredAt, since3),
              NOT_SEED,
              inThisOrgWindow(orgId),
            ),
          )
      : Promise.resolve([] as (typeof schema.githubEvents.$inferSelect)[]),
    // Stale PRs awaiting review: pr_opened from this team that hasn't been
    // followed by anyone reviewing it for >24h. We approximate using URL uniqueness.
    userIds.length
      ? db
          .select()
          .from(schema.githubEvents)
          .where(
            and(
              inArray(schema.githubEvents.userId, userIds),
              eq(schema.githubEvents.type, 'pr_opened'),
              gte(schema.githubEvents.occurredAt, since14),
              lt(schema.githubEvents.occurredAt, new Date(now.getTime() - 24 * 3600 * 1000)),
              NOT_SEED,
              inThisOrgWindow(orgId),
            ),
          )
          .orderBy(desc(schema.githubEvents.occurredAt))
      : Promise.resolve([] as (typeof schema.githubEvents.$inferSelect)[]),
  ])

  // ---- Derive: per-member velocity (last 7d vs previous 7d) ----------------
  const countByUser7 = new Map<number, number>()
  const countByUser14 = new Map<number, number>()
  for (const e of eventsLast7) countByUser7.set(e.userId, (countByUser7.get(e.userId) ?? 0) + 1)
  for (const e of eventsPrev7) countByUser14.set(e.userId, (countByUser14.get(e.userId) ?? 0) + 1)

  type Velocity = { userId: number; last7: number; prev7: number; delta: number; pctDelta: number | null }
  const velocity: Velocity[] = memberRows.map((m) => {
    const last7 = countByUser7.get(m.userId) ?? 0
    const prev7 = countByUser14.get(m.userId) ?? 0
    const delta = last7 - prev7
    const pctDelta = prev7 === 0 ? null : Math.round(((last7 - prev7) / prev7) * 100)
    return { userId: m.userId, last7, prev7, delta, pctDelta }
  })
  const topUp = velocity.filter((v) => v.last7 > 0).sort((a, b) => b.delta - a.delta).slice(0, 3)
  const topDown = velocity
    .filter((v) => v.prev7 > 0 && v.delta < 0)
    .sort((a, b) => a.delta - b.delta)
    .slice(0, 3)

  // ---- Derive: leaves in next 7 days (avoid past-only) ---------------------
  const todayStr = isoDay(now)
  const in7Str = isoDay(new Date(now.getTime() + 7 * DAY_MS))
  const upcoming = upcomingLeaves
    .filter((r) => r.l.endDate >= todayStr && r.l.startDate <= in7Str)
    .sort((a, b) => a.l.startDate.localeCompare(b.l.startDate))

  // ---- Derive: quiet (no GH events in 3d) ---------------------------------
  const recentlyActive = new Set(quietMembers.map((e) => e.userId))
  const quietList = memberRows.filter((m) => m.hasGithub && !recentlyActive.has(m.userId))

  // ---- Derive: stale PRs — drop URLs that show a later pr_reviewed event ---
  const reviewedUrls = new Set(
    eventsLast7.filter((e) => e.type === 'pr_reviewed').map((e) => e.url),
  )
  const staleSeen = new Set<string>()
  const staleFinal = stalePrs.filter((pr) => {
    if (reviewedUrls.has(pr.url)) return false
    if (staleSeen.has(pr.url)) return false
    staleSeen.add(pr.url)
    return true
  })

  // Does this team have any GitHub-linked engineers? If not, the velocity /
  // stale-PR / quiet-engineer cards are noise — hide them entirely so the
  // page is genuinely useful for non-engineering teams.
  const teamHasGithub = memberRows.some((m) => !!m.hasGithub)

  // ---- Render -------------------------------------------------------------
  return (
    <>
      <div className="mb-4">
        <h1 className="text-[22px] font-semibold text-slate-900 tracking-tight">Activity</h1>
        <p className="mt-1.5 text-[13px] text-slate-600">What to act on this week.</p>
      </div>
      <ActivityTabs orgId={orgId} />

      <div className="grid grid-cols-12 gap-5">
        {/* Active blockers */}
        <InsightCard
          tone="rose"
          title="Active blockers"
          subtitle={
            activeBlockers.length === 0
              ? 'Nobody is stuck right now.'
              : `${activeBlockers.length} ${activeBlockers.length === 1 ? 'person is' : 'people are'} blocked.`
          }
          source="Source: pause-tracking with category=blocked"
          empty={activeBlockers.length === 0}
        >
          <ul className="space-y-2">
            {activeBlockers.map(({ b, u }) => {
              const dur = humanDuration(now.getTime() - new Date(b.startedAt).getTime())
              const waitingOnLogin =
                b.waitingOnUserId != null ? userById.get(b.waitingOnUserId)?.login : null
              return (
                <li key={b.id} className="flex items-center gap-2.5 text-[13px]">
                  <CharacterAvatar characterKey={u.characterKey} size={26} />
                  <span className="truncate">
                    <strong>{u.name ?? `@${u.login}`}</strong>{' '}
                    <span className="text-slate-500">
                      on {waitingOnLogin ? `@${waitingOnLogin}` : b.waitingOnExternal ?? 'someone'}
                    </span>
                  </span>
                  <span className="ml-auto text-[11.5px] font-semibold text-rose-700">{dur}</span>
                </li>
              )
            })}
          </ul>
        </InsightCard>

        {/* Velocity — engineering-only */}
        {teamHasGithub && (
          <InsightCard
            tone="emerald"
            title="Velocity vs last week"
            subtitle="Shipped GitHub events this 7d window vs the previous one."
            source="Source: github_events (commits + PRs + reviews + issues)"
          >
            <div className="grid grid-cols-2 gap-3">
              <VelocityList items={topUp} userById={userById} dir="up" emptyMsg="No standout this week." />
              <VelocityList items={topDown} userById={userById} dir="down" emptyMsg="No drops detected." />
            </div>
          </InsightCard>
        )}

        {/* Stale PRs — engineering-only */}
        {teamHasGithub && (
        <InsightCard
          tone="amber"
          title={`Stale PRs · ${staleFinal.length}`}
          subtitle="Opened >24h ago, no reviews observed yet."
          source="Source: PRs from github_events, minus URLs that show a later review event"
          empty={staleFinal.length === 0}
        >
          <ul className="space-y-2">
            {staleFinal.slice(0, 6).map((pr) => {
              const author = userById.get(pr.userId)
              const dur = humanDuration(now.getTime() - new Date(pr.occurredAt).getTime())
              return (
                <li key={pr.id} className="flex items-center gap-2.5 text-[12.5px]">
                  <CharacterAvatar characterKey={author?.characterKey ?? null} size={22} />
                  <a href={pr.url} target="_blank" rel="noreferrer" className="text-slate-900 hover:text-indigo-600 truncate">
                    {pr.title}
                  </a>
                  <span className="ml-auto text-[11px] text-amber-700 font-medium">{dur}</span>
                </li>
              )
            })}
          </ul>
        </InsightCard>
        )}

        {/* Long-day alert */}
        <InsightCard
          tone="violet"
          title={`Long-day alert · ${openShiftsLong.length}`}
          subtitle="Punched in >9h ago and still working."
          source="Source: shifts.punched_in_at without punched_out_at"
          empty={openShiftsLong.length === 0}
        >
          <ul className="space-y-2">
            {openShiftsLong.map((s) => {
              const u = userById.get(s.userId)
              const dur = humanDuration(now.getTime() - new Date(s.punchedInAt).getTime())
              return (
                <li key={s.id} className="flex items-center gap-2.5 text-[13px]">
                  <CharacterAvatar characterKey={u?.characterKey ?? null} size={26} />
                  <span className="truncate">
                    <strong>{u?.name ?? `@${u?.login ?? 'unknown'}`}</strong>{' '}
                    <span className="text-slate-500">should consider stopping</span>
                  </span>
                  <span className="ml-auto text-[11.5px] font-semibold text-violet-700">{dur}</span>
                </li>
              )
            })}
          </ul>
        </InsightCard>

        {/* Out next 7 days */}
        <InsightCard
          tone="sky"
          title="Out next 7 days"
          subtitle={
            upcoming.length === 0 ? 'Full team available this week.' : 'Plan reviews and standups around these.'
          }
          source="Source: leave_requests where status=approved overlapping the next 7 days"
          empty={upcoming.length === 0}
        >
          <ul className="space-y-2">
            {upcoming.slice(0, 6).map(({ l, u }) => (
              <li key={l.id} className="flex items-center gap-2.5 text-[13px]">
                <CharacterAvatar characterKey={u.characterKey} size={26} />
                <span className="truncate">
                  <strong>{u.name ?? `@${u.login}`}</strong>
                  <span className="text-slate-500"> · {l.leaveType}</span>
                </span>
                <span className="ml-auto text-[11.5px] text-sky-700 font-medium">
                  {fmtRange(l.startDate, l.endDate)}
                </span>
              </li>
            ))}
          </ul>
        </InsightCard>

        {/* Quiet members — engineering-only (the "no GitHub events" signal
            is meaningless for designers, sales, etc., so don't show the card
            unless at least one engineer is linked) */}
        {teamHasGithub && (
          <InsightCard
            tone="slate"
            title={`Quiet · ${quietList.length}`}
            subtitle="No GitHub events in the last 3 days. Worth a check-in."
            source="Source: github_events table; excludes members without GitHub linked"
            empty={quietList.length === 0}
          >
            <ul className="space-y-2">
              {quietList.slice(0, 6).map((m) => (
                <li key={m.userId} className="flex items-center gap-2.5 text-[13px]">
                  <CharacterAvatar characterKey={m.characterKey} size={26} />
                  <span className="truncate">
                    <strong>{m.name ?? `@${m.login}`}</strong>
                  </span>
                  <span className="ml-auto text-[11.5px] text-slate-500">
                    {m.lastSyncedAt ? `last sync ${humanDuration(now.getTime() - new Date(m.lastSyncedAt).getTime())} ago` : 'no sync yet'}
                  </span>
                </li>
              ))}
            </ul>
          </InsightCard>
        )}
      </div>
    </>
  )
}

/* ---------- bits ---------- */

const TONE: Record<string, { ring: string; bg: string; chip: string }> = {
  rose: { ring: 'border-rose-200', bg: 'from-rose-50', chip: 'text-rose-700' },
  emerald: { ring: 'border-emerald-200', bg: 'from-emerald-50', chip: 'text-emerald-700' },
  amber: { ring: 'border-amber-200', bg: 'from-amber-50', chip: 'text-amber-700' },
  violet: { ring: 'border-violet-200', bg: 'from-violet-50', chip: 'text-violet-700' },
  sky: { ring: 'border-sky-200', bg: 'from-sky-50', chip: 'text-sky-700' },
  slate: { ring: 'border-slate-200', bg: 'from-slate-50', chip: 'text-slate-700' },
}

function InsightCard({
  tone,
  title,
  subtitle,
  source,
  empty,
  children,
}: {
  tone: keyof typeof TONE
  title: string
  subtitle: string
  source: string
  empty?: boolean
  children: React.ReactNode
}) {
  const t = TONE[tone] ?? TONE.slate
  return (
    <section className={`col-span-12 md:col-span-6 rounded-2xl border ${t.ring} bg-gradient-to-br ${t.bg} via-white to-white p-5 shadow-sm`}>
      <div className="flex items-baseline justify-between gap-3 flex-wrap">
        <div>
          <h2 className={`text-[15px] font-semibold text-slate-900 ${t.chip}`}>{title}</h2>
          <p className="text-[12px] text-slate-500 mt-0.5">{subtitle}</p>
        </div>
        <details className="text-[10.5px] text-slate-400">
          <summary className="cursor-pointer hover:text-slate-600 list-none">data source</summary>
          <p className="mt-1 text-slate-500 max-w-[300px] text-right">{source}</p>
        </details>
      </div>
      <div className="mt-3">
        {empty ? (
          <p className="text-[12.5px] text-slate-500 py-2">— Nothing here right now.</p>
        ) : (
          children
        )}
      </div>
    </section>
  )
}

function VelocityList({
  items,
  userById,
  dir,
  emptyMsg,
}: {
  items: Array<{ userId: number; last7: number; prev7: number; delta: number; pctDelta: number | null }>
  userById: Map<number, { userId: number; login: string; name: string | null; characterKey: string | null }>
  dir: 'up' | 'down'
  emptyMsg: string
}) {
  if (items.length === 0) {
    return (
      <div className="text-[11.5px] text-slate-500 px-2 py-2">
        <p className="text-[10.5px] uppercase tracking-widest text-slate-400 mb-1 font-semibold">
          {dir === 'up' ? 'Trending up' : 'Trending down'}
        </p>
        <p>{emptyMsg}</p>
      </div>
    )
  }
  return (
    <div>
      <p className={`text-[10.5px] uppercase tracking-widest font-semibold mb-1.5 ${dir === 'up' ? 'text-emerald-700' : 'text-rose-700'}`}>
        {dir === 'up' ? 'Trending up' : 'Trending down'}
      </p>
      <ul className="space-y-1.5">
        {items.map((v) => {
          const u = userById.get(v.userId)
          if (!u) return null
          return (
            <li key={v.userId} className="flex items-center gap-2 text-[12.5px]">
              <CharacterAvatar characterKey={u.characterKey} size={20} />
              <span className="truncate">{u.name ?? `@${u.login}`}</span>
              <span className="ml-auto font-medium tabular-nums" style={{ color: dir === 'up' ? '#15803d' : '#b91c1c' }}>
                {v.delta > 0 ? '+' : ''}
                {v.delta}
                <span className="text-slate-400 font-normal"> · {v.last7}/{v.prev7}</span>
              </span>
            </li>
          )
        })}
      </ul>
    </div>
  )
}

/* ---------- utils ---------- */

function isoDay(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function humanDuration(ms: number): string {
  const mins = Math.max(0, Math.floor(ms / 60000))
  if (mins < 60) return `${mins}m`
  const h = Math.floor(mins / 60)
  if (h < 48) {
    const m = mins % 60
    return m === 0 ? `${h}h` : `${h}h ${m}m`
  }
  return `${Math.floor(h / 24)}d`
}

function fmtRange(startIso: string, endIso: string): string {
  const opts: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short' }
  const s = new Date(startIso + 'T00:00:00').toLocaleDateString(undefined, opts)
  const e = new Date(endIso + 'T00:00:00').toLocaleDateString(undefined, opts)
  return startIso === endIso ? s : `${s} – ${e}`
}
