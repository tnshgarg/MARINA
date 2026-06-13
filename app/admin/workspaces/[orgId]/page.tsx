import { notFound } from 'next/navigation'
import Link from 'next/link'
import { and, count, countDistinct, desc, eq, gte, isNull, sql } from 'drizzle-orm'
import { db, schema } from '@/lib/db/client'
import { loadAllOrgKpis, formatUsd, formatAgo } from '@/lib/admin/analytics'

export const dynamic = 'force-dynamic'

const DAY_MS = 24 * 60 * 60 * 1000

/**
 * Single-workspace drilldown for the founder console. Mirrors the key
 * customer-side metrics a workspace owner would see on their own dashboard,
 * plus admin-only fields (owner email, plan, AI spend, sync error log,
 * recent admin audit entries).
 *
 * Designed for "I'm about to email this customer — what's the latest with
 * them?" — every block answers one of: are they healthy / are they shipping
 * / are they blocked / what did they last touch / who's not connected yet.
 */
export default async function AdminOrgDrilldownPage({
  params,
}: {
  params: Promise<{ orgId: string }>
}) {
  const { orgId: raw } = await params
  const orgId = Number(raw)
  if (!Number.isInteger(orgId)) notFound()

  const org = await db.query.orgs.findFirst({ where: eq(schema.orgs.id, orgId) })
  if (!org) notFound()

  const owner = await db.query.users.findFirst({ where: eq(schema.users.id, org.ownerId) })

  // KPI sweep (reuse analytics for one org).
  const allKpis = await loadAllOrgKpis()
  const kpi = allKpis.find((o) => o.orgId === orgId)!

  const since7 = new Date(Date.now() - 7 * DAY_MS)
  const since30 = new Date(Date.now() - 30 * DAY_MS)
  const todayIso = new Date().toISOString().slice(0, 10)

  // Members + status
  const memberRows = await db
    .select({
      membership: schema.memberships,
      user: schema.users,
    })
    .from(schema.memberships)
    .innerJoin(schema.users, eq(schema.memberships.userId, schema.users.id))
    .where(and(eq(schema.memberships.orgId, orgId), isNull(schema.memberships.endedAt)))

  const userIds = memberRows.map((r) => r.user.id)

  // Active shifts (per-user latest)
  const activeShifts = userIds.length
    ? await db
        .select()
        .from(schema.shifts)
        .where(and(eq(schema.shifts.orgId, orgId), isNull(schema.shifts.punchedOutAt)))
    : []
  const activeShiftByUser = new Map(activeShifts.map((s) => [s.userId, s]))

  // Active breaks (per user)
  const activeBreaks = userIds.length
    ? await db
        .select()
        .from(schema.breaks)
        .where(and(eq(schema.breaks.orgId, orgId), isNull(schema.breaks.endedAt)))
    : []
  const activeBreakByUser = new Map(activeBreaks.map((b) => [b.userId, b]))

  // Recent deliverables (7d)
  const recentDeliverables = userIds.length
    ? await db
        .select({
          d: schema.deliverables,
          u: schema.users,
        })
        .from(schema.deliverables)
        .innerJoin(schema.users, eq(schema.deliverables.userId, schema.users.id))
        .where(and(eq(schema.deliverables.orgId, orgId), gte(schema.deliverables.completedAt, since7)))
        .orderBy(desc(schema.deliverables.completedAt))
        .limit(15)
    : []

  // Recent leaves (30d)
  const recentLeaves = userIds.length
    ? await db
        .select({
          l: schema.leaveRequests,
          u: schema.users,
        })
        .from(schema.leaveRequests)
        .innerJoin(schema.users, eq(schema.leaveRequests.userId, schema.users.id))
        .where(and(eq(schema.leaveRequests.orgId, orgId), gte(schema.leaveRequests.createdAt, since30)))
        .orderBy(desc(schema.leaveRequests.createdAt))
        .limit(10)
    : []

  // AI spend MTD by feature kind
  const monthStart = new Date()
  monthStart.setUTCDate(1)
  monthStart.setUTCHours(0, 0, 0, 0)
  const spendByKind = await db
    .select({
      kind: schema.aiSpend.kind,
      cents: sql<number>`COALESCE(SUM(${schema.aiSpend.costCents}), 0)`,
      calls: count(),
    })
    .from(schema.aiSpend)
    .where(and(eq(schema.aiSpend.orgId, orgId), gte(schema.aiSpend.createdAt, monthStart)))
    .groupBy(schema.aiSpend.kind)

  // Sync errors per user
  const syncErrUsers = userIds.length
    ? await db
        .select()
        .from(schema.users)
        .where(
          and(
            sql`${schema.users.lastSyncError} IS NOT NULL`,
            sql`${schema.users.id} = ANY(ARRAY[${sql.raw(userIds.join(','))}]::int[])`,
          ),
        )
    : []

  // Recent audit log entries for this org
  const auditEntries = await db
    .select({
      a: schema.auditLogs,
      actor: schema.users,
    })
    .from(schema.auditLogs)
    .leftJoin(schema.users, eq(schema.auditLogs.actorUserId, schema.users.id))
    .where(eq(schema.auditLogs.orgId, orgId))
    .orderBy(desc(schema.auditLogs.createdAt))
    .limit(20)

  // Computed: shipping today, blocked, on leave, productivity proxy
  const todayShifts = userIds.length
    ? await db
        .select({ n: countDistinct(schema.shifts.userId) })
        .from(schema.shifts)
        .where(and(eq(schema.shifts.orgId, orgId), gte(schema.shifts.punchedInAt, new Date(todayIso + 'T00:00:00Z'))))
    : [{ n: 0 }]
  const todayBlocked = activeBreaks.filter((b) => b.category === 'blocked').length

  return (
    <div>
      <header className="mb-6 flex items-center justify-between gap-4">
        <div>
          <Link
            href="/admin/workspaces"
            className="text-[11.5px] text-amber-400 hover:text-amber-300"
          >
            ← All workspaces
          </Link>
          <h1 className="font-display text-[28px] text-white mt-1 leading-tight">{org.name}</h1>
          <p className="text-[12px] text-slate-400 mt-0.5">
            Owner · {owner?.email ?? `@${owner?.login}`} · {org.plan} plan · created {formatAgo(org.createdAt.toISOString())}
          </p>
        </div>
        <a
          href={`/org/${orgId}`}
          target="_blank"
          rel="noopener noreferrer"
          className="text-[12px] text-amber-300 hover:text-amber-200 border border-amber-400/40 hover:border-amber-400/60 rounded-md px-3 py-1.5 transition"
        >
          Open as owner ↗
        </a>
      </header>

      {/* Customer-side KPI mirror */}
      <section className="grid grid-cols-2 md:grid-cols-5 gap-2.5 mb-6">
        <Kpi label="Seats" value={kpi.seats.toString()} sub={`${kpi.active7d} active 7d`} />
        <Kpi label="Shipping today" value={Number(todayShifts[0].n).toString()} sub={`${kpi.shifts7d} shifts 7d`} />
        <Kpi label="Blocked now" value={todayBlocked.toString()} sub={`${kpi.blockersOpen} open total`} tone={todayBlocked > 0 ? 'rose' : 'neutral'} />
        <Kpi label="Deliverables 7d" value={kpi.deliverables7d.toString()} sub="marked-as-done" />
        <Kpi label="AI spend MTD" value={formatUsd(kpi.aiSpendCentsThisMonth)} sub={spendByKind.length > 0 ? `${spendByKind.length} kinds` : 'no usage'} />
      </section>

      <div className="grid lg:grid-cols-3 gap-5">
        {/* Members list */}
        <section className="lg:col-span-2 rounded-xl border border-white/5 bg-white/[0.02] p-4">
          <h2 className="text-[11px] uppercase tracking-widest text-slate-500 font-semibold mb-3">
            Members ({memberRows.length})
          </h2>
          {memberRows.length === 0 ? (
            <p className="text-[13px] text-slate-500">No members yet.</p>
          ) : (
            <ul className="divide-y divide-white/5">
              {memberRows.map((r) => {
                const sh = activeShiftByUser.get(r.user.id)
                const br = activeBreakByUser.get(r.user.id)
                const status: { label: string; cls: string } = br
                  ? br.category === 'blocked'
                    ? { label: 'Blocked', cls: 'bg-rose-400/15 text-rose-300' }
                    : { label: `Break · ${br.category}`, cls: 'bg-amber-400/15 text-amber-300' }
                  : sh
                    ? { label: 'Working', cls: 'bg-emerald-400/15 text-emerald-300' }
                    : { label: 'Off-clock', cls: 'bg-slate-400/15 text-slate-400' }
                return (
                  <li key={r.user.id} className="py-2 flex items-center gap-3">
                    <span className="w-7 h-7 rounded-md bg-amber-400/15 inline-flex items-center justify-center text-[11px] text-amber-300 font-semibold shrink-0">
                      {(r.user.name ?? r.user.login).charAt(0).toUpperCase()}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-[13px] text-slate-100 truncate">
                        {r.user.name ?? `@${r.user.login}`}
                        <span className="ml-1.5 text-[10.5px] text-slate-500 uppercase tracking-wider">
                          {r.membership.role}
                        </span>
                      </p>
                      <p className="text-[11px] text-slate-500 truncate">
                        {r.user.email ?? '—'}
                        {r.user.lastSyncError && (
                          <span className="text-rose-300 ml-2">sync error</span>
                        )}
                      </p>
                    </div>
                    <span className={`text-[10.5px] font-medium px-2 py-0.5 rounded-full shrink-0 ${status.cls}`}>
                      {status.label}
                    </span>
                  </li>
                )
              })}
            </ul>
          )}
        </section>

        {/* AI spend breakdown */}
        <section className="rounded-xl border border-white/5 bg-white/[0.02] p-4">
          <h2 className="text-[11px] uppercase tracking-widest text-slate-500 font-semibold mb-3">
            AI spend · MTD
          </h2>
          {spendByKind.length === 0 ? (
            <p className="text-[13px] text-slate-500">No spend yet this month.</p>
          ) : (
            <ul className="space-y-2">
              {spendByKind.map((s) => (
                <li key={s.kind} className="text-[13px] flex justify-between">
                  <span className="text-slate-200 capitalize">{s.kind.replace(/_/g, ' ')}</span>
                  <span className="text-slate-300 tabular-nums">
                    {formatUsd(Number(s.cents))}
                    <span className="text-slate-500 text-[11px] ml-1">· {Number(s.calls)} calls</span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      {/* Recent activity + leaves */}
      <div className="grid md:grid-cols-2 gap-5 mt-5">
        <section className="rounded-xl border border-white/5 bg-white/[0.02] p-4">
          <h2 className="text-[11px] uppercase tracking-widest text-slate-500 font-semibold mb-3">
            Recent deliverables ({recentDeliverables.length})
          </h2>
          {recentDeliverables.length === 0 ? (
            <p className="text-[13px] text-slate-500">No work logged in last 7 days.</p>
          ) : (
            <ul className="divide-y divide-white/5">
              {recentDeliverables.slice(0, 8).map((r) => (
                <li key={r.d.id} className="py-2">
                  <p className="text-[12.5px] text-slate-100 truncate">{r.d.title}</p>
                  <p className="text-[10.5px] text-slate-500 truncate">
                    {r.u.name ?? r.u.login} · {formatAgo(r.d.completedAt.toISOString())}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="rounded-xl border border-white/5 bg-white/[0.02] p-4">
          <h2 className="text-[11px] uppercase tracking-widest text-slate-500 font-semibold mb-3">
            Recent leaves ({recentLeaves.length})
          </h2>
          {recentLeaves.length === 0 ? (
            <p className="text-[13px] text-slate-500">No leave requests in last 30 days.</p>
          ) : (
            <ul className="divide-y divide-white/5">
              {recentLeaves.slice(0, 8).map((r) => (
                <li key={r.l.id} className="py-2 flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-[12.5px] text-slate-100 truncate">
                      {r.u.name ?? r.u.login} · {r.l.leaveType}
                    </p>
                    <p className="text-[10.5px] text-slate-500 truncate">
                      {r.l.startDate} → {r.l.endDate}
                    </p>
                  </div>
                  <span
                    className={`text-[10px] px-1.5 py-0.5 rounded-full capitalize ${
                      r.l.status === 'approved'
                        ? 'bg-emerald-400/15 text-emerald-300'
                        : r.l.status === 'denied'
                          ? 'bg-rose-400/15 text-rose-300'
                          : 'bg-amber-400/15 text-amber-300'
                    }`}
                  >
                    {r.l.status}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      {/* Sync errors + audit log */}
      <div className="grid md:grid-cols-2 gap-5 mt-5">
        <section className="rounded-xl border border-white/5 bg-white/[0.02] p-4">
          <h2 className="text-[11px] uppercase tracking-widest text-slate-500 font-semibold mb-3">
            Sync errors ({syncErrUsers.length})
          </h2>
          {syncErrUsers.length === 0 ? (
            <p className="text-[13px] text-slate-500">All integrations healthy.</p>
          ) : (
            <ul className="divide-y divide-white/5">
              {syncErrUsers.map((u) => (
                <li key={u.id} className="py-2">
                  <p className="text-[12.5px] text-slate-100">{u.name ?? `@${u.login}`}</p>
                  <p className="text-[10.5px] text-rose-300 truncate" title={u.lastSyncError ?? ''}>
                    {u.lastSyncError}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="rounded-xl border border-white/5 bg-white/[0.02] p-4">
          <h2 className="text-[11px] uppercase tracking-widest text-slate-500 font-semibold mb-3">
            Recent admin actions ({auditEntries.length})
          </h2>
          {auditEntries.length === 0 ? (
            <p className="text-[13px] text-slate-500">No audit entries yet.</p>
          ) : (
            <ul className="divide-y divide-white/5 max-h-[320px] overflow-y-auto">
              {auditEntries.map((e) => (
                <li key={e.a.id} className="py-2">
                  <p className="text-[12.5px] text-slate-200">
                    <span className="text-amber-300/80">{e.a.action}</span>
                    {' · '}
                    {e.actor?.name ?? `@${e.actor?.login ?? '?'}`}
                  </p>
                  <p className="text-[10.5px] text-slate-500">
                    {formatAgo(e.a.createdAt.toISOString())}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
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
  tone?: 'rose' | 'neutral'
}) {
  const fg = tone === 'rose' ? 'text-rose-300' : 'text-emerald-300'
  return (
    <div className="rounded-lg border border-white/5 bg-white/[0.02] px-3 py-2.5">
      <p className="text-[10px] uppercase tracking-widest text-slate-500 font-medium">{label}</p>
      <p className={`mt-1 text-[20px] font-display tracking-tight ${fg} tabular-nums`}>{value}</p>
      <p className="text-[10.5px] text-slate-500 mt-0.5 truncate">{sub}</p>
    </div>
  )
}
