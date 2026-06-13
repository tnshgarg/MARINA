import Link from 'next/link'
import { loadAllOrgKpis, loadPlatformKpis, formatUsd, formatAgo } from '@/lib/admin/analytics'

export const dynamic = 'force-dynamic'

export default async function AdminOverviewPage() {
  const [platform, orgs] = await Promise.all([loadPlatformKpis(), loadAllOrgKpis()])

  // Surface the most pressing 8 problems on the home — the user can drill into
  // /admin/health for the rest. Priority: at_risk > sync errors > stuck blockers.
  const alerts: Array<{
    severity: 'critical' | 'warn' | 'info'
    title: string
    detail: string
    orgId: number
    cta: string
  }> = []
  for (const o of orgs) {
    if (o.health === 'at_risk') {
      alerts.push({
        severity: 'critical',
        title: `${o.name} is at risk`,
        detail: `${o.active7d}/${o.seats} active in last 7d · ${o.syncErrors} sync error${o.syncErrors === 1 ? '' : 's'}`,
        orgId: o.orgId,
        cta: 'Inspect',
      })
    } else if (o.health === 'churned') {
      alerts.push({
        severity: 'warn',
        title: `${o.name} hasn't checked in`,
        detail: `No shifts in 30 days · ${o.seats} seats sitting idle`,
        orgId: o.orgId,
        cta: 'Reach out',
      })
    } else if (o.blockersOpen >= 3) {
      alerts.push({
        severity: 'warn',
        title: `${o.name} has ${o.blockersOpen} stuck blockers`,
        detail: `Manager nudges may not be working as intended`,
        orgId: o.orgId,
        cta: 'See blockers',
      })
    } else if (o.trialEndsAt && new Date(o.trialEndsAt).getTime() - Date.now() < 3 * 86400000 && o.plan === 'free') {
      alerts.push({
        severity: 'info',
        title: `${o.name} trial ends soon`,
        detail: `Trial ends ${formatAgo(o.trialEndsAt).replace(' ago', '')} — reach out before they drop`,
        orgId: o.orgId,
        cta: 'Send touch',
      })
    }
  }
  const topAlerts = alerts.slice(0, 8)

  const spendDeltaPct =
    platform.aiSpendCentsLastMonth > 0
      ? Math.round(
          ((platform.aiSpendCentsThisMonth - platform.aiSpendCentsLastMonth) /
            platform.aiSpendCentsLastMonth) *
            100,
        )
      : null

  return (
    <div>
      <header className="mb-7">
        <p className="text-[11px] tracking-widest uppercase text-amber-400/80 font-semibold">
          Founder console
        </p>
        <h1 className="font-display text-[32px] leading-tight mt-1 text-white">
          What&apos;s happening across MARINA
        </h1>
        <p className="text-[13.5px] text-slate-400 mt-1">
          Every customer, every signal, every dollar — on one screen.
        </p>
      </header>

      {/* Top KPIs */}
      <section className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <Kpi label="Workspaces" value={platform.orgCount.toString()} sub={`${platform.paidOrgCount} paid`} tone="sage" />
        <Kpi label="Active users · 7d" value={platform.activeUsers7d.toLocaleString()} sub={`${platform.activeUsers30d.toLocaleString()} in 30d`} tone="sage" />
        <Kpi label="Seats sold" value={platform.totalSeats.toLocaleString()} sub={`${platform.signups7d} new sign-ups · 7d`} tone="info" />
        <Kpi
          label="AI spend · MTD"
          value={formatUsd(platform.aiSpendCentsThisMonth)}
          sub={spendDeltaPct === null ? `${formatUsd(platform.aiSpendCentsLastMonth)} last month` : `${spendDeltaPct >= 0 ? '+' : ''}${spendDeltaPct}% vs last month`}
          tone={spendDeltaPct !== null && spendDeltaPct > 25 ? 'warn' : 'sage'}
        />
        <Kpi label="Shifts · 7d" value={platform.shifts7d.toLocaleString()} sub="punch-in events" tone="sage" />
        <Kpi label="Deliverables · 7d" value={platform.deliverables7d.toLocaleString()} sub="marked-as-done logs" tone="sage" />
        <Kpi label="Blockers open" value={platform.blockersOpen.toLocaleString()} sub="across all workspaces" tone={platform.blockersOpen > 10 ? 'warn' : 'sage'} />
        <Kpi label="Health" value={`${orgs.filter((o) => o.health === 'healthy' || o.health === 'growing').length}/${platform.orgCount}`} sub="healthy or growing" tone="sage" />
      </section>

      {/* Alerts feed */}
      <section className="mb-6">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-[14px] font-semibold text-slate-200">Needs your attention</h2>
          <Link href="/admin/health" className="text-[12px] text-amber-400 hover:text-amber-300">
            View all →
          </Link>
        </div>
        {topAlerts.length === 0 ? (
          <p className="text-[13px] text-slate-500 px-4 py-6 rounded-xl border border-white/5 bg-white/[0.02] text-center">
            Nothing on fire. Every workspace is steady.
          </p>
        ) : (
          <ul className="divide-y divide-white/5 rounded-xl border border-white/5 overflow-hidden">
            {topAlerts.map((a, i) => (
              <li key={i} className="bg-white/[0.02] px-4 py-3 flex items-start gap-3">
                <span
                  className={`mt-1 inline-block w-1.5 h-1.5 rounded-full shrink-0 ${
                    a.severity === 'critical' ? 'bg-rose-400' : a.severity === 'warn' ? 'bg-amber-400' : 'bg-sky-400'
                  }`}
                />
                <div className="flex-1 min-w-0">
                  <p className="text-[13px] text-slate-100 font-medium truncate">{a.title}</p>
                  <p className="text-[11.5px] text-slate-400 mt-0.5 truncate">{a.detail}</p>
                </div>
                <Link
                  href={`/admin/workspaces?focus=${a.orgId}`}
                  className="shrink-0 text-[11.5px] font-medium text-amber-300 hover:text-amber-200 px-2 py-1 rounded-md border border-amber-400/30 hover:border-amber-400/60 transition"
                >
                  {a.cta}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Top workspaces (top 5 by seats) */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-[14px] font-semibold text-slate-200">Largest workspaces</h2>
          <Link href="/admin/workspaces" className="text-[12px] text-amber-400 hover:text-amber-300">
            All workspaces →
          </Link>
        </div>
        <ul className="divide-y divide-white/5 rounded-xl border border-white/5 overflow-hidden">
          {orgs
            .slice()
            .sort((a, b) => b.seats - a.seats)
            .slice(0, 5)
            .map((o) => (
              <li key={o.orgId} className="bg-white/[0.02] px-4 py-3 flex items-center gap-3">
                <span className="w-7 h-7 rounded-md bg-gradient-to-br from-amber-400/30 to-rose-400/20 inline-flex items-center justify-center text-[11px] font-semibold text-amber-200 shrink-0">
                  {o.name.charAt(0).toUpperCase()}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-[13px] text-slate-100 font-medium truncate">{o.name}</p>
                  <p className="text-[11.5px] text-slate-400 truncate">
                    {o.seats} seats · {o.active7d} active 7d · {o.plan} plan
                  </p>
                </div>
                <HealthBadge h={o.health} />
                <p className="text-[11px] text-slate-500 w-20 text-right tabular-nums">
                  {formatAgo(o.lastActivityAt)}
                </p>
              </li>
            ))}
        </ul>
      </section>
    </div>
  )
}

function Kpi({
  label,
  value,
  sub,
  tone,
}: {
  label: string
  value: string
  sub: string
  tone: 'sage' | 'info' | 'warn'
}) {
  const accent =
    tone === 'warn' ? 'text-amber-300' : tone === 'info' ? 'text-sky-300' : 'text-emerald-300'
  return (
    <div className="rounded-xl border border-white/5 bg-white/[0.02] px-4 py-3.5">
      <p className="text-[10.5px] tracking-widest uppercase text-slate-500 font-medium">{label}</p>
      <p className={`mt-1.5 text-[22px] font-display tracking-tight ${accent} tabular-nums`}>{value}</p>
      <p className="text-[11px] text-slate-500 mt-0.5">{sub}</p>
    </div>
  )
}

export function HealthBadge({ h }: { h: 'new' | 'healthy' | 'growing' | 'at_risk' | 'churned' }) {
  const styles: Record<typeof h, { bg: string; fg: string; label: string }> = {
    new:     { bg: 'bg-sky-400/15',     fg: 'text-sky-300',     label: 'New' },
    healthy: { bg: 'bg-emerald-400/15', fg: 'text-emerald-300', label: 'Healthy' },
    growing: { bg: 'bg-emerald-400/15', fg: 'text-emerald-300', label: 'Growing' },
    at_risk: { bg: 'bg-rose-400/15',    fg: 'text-rose-300',    label: 'At risk' },
    churned: { bg: 'bg-slate-400/15',   fg: 'text-slate-400',   label: 'Churned' },
  }
  const s = styles[h]
  return (
    <span className={`text-[10.5px] font-medium px-2 py-0.5 rounded-full ${s.bg} ${s.fg}`}>
      {s.label}
    </span>
  )
}
