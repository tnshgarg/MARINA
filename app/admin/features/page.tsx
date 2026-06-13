import { count, countDistinct, gte, sql } from 'drizzle-orm'
import { db, schema } from '@/lib/db/client'

export const dynamic = 'force-dynamic'

const DAY_MS = 24 * 60 * 60 * 1000

/**
 * Feature usage analytics — for each shipped feature, count events, unique
 * users and unique orgs over a 7d + 30d window. Features that show "1 org,
 * 1 user" are usually a UX discoverability signal: the feature exists but
 * nobody finds it.
 */
export default async function AdminFeaturesPage() {
  const since7 = new Date(Date.now() - 7 * DAY_MS)
  const since30 = new Date(Date.now() - 30 * DAY_MS)

  async function shifts(since: Date) {
    const [r] = await db
      .select({
        events: count(),
        users: countDistinct(schema.shifts.userId),
        orgs: countDistinct(schema.shifts.orgId),
      })
      .from(schema.shifts)
      .where(gte(schema.shifts.punchedInAt, since))
    return { events: Number(r.events), users: Number(r.users), orgs: Number(r.orgs) }
  }
  async function breaks(since: Date) {
    const [r] = await db
      .select({
        events: count(),
        users: countDistinct(schema.breaks.userId),
        orgs: countDistinct(schema.breaks.orgId),
      })
      .from(schema.breaks)
      .where(gte(schema.breaks.startedAt, since))
    return { events: Number(r.events), users: Number(r.users), orgs: Number(r.orgs) }
  }
  async function leaves(since: Date) {
    const [r] = await db
      .select({
        events: count(),
        users: countDistinct(schema.leaveRequests.userId),
        orgs: countDistinct(schema.leaveRequests.orgId),
      })
      .from(schema.leaveRequests)
      .where(gte(schema.leaveRequests.createdAt, since))
    return { events: Number(r.events), users: Number(r.users), orgs: Number(r.orgs) }
  }
  async function narratives(since: Date) {
    const [r] = await db
      .select({
        events: count(),
        users: countDistinct(schema.narratives.userId),
      })
      .from(schema.narratives)
      .where(gte(schema.narratives.createdAt, since))
    return { events: Number(r.events), users: Number(r.users), orgs: 0 }
  }
  async function deliverables(since: Date) {
    const [r] = await db
      .select({
        events: count(),
        users: countDistinct(schema.deliverables.userId),
        orgs: countDistinct(schema.deliverables.orgId),
      })
      .from(schema.deliverables)
      .where(gte(schema.deliverables.completedAt, since))
    return { events: Number(r.events), users: Number(r.users), orgs: Number(r.orgs) }
  }
  async function meetings(since: Date) {
    const [r] = await db
      .select({
        events: count(),
        users: countDistinct(schema.scheduledMeetings.organiserUserId),
        orgs: countDistinct(schema.scheduledMeetings.orgId),
      })
      .from(schema.scheduledMeetings)
      .where(gte(schema.scheduledMeetings.createdAt, since))
    return { events: Number(r.events), users: Number(r.users), orgs: Number(r.orgs) }
  }
  async function stories(since: Date) {
    const [r] = await db
      .select({
        events: count(),
        users: countDistinct(schema.dailyStories.userId),
      })
      .from(schema.dailyStories)
      .where(gte(schema.dailyStories.generatedAt, since))
    return { events: Number(r.events), users: Number(r.users), orgs: 0 }
  }
  async function blockerThreads(since: Date) {
    const [r] = await db
      .select({
        events: count(),
        users: countDistinct(schema.blockerThread.authorUserId),
      })
      .from(schema.blockerThread)
      .where(gte(schema.blockerThread.createdAt, since))
    return { events: Number(r.events), users: Number(r.users), orgs: 0 }
  }

  const [
    sh7, sh30, br7, br30, le7, le30, na7, na30,
    de7, de30, me7, me30, st7, st30, bt7, bt30,
  ] = await Promise.all([
    shifts(since7), shifts(since30),
    breaks(since7), breaks(since30),
    leaves(since7), leaves(since30),
    narratives(since7), narratives(since30),
    deliverables(since7), deliverables(since30),
    meetings(since7), meetings(since30),
    stories(since7), stories(since30),
    blockerThreads(since7), blockerThreads(since30),
  ])

  // Blocker resolution count (last 30 days)
  const [resolvedBlockers] = await db
    .select({ n: count() })
    .from(schema.breaks)
    .where(
      sql`${schema.breaks.category} = 'blocked' AND ${schema.breaks.endedAt} IS NOT NULL AND ${schema.breaks.startedAt} > ${since30.toISOString()}`,
    )

  const rows = [
    { name: 'Punch-in / shifts',      icon: '⏱',  d7: sh7, d30: sh30 },
    { name: 'Breaks (all kinds)',     icon: '☕', d7: br7, d30: br30 },
    { name: 'Mark work as done',      icon: '✓',  d7: de7, d30: de30 },
    { name: 'AI narratives (Brief)',  icon: '📰', d7: na7, d30: na30 },
    { name: 'Daily stories',          icon: '📅', d7: st7, d30: st30 },
    { name: 'Scheduled 1:1s',         icon: '🗓', d7: me7, d30: me30 },
    { name: 'Leave requests',         icon: '🌴', d7: le7, d30: le30 },
    { name: 'Blocker thread replies', icon: '💬', d7: bt7, d30: bt30 },
  ]

  return (
    <div>
      <header className="mb-7">
        <p className="text-[11px] tracking-widest uppercase text-amber-400/80 font-semibold">
          Founder console
        </p>
        <h1 className="font-display text-[32px] leading-tight mt-1 text-white">Feature usage</h1>
        <p className="text-[13.5px] text-slate-400 mt-1">
          How widely each shipped feature is actually being used across the platform.
        </p>
      </header>

      <div className="rounded-xl border border-white/5 overflow-hidden">
        <div className="grid grid-cols-[minmax(0,2fr)_repeat(6,minmax(0,1fr))] gap-3 px-4 py-2.5 border-b border-white/5 bg-white/[0.02] text-[10.5px] uppercase tracking-wider text-slate-500 font-semibold">
          <span>Feature</span>
          <span className="text-right">7d events</span>
          <span className="text-right">7d users</span>
          <span className="text-right">7d orgs</span>
          <span className="text-right">30d events</span>
          <span className="text-right">30d users</span>
          <span className="text-right">30d orgs</span>
        </div>
        <ul className="divide-y divide-white/5">
          {rows.map((r) => (
            <li
              key={r.name}
              className="grid grid-cols-[minmax(0,2fr)_repeat(6,minmax(0,1fr))] gap-3 px-4 py-3 bg-white/[0.02] items-center"
            >
              <span className="text-[13px] text-slate-100">
                <span className="mr-2 opacity-60">{r.icon}</span>
                {r.name}
              </span>
              <span className="text-right text-[12.5px] text-slate-200 tabular-nums">{r.d7.events.toLocaleString()}</span>
              <span className="text-right text-[12.5px] text-slate-200 tabular-nums">{r.d7.users.toLocaleString()}</span>
              <span className="text-right text-[12.5px] text-slate-200 tabular-nums">{r.d7.orgs.toLocaleString()}</span>
              <span className="text-right text-[12.5px] text-slate-400 tabular-nums">{r.d30.events.toLocaleString()}</span>
              <span className="text-right text-[12.5px] text-slate-400 tabular-nums">{r.d30.users.toLocaleString()}</span>
              <span className="text-right text-[12.5px] text-slate-400 tabular-nums">{r.d30.orgs.toLocaleString()}</span>
            </li>
          ))}
        </ul>
      </div>

      <p className="text-[11.5px] text-slate-500 mt-3">
        Blockers resolved in last 30 days:{' '}
        <span className="text-slate-300 tabular-nums">{Number(resolvedBlockers.n ?? 0).toLocaleString()}</span>
      </p>
    </div>
  )
}
