import Link from 'next/link'
import { and, eq, gte, isNull, sql, desc } from 'drizzle-orm'
import { db, schema } from '@/lib/db/client'
import { loadAllOrgKpis, formatAgo } from '@/lib/admin/analytics'

export const dynamic = 'force-dynamic'

const DAY_MS = 24 * 60 * 60 * 1000

/**
 * Customer-health issue inbox. Lists every signal that suggests an org is
 * struggling, in priority order. Designed for "5-minute morning sweep".
 *
 * Categories (by detection logic, not by severity grouping in the UI):
 *   - Onboarding incomplete: org > 7 days old, < 50% of seats have ever punched in
 *   - Stuck blocker: break category='blocked' open > 24h
 *   - Sync error: user.lastSyncError set
 *   - Failed cron: rate_limit_events with kind starting 'cron.' (TODO instrument)
 *   - Trial ending: trial ends in < 7 days AND plan == 'free'
 *   - Workspace churn: zero shifts in last 14 days
 */
type Issue = {
  severity: 'critical' | 'warn' | 'info'
  category: string
  title: string
  detail: string
  orgId: number | null
  href: string
  ts: string | null
}

export default async function AdminHealthPage() {
  const orgs = await loadAllOrgKpis()
  const since24 = new Date(Date.now() - DAY_MS)
  const since14 = new Date(Date.now() - 14 * DAY_MS)

  // Stuck blockers (>24h open)
  const stuckBlockers = await db
    .select({
      breakId: schema.breaks.id,
      orgId: schema.breaks.orgId,
      userId: schema.breaks.userId,
      startedAt: schema.breaks.startedAt,
      reason: schema.breaks.reason,
      userLogin: schema.users.login,
      userName: schema.users.name,
      orgName: schema.orgs.name,
    })
    .from(schema.breaks)
    .innerJoin(schema.users, eq(schema.breaks.userId, schema.users.id))
    .leftJoin(schema.orgs, eq(schema.breaks.orgId, schema.orgs.id))
    .where(
      and(
        eq(schema.breaks.category, 'blocked'),
        isNull(schema.breaks.endedAt),
        sql`${schema.breaks.startedAt} < ${since24.toISOString()}`,
      ),
    )
    .orderBy(desc(schema.breaks.startedAt))
    .limit(20)

  // Users with recent sync errors
  const syncErrors = await db
    .select({
      userId: schema.users.id,
      login: schema.users.login,
      name: schema.users.name,
      error: schema.users.lastSyncError,
      lastSyncedAt: schema.users.lastSyncedAt,
      orgId: schema.memberships.orgId,
      orgName: schema.orgs.name,
    })
    .from(schema.users)
    .innerJoin(schema.memberships, eq(schema.memberships.userId, schema.users.id))
    .innerJoin(schema.orgs, eq(schema.memberships.orgId, schema.orgs.id))
    .where(
      and(
        sql`${schema.users.lastSyncError} IS NOT NULL`,
        isNull(schema.memberships.endedAt),
      ),
    )
    .limit(20)

  // Build the issues feed
  const issues: Issue[] = []

  for (const o of orgs) {
    const ageMs = Date.now() - new Date(o.createdAt).getTime()
    // Onboarding incomplete
    if (ageMs > 7 * DAY_MS && o.shifts7d === 0 && o.seats > 0) {
      issues.push({
        severity: 'warn',
        category: 'Onboarding',
        title: `${o.name} hasn't started using MARINA`,
        detail: `${o.seats} seats invited · zero shifts in 7 days · created ${formatAgo(o.createdAt)}`,
        orgId: o.orgId,
        href: `/admin/workspaces?focus=${o.orgId}`,
        ts: o.createdAt,
      })
    }
    // Workspace churn
    if (ageMs > 30 * DAY_MS && !o.lastActivityAt) {
      issues.push({
        severity: 'critical',
        category: 'Churn',
        title: `${o.name} appears churned`,
        detail: `No activity at all · ${o.seats} seats sitting idle`,
        orgId: o.orgId,
        href: `/admin/workspaces?focus=${o.orgId}`,
        ts: o.createdAt,
      })
    } else if (o.lastActivityAt && new Date(o.lastActivityAt).getTime() < since14.getTime()) {
      issues.push({
        severity: 'warn',
        category: 'Churn risk',
        title: `${o.name} hasn't checked in for 14+ days`,
        detail: `Last shift ${formatAgo(o.lastActivityAt)} · ${o.seats} seats`,
        orgId: o.orgId,
        href: `/admin/workspaces?focus=${o.orgId}`,
        ts: o.lastActivityAt,
      })
    }
    // Trial ending
    if (o.trialEndsAt && o.plan === 'free') {
      const daysToEnd = (new Date(o.trialEndsAt).getTime() - Date.now()) / DAY_MS
      if (daysToEnd > 0 && daysToEnd < 7) {
        issues.push({
          severity: 'info',
          category: 'Trial',
          title: `${o.name} trial ends in ${Math.ceil(daysToEnd)} days`,
          detail: `Reach out before they drop ${o.active7d > 0 ? '— actively using' : '— silent so far'}`,
          orgId: o.orgId,
          href: `/admin/workspaces?focus=${o.orgId}`,
          ts: o.trialEndsAt,
        })
      }
    }
  }

  for (const b of stuckBlockers) {
    const hoursOpen = Math.floor((Date.now() - new Date(b.startedAt).getTime()) / 3600000)
    issues.push({
      severity: hoursOpen > 48 ? 'critical' : 'warn',
      category: 'Stuck blocker',
      title: `${b.userName ?? b.userLogin} blocked ${hoursOpen}h`,
      detail: `${b.orgName ?? '?'} · "${(b.reason ?? '').slice(0, 80)}"`,
      orgId: b.orgId,
      href: `/admin/workspaces?focus=${b.orgId}`,
      ts: b.startedAt.toISOString(),
    })
  }

  for (const s of syncErrors.slice(0, 10)) {
    issues.push({
      severity: 'warn',
      category: 'Sync error',
      title: `${s.name ?? s.login} GitHub sync failing`,
      detail: `${s.orgName} · ${(s.error ?? '').slice(0, 100)}`,
      orgId: s.orgId,
      href: `/admin/workspaces?focus=${s.orgId}`,
      ts: s.lastSyncedAt?.toISOString() ?? null,
    })
  }

  // Sort by severity then recency
  const sevRank = { critical: 0, warn: 1, info: 2 } as const
  issues.sort((a, b) => {
    if (sevRank[a.severity] !== sevRank[b.severity]) return sevRank[a.severity] - sevRank[b.severity]
    const at = a.ts ? new Date(a.ts).getTime() : 0
    const bt = b.ts ? new Date(b.ts).getTime() : 0
    return bt - at
  })

  const groups: Record<string, Issue[]> = {}
  for (const i of issues) {
    if (!groups[i.category]) groups[i.category] = []
    groups[i.category].push(i)
  }

  return (
    <div>
      <header className="mb-7">
        <p className="text-[11px] tracking-widest uppercase text-amber-400/80 font-semibold">
          Founder console
        </p>
        <h1 className="font-display text-[32px] leading-tight mt-1 text-white">Health</h1>
        <p className="text-[13.5px] text-slate-400 mt-1">
          Every signal that suggests a customer is struggling. {issues.length} active.
        </p>
      </header>

      {issues.length === 0 ? (
        <div className="rounded-xl border border-emerald-400/20 bg-emerald-400/[0.05] px-6 py-10 text-center">
          <p className="text-[15px] text-emerald-200 font-medium">All clear</p>
          <p className="text-[12.5px] text-slate-400 mt-1">
            No stuck blockers, no sync errors, no churning workspaces.
          </p>
        </div>
      ) : (
        <div className="space-y-5">
          {Object.entries(groups).map(([cat, list]) => (
            <section key={cat}>
              <h2 className="text-[11px] uppercase tracking-wider text-slate-500 font-semibold mb-2">
                {cat} <span className="ml-1.5 text-slate-600">{list.length}</span>
              </h2>
              <ul className="divide-y divide-white/5 rounded-xl border border-white/5 overflow-hidden">
                {list.map((i, idx) => (
                  <li key={idx} className="bg-white/[0.02] px-4 py-3 flex items-start gap-3">
                    <span
                      className={`mt-1 inline-block w-1.5 h-1.5 rounded-full shrink-0 ${
                        i.severity === 'critical' ? 'bg-rose-400' : i.severity === 'warn' ? 'bg-amber-400' : 'bg-sky-400'
                      }`}
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-[13px] text-slate-100 font-medium">{i.title}</p>
                      <p className="text-[11.5px] text-slate-400 mt-0.5">{i.detail}</p>
                    </div>
                    {i.orgId !== null && (
                      <Link
                        href={i.href}
                        className="shrink-0 text-[11px] text-amber-300 hover:text-amber-200 px-2 py-1 rounded-md border border-amber-400/30 hover:border-amber-400/60 transition"
                      >
                        Inspect
                      </Link>
                    )}
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </div>
  )
}
