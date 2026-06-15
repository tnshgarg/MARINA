import Link from 'next/link'
import { desc, eq, gte, sql } from 'drizzle-orm'
import { db, schema } from '@/lib/db/client'
import { formatAgo } from '@/lib/admin/analytics'

export const dynamic = 'force-dynamic'

const DAY_MS = 24 * 60 * 60 * 1000

/**
 * Product analytics — live feed of customer events.
 *
 * This is the surface you live in when answering "what are people doing in
 * MARINA right now?" The recent feed shows the last 100 events across all
 * orgs. The roll-ups answer "which features get used?" and "which orgs are
 * most active?"
 *
 * Events stream into `analytics_events` from `trackEvent(...)` calls placed
 * throughout the codebase. If a kind doesn't appear here, instrumentation
 * is missing for that flow — add a `trackEvent` call where the action
 * succeeds.
 */
export default async function AdminAnalyticsPage() {
  const since30 = new Date(Date.now() - 30 * DAY_MS)
  const since7 = new Date(Date.now() - 7 * DAY_MS)
  const since1 = new Date(Date.now() - DAY_MS)

  // Quick totals
  const [{ n: total30 }] = await db
    .select({ n: sql<number>`COUNT(*)` })
    .from(schema.analyticsEvents)
    .where(gte(schema.analyticsEvents.createdAt, since30))
    .catch(() => [{ n: 0 }])

  const [{ n: total7 }] = await db
    .select({ n: sql<number>`COUNT(*)` })
    .from(schema.analyticsEvents)
    .where(gte(schema.analyticsEvents.createdAt, since7))
    .catch(() => [{ n: 0 }])

  const [{ n: total1 }] = await db
    .select({ n: sql<number>`COUNT(*)` })
    .from(schema.analyticsEvents)
    .where(gte(schema.analyticsEvents.createdAt, since1))
    .catch(() => [{ n: 0 }])

  // Top kinds in last 7 days
  const topKinds = await db
    .select({
      kind: schema.analyticsEvents.kind,
      n: sql<number>`COUNT(*)`,
    })
    .from(schema.analyticsEvents)
    .where(gte(schema.analyticsEvents.createdAt, since7))
    .groupBy(schema.analyticsEvents.kind)
    .orderBy(desc(sql`COUNT(*)`))
    .limit(15)
    .catch(() => [])

  // Most active orgs (7d)
  const activeOrgs = await db
    .select({
      orgId: schema.analyticsEvents.orgId,
      orgName: schema.orgs.name,
      n: sql<number>`COUNT(*)`,
    })
    .from(schema.analyticsEvents)
    .leftJoin(schema.orgs, eq(schema.analyticsEvents.orgId, schema.orgs.id))
    .where(gte(schema.analyticsEvents.createdAt, since7))
    .groupBy(schema.analyticsEvents.orgId, schema.orgs.name)
    .orderBy(desc(sql`COUNT(*)`))
    .limit(10)
    .catch(() => [])

  // Recent event feed
  const recent = await db
    .select({
      ev: schema.analyticsEvents,
      orgName: schema.orgs.name,
      userLogin: schema.users.login,
      userName: schema.users.name,
    })
    .from(schema.analyticsEvents)
    .leftJoin(schema.orgs, eq(schema.analyticsEvents.orgId, schema.orgs.id))
    .leftJoin(schema.users, eq(schema.analyticsEvents.userId, schema.users.id))
    .orderBy(desc(schema.analyticsEvents.createdAt))
    .limit(80)
    .catch(() => [])

  return (
    <div>
      <header className="mb-7">
        <p className="text-[11px] tracking-widest uppercase text-amber-400/80 font-semibold">
          Founder console
        </p>
        <h1 className="font-display text-[32px] leading-tight mt-1 text-white">Analytics</h1>
        <p className="text-[13.5px] text-slate-400 mt-1">
          Every tracked action across the platform. Feeds the &ldquo;what&rsquo;s working&rdquo;
          loop and is the dataset for any future AI agent.
        </p>
      </header>

      <section className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-6">
        <Tile label="Events · 24h" value={Number(total1).toLocaleString()} sub={total1 === 0 ? 'no events yet' : 'fresh'} />
        <Tile label="Events · 7d" value={Number(total7).toLocaleString()} sub="rolling week" />
        <Tile label="Events · 30d" value={Number(total30).toLocaleString()} sub="rolling month" />
      </section>

      <div className="grid md:grid-cols-2 gap-5 mb-6">
        <section className="rounded-xl border border-white/5 bg-white/[0.02] p-4">
          <p className="text-[11px] uppercase tracking-widest text-slate-500 font-semibold mb-3">
            Top event kinds · 7d
          </p>
          {topKinds.length === 0 ? (
            <p className="text-[13px] text-slate-500">
              No events tracked yet. The first ones land as soon as a customer
              uses an instrumented flow.
            </p>
          ) : (
            <ul className="space-y-2">
              {topKinds.map((k) => {
                const pct = Number(total7) > 0 ? (Number(k.n) / Number(total7)) * 100 : 0
                return (
                  <li key={k.kind} className="text-[12.5px]">
                    <div className="flex justify-between mb-1">
                      <code className="text-amber-300/90 font-mono">{k.kind}</code>
                      <span className="text-slate-300 tabular-nums">{Number(k.n).toLocaleString()}</span>
                    </div>
                    <div className="h-1.5 bg-white/5 rounded-full overflow-hidden">
                      <div className="h-full bg-emerald-400/60" style={{ width: `${pct}%` }} />
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
        </section>

        <section className="rounded-xl border border-white/5 bg-white/[0.02] p-4">
          <p className="text-[11px] uppercase tracking-widest text-slate-500 font-semibold mb-3">
            Most active workspaces · 7d
          </p>
          {activeOrgs.length === 0 ? (
            <p className="text-[13px] text-slate-500">No org-scoped events yet.</p>
          ) : (
            <ul className="space-y-2">
              {activeOrgs.map((o, i) => (
                <li key={`${o.orgId}-${i}`} className="text-[12.5px] flex items-center gap-2.5">
                  <span className="w-5 text-slate-500 tabular-nums text-right">{i + 1}</span>
                  {o.orgId ? (
                    <Link href={`/admin/workspaces/${o.orgId}`} className="text-slate-200 hover:text-amber-300 flex-1 truncate">
                      {o.orgName ?? '(unscoped)'}
                    </Link>
                  ) : (
                    <span className="text-slate-500 flex-1 truncate">(no org)</span>
                  )}
                  <span className="text-slate-400 tabular-nums">{Number(o.n).toLocaleString()}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <section>
        <h2 className="text-[12px] uppercase tracking-wider text-slate-500 font-semibold mb-2">
          Live feed · most recent {recent.length}
        </h2>
        {recent.length === 0 ? (
          <p className="text-[13px] text-slate-500 px-4 py-6 rounded-xl border border-white/5 bg-white/[0.02]">
            Nothing in here yet. Once someone schedules a meeting, opens a profile, or completes an
            instrumented flow, you&apos;ll see it stream in.
          </p>
        ) : (
          <ul className="divide-y divide-white/5 rounded-xl border border-white/5 overflow-hidden">
            {recent.map((r) => (
              <li
                key={r.ev.id}
                className="bg-white/[0.02] px-4 py-2 flex items-center gap-3 text-[12.5px]"
              >
                <code className="text-amber-300/90 font-mono shrink-0">{r.ev.kind}</code>
                <span className="text-slate-400 truncate flex-1">
                  {r.userName ?? `@${r.userLogin ?? '?'}`}
                  {r.orgName && <span className="text-slate-500"> · {r.orgName}</span>}
                  {r.ev.payload && Object.keys(r.ev.payload as Record<string, unknown>).length > 0 && (
                    <span className="text-slate-500 ml-1">
                      · {Object.entries(r.ev.payload as Record<string, unknown>)
                        .slice(0, 3)
                        .map(([k, v]) => `${k}=${JSON.stringify(v)}`)
                        .join(' · ')}
                    </span>
                  )}
                </span>
                <span className="text-[11px] text-slate-500 shrink-0 tabular-nums w-20 text-right">
                  {formatAgo(r.ev.createdAt.toISOString())}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <p className="text-[11.5px] text-slate-500 mt-4">
        Retention: events older than 90 days are swept automatically.
        Instrumentation lives in <code className="text-amber-300/80">lib/analytics/track.ts</code>.
      </p>
    </div>
  )
}

function Tile({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className="rounded-xl border border-white/5 bg-white/[0.02] px-4 py-3.5">
      <p className="text-[10.5px] tracking-widest uppercase text-slate-500 font-medium">{label}</p>
      <p className="mt-1.5 text-[22px] font-display tracking-tight text-emerald-300 tabular-nums">
        {value}
      </p>
      <p className="text-[11px] text-slate-500 mt-0.5">{sub}</p>
    </div>
  )
}
