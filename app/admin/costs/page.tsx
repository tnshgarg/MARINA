import { desc, eq, gte, sql } from 'drizzle-orm'
import { db, schema } from '@/lib/db/client'
import { formatUsd } from '@/lib/admin/analytics'

export const dynamic = 'force-dynamic'

const DAY_MS = 24 * 60 * 60 * 1000

export default async function AdminCostsPage() {
  const monthStart = new Date()
  monthStart.setUTCDate(1)
  monthStart.setUTCHours(0, 0, 0, 0)
  const lastMonthStart = new Date(monthStart)
  lastMonthStart.setUTCMonth(lastMonthStart.getUTCMonth() - 1)
  const since30 = new Date(Date.now() - 30 * DAY_MS)
  const since7 = new Date(Date.now() - 7 * DAY_MS)

  // Totals
  const [mtd] = await db
    .select({ cents: sql<number>`COALESCE(SUM(${schema.aiSpend.costCents}), 0)` })
    .from(schema.aiSpend)
    .where(gte(schema.aiSpend.createdAt, monthStart))

  const [lastMonth] = await db
    .select({ cents: sql<number>`COALESCE(SUM(${schema.aiSpend.costCents}), 0)` })
    .from(schema.aiSpend)
    .where(sql`${schema.aiSpend.createdAt} >= ${lastMonthStart.toISOString()} AND ${schema.aiSpend.createdAt} < ${monthStart.toISOString()}`)

  const [last7] = await db
    .select({ cents: sql<number>`COALESCE(SUM(${schema.aiSpend.costCents}), 0)` })
    .from(schema.aiSpend)
    .where(gte(schema.aiSpend.createdAt, since7))

  // By provider
  const byProvider = await db
    .select({
      provider: schema.aiSpend.provider,
      cents: sql<number>`COALESCE(SUM(${schema.aiSpend.costCents}), 0)`,
      inTok: sql<number>`COALESCE(SUM(${schema.aiSpend.inputTokens}), 0)`,
      outTok: sql<number>`COALESCE(SUM(${schema.aiSpend.outputTokens}), 0)`,
      calls: sql<number>`COUNT(*)`,
    })
    .from(schema.aiSpend)
    .where(gte(schema.aiSpend.createdAt, monthStart))
    .groupBy(schema.aiSpend.provider)

  // By feature kind
  const byKind = await db
    .select({
      kind: schema.aiSpend.kind,
      cents: sql<number>`COALESCE(SUM(${schema.aiSpend.costCents}), 0)`,
      calls: sql<number>`COUNT(*)`,
    })
    .from(schema.aiSpend)
    .where(gte(schema.aiSpend.createdAt, monthStart))
    .groupBy(schema.aiSpend.kind)
    .orderBy(desc(sql`SUM(${schema.aiSpend.costCents})`))

  // Top spending orgs (MTD)
  const topOrgs = await db
    .select({
      orgId: schema.aiSpend.orgId,
      orgName: schema.orgs.name,
      cents: sql<number>`COALESCE(SUM(${schema.aiSpend.costCents}), 0)`,
      calls: sql<number>`COUNT(*)`,
    })
    .from(schema.aiSpend)
    .leftJoin(schema.orgs, eq(schema.aiSpend.orgId, schema.orgs.id))
    .where(gte(schema.aiSpend.createdAt, monthStart))
    .groupBy(schema.aiSpend.orgId, schema.orgs.name)
    .orderBy(desc(sql`SUM(${schema.aiSpend.costCents})`))
    .limit(10)

  // Daily trend (last 30 days)
  const dailyRows = await db
    .select({
      day: sql<string>`DATE(${schema.aiSpend.createdAt})`,
      cents: sql<number>`COALESCE(SUM(${schema.aiSpend.costCents}), 0)`,
    })
    .from(schema.aiSpend)
    .where(gte(schema.aiSpend.createdAt, since30))
    .groupBy(sql`DATE(${schema.aiSpend.createdAt})`)
    .orderBy(sql`DATE(${schema.aiSpend.createdAt})`)

  const dailyMax = Math.max(1, ...dailyRows.map((r) => Number(r.cents)))

  const mtdCents = Number(mtd.cents)
  const lastCents = Number(lastMonth.cents)
  const last7Cents = Number(last7.cents)
  const deltaPct = lastCents > 0 ? Math.round(((mtdCents - lastCents) / lastCents) * 100) : null

  return (
    <div>
      <header className="mb-7">
        <p className="text-[11px] tracking-widest uppercase text-amber-400/80 font-semibold">
          Founder console
        </p>
        <h1 className="font-display text-[32px] leading-tight mt-1 text-white">AI costs</h1>
        <p className="text-[13.5px] text-slate-400 mt-1">
          Token spend across Groq + OpenAI, by feature, by org. USD cents tracked at call-time.
        </p>
      </header>

      {/* Totals */}
      <section className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <Tile label="MTD" value={formatUsd(mtdCents)} sub={`vs ${formatUsd(lastCents)} last month${deltaPct !== null ? ` (${deltaPct >= 0 ? '+' : ''}${deltaPct}%)` : ''}`} accent="emerald" />
        <Tile label="Last 7 days" value={formatUsd(last7Cents)} sub="rolling window" accent="emerald" />
        <Tile label="Run-rate" value={formatUsd(Math.round((mtdCents / Math.max(1, new Date().getUTCDate())) * 30))} sub="extrapolated month-end" accent={deltaPct !== null && deltaPct > 50 ? 'rose' : 'emerald'} />
        <Tile label="Avg per call" value={formatUsd(Math.round(mtdCents / Math.max(1, byProvider.reduce((acc, r) => acc + Number(r.calls), 0))))} sub={`${byProvider.reduce((acc, r) => acc + Number(r.calls), 0).toLocaleString()} calls MTD`} accent="emerald" />
      </section>

      {/* By provider + by kind */}
      <section className="grid md:grid-cols-2 gap-4 mb-6">
        <div className="rounded-xl border border-white/5 bg-white/[0.02] p-4">
          <p className="text-[11px] uppercase tracking-widest text-slate-500 font-semibold mb-3">By provider</p>
          {byProvider.length === 0 ? (
            <p className="text-[13px] text-slate-500">No AI spend recorded this month.</p>
          ) : (
            <ul className="space-y-2">
              {byProvider.map((p) => {
                const pct = mtdCents > 0 ? (Number(p.cents) / mtdCents) * 100 : 0
                return (
                  <li key={p.provider} className="text-[13px]">
                    <div className="flex justify-between mb-1">
                      <span className="text-slate-200 capitalize">{p.provider}</span>
                      <span className="text-slate-300 tabular-nums">
                        {formatUsd(Number(p.cents))} <span className="text-slate-500 text-[11px]">· {Number(p.calls).toLocaleString()} calls</span>
                      </span>
                    </div>
                    <div className="h-1.5 bg-white/5 rounded-full overflow-hidden">
                      <div className="h-full bg-emerald-400/60" style={{ width: `${pct}%` }} />
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
        </div>

        <div className="rounded-xl border border-white/5 bg-white/[0.02] p-4">
          <p className="text-[11px] uppercase tracking-widest text-slate-500 font-semibold mb-3">By feature</p>
          {byKind.length === 0 ? (
            <p className="text-[13px] text-slate-500">No AI spend recorded this month.</p>
          ) : (
            <ul className="space-y-2">
              {byKind.map((k) => {
                const pct = mtdCents > 0 ? (Number(k.cents) / mtdCents) * 100 : 0
                return (
                  <li key={k.kind} className="text-[13px]">
                    <div className="flex justify-between mb-1">
                      <span className="text-slate-200 capitalize">{k.kind.replace(/_/g, ' ')}</span>
                      <span className="text-slate-300 tabular-nums">
                        {formatUsd(Number(k.cents))} <span className="text-slate-500 text-[11px]">· {Number(k.calls).toLocaleString()}</span>
                      </span>
                    </div>
                    <div className="h-1.5 bg-white/5 rounded-full overflow-hidden">
                      <div className="h-full bg-amber-400/60" style={{ width: `${pct}%` }} />
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      </section>

      {/* Daily trend */}
      <section className="rounded-xl border border-white/5 bg-white/[0.02] p-4 mb-6">
        <p className="text-[11px] uppercase tracking-widest text-slate-500 font-semibold mb-3">
          Daily spend · last 30 days
        </p>
        {dailyRows.length === 0 ? (
          <p className="text-[13px] text-slate-500">No AI spend yet.</p>
        ) : (
          <div className="flex items-end gap-1 h-32">
            {dailyRows.map((r) => {
              const h = (Number(r.cents) / dailyMax) * 100
              return (
                <div
                  key={r.day}
                  className="flex-1 bg-emerald-400/40 hover:bg-emerald-400/60 transition rounded-sm relative group"
                  style={{ height: `${Math.max(2, h)}%` }}
                  title={`${r.day} · ${formatUsd(Number(r.cents))}`}
                />
              )
            })}
          </div>
        )}
      </section>

      {/* Top spending orgs */}
      <section>
        <p className="text-[11px] uppercase tracking-widest text-slate-500 font-semibold mb-3">Top spending orgs · MTD</p>
        {topOrgs.length === 0 ? (
          <p className="text-[13px] text-slate-500 px-4 py-6 rounded-xl border border-white/5 bg-white/[0.02] text-center">
            No org-level AI spend yet.
          </p>
        ) : (
          <ul className="divide-y divide-white/5 rounded-xl border border-white/5 overflow-hidden">
            {topOrgs.map((o, i) => (
              <li key={`${o.orgId}-${i}`} className="bg-white/[0.02] px-4 py-3 flex items-center gap-3">
                <span className="w-6 h-6 rounded-md bg-amber-400/10 inline-flex items-center justify-center text-[11px] font-semibold text-amber-300 shrink-0">
                  {i + 1}
                </span>
                <span className="text-[13px] text-slate-100 font-medium truncate flex-1">
                  {o.orgName ?? '(unscoped)'}
                </span>
                <span className="text-[11.5px] text-slate-500 tabular-nums shrink-0">
                  {Number(o.calls).toLocaleString()} calls
                </span>
                <span className="text-[13px] text-emerald-300 font-medium tabular-nums w-24 text-right">
                  {formatUsd(Number(o.cents))}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}

function Tile({
  label,
  value,
  sub,
  accent,
}: {
  label: string
  value: string
  sub: string
  accent: 'emerald' | 'rose' | 'amber'
}) {
  const fg =
    accent === 'rose' ? 'text-rose-300' : accent === 'amber' ? 'text-amber-300' : 'text-emerald-300'
  return (
    <div className="rounded-xl border border-white/5 bg-white/[0.02] px-4 py-3.5">
      <p className="text-[10.5px] tracking-widest uppercase text-slate-500 font-medium">{label}</p>
      <p className={`mt-1.5 text-[22px] font-display tracking-tight ${fg} tabular-nums`}>{value}</p>
      <p className="text-[11px] text-slate-500 mt-0.5">{sub}</p>
    </div>
  )
}
