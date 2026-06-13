import Link from 'next/link'
import { and, desc, eq, gte, isNull, sql } from 'drizzle-orm'
import { db, schema } from '@/lib/db/client'
import { formatAgo } from '@/lib/admin/analytics'

export const dynamic = 'force-dynamic'

const DAY_MS = 24 * 60 * 60 * 1000

/**
 * Error log — anything across the platform that suggests something broke.
 *
 * Sources we surface (all real, all queryable):
 *
 *  - **GitHub sync errors**: `users.lastSyncError` — set by the sync worker
 *    when a token is dead, rate-limited, or the request blew up. Grouped
 *    by org so you can see "this customer has 3 broken integrations".
 *
 *  - **Rate-limit blocks**: `rate_limit_events` — every time a user hit a
 *    cap. High counts usually mean either a runaway client or an honest user
 *    being throttled by a too-tight bucket.
 *
 *  - **Failed leave decisions**: audit entries with action='leave.decided'
 *    where the decision was 'denied' or an error. (Less of an error, more
 *    of a flag — left here for completeness.)
 *
 *  - **Stuck blockers > 48h**: `breaks` with category='blocked' open longer
 *    than 48h — these are operational failures in the blocker-resolver
 *    workflow (manager didn't respond, employee didn't update).
 *
 * Not yet surfaced (TODO instrumentation): cron failures, AI provider
 * fallback events, Razorpay webhook signature failures. Worth adding a
 * `system_errors` table when those start happening regularly.
 */
export default async function AdminErrorsPage() {
  const since30 = new Date(Date.now() - 30 * DAY_MS)
  const since48h = new Date(Date.now() - 2 * DAY_MS)

  // 1. GitHub sync errors grouped by org
  const syncErrorRows = await db
    .select({
      userId: schema.users.id,
      login: schema.users.login,
      name: schema.users.name,
      email: schema.users.email,
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
    .orderBy(desc(schema.users.lastSyncedAt))
    .limit(100)

  const syncByOrg = new Map<number, typeof syncErrorRows>()
  for (const e of syncErrorRows) {
    if (!syncByOrg.has(e.orgId)) syncByOrg.set(e.orgId, [])
    syncByOrg.get(e.orgId)!.push(e)
  }

  // 2. Rate-limit blocks last 30 days
  const rateLimitRows = await db
    .select({
      key: schema.rateLimitEvents.bucket,
      n: sql<number>`COUNT(*)`,
      latest: sql<string>`MAX(${schema.rateLimitEvents.occurredAt})`,
    })
    .from(schema.rateLimitEvents)
    .where(gte(schema.rateLimitEvents.occurredAt, since30))
    .groupBy(schema.rateLimitEvents.bucket)
    .orderBy(desc(sql`COUNT(*)`))
    .limit(20)

  // 3. Stuck blockers > 48h
  const stuckBlockers = await db
    .select({
      breakId: schema.breaks.id,
      orgId: schema.breaks.orgId,
      orgName: schema.orgs.name,
      userId: schema.breaks.userId,
      userLogin: schema.users.login,
      userName: schema.users.name,
      startedAt: schema.breaks.startedAt,
      reason: schema.breaks.reason,
    })
    .from(schema.breaks)
    .innerJoin(schema.users, eq(schema.breaks.userId, schema.users.id))
    .leftJoin(schema.orgs, eq(schema.breaks.orgId, schema.orgs.id))
    .where(
      and(
        eq(schema.breaks.category, 'blocked'),
        isNull(schema.breaks.endedAt),
        sql`${schema.breaks.startedAt} < ${since48h.toISOString()}`,
      ),
    )
    .orderBy(desc(schema.breaks.startedAt))
    .limit(30)

  // 4. Denied leaves in last 7 days — operational signal
  const since7 = new Date(Date.now() - 7 * DAY_MS)
  const deniedLeaves = await db
    .select({
      leaveId: schema.leaveRequests.id,
      orgId: schema.leaveRequests.orgId,
      orgName: schema.orgs.name,
      userName: schema.users.name,
      userLogin: schema.users.login,
      decidedAt: schema.leaveRequests.decidedAt,
      reason: schema.leaveRequests.reason,
      decidedNote: schema.leaveRequests.decidedNote,
    })
    .from(schema.leaveRequests)
    .innerJoin(schema.orgs, eq(schema.leaveRequests.orgId, schema.orgs.id))
    .innerJoin(schema.users, eq(schema.leaveRequests.userId, schema.users.id))
    .where(
      and(eq(schema.leaveRequests.status, 'denied'), gte(schema.leaveRequests.createdAt, since7)),
    )
    .limit(20)

  const totalErrors =
    syncErrorRows.length + Number(rateLimitRows.reduce((acc, r) => acc + Number(r.n), 0)) + stuckBlockers.length

  return (
    <div>
      <header className="mb-7">
        <p className="text-[11px] tracking-widest uppercase text-amber-400/80 font-semibold">
          Founder console
        </p>
        <h1 className="font-display text-[32px] leading-tight mt-1 text-white">Error log</h1>
        <p className="text-[13.5px] text-slate-400 mt-1">
          Real errors from across the platform — sync failures, rate-limit hits, stuck blockers.
          {totalErrors > 0 && (
            <span className="ml-1">
              {' '}<span className="text-rose-300 font-medium">{totalErrors}</span> total signals.
            </span>
          )}
        </p>
      </header>

      {/* Sync errors */}
      <section className="mb-7">
        <h2 className="text-[12px] uppercase tracking-wider text-slate-500 font-semibold mb-2">
          GitHub sync errors
          <span className="ml-1.5 text-slate-600">{syncErrorRows.length}</span>
        </h2>
        {syncErrorRows.length === 0 ? (
          <p className="text-[13px] text-slate-500 px-4 py-4 rounded-xl border border-white/5 bg-white/[0.02]">
            All integrations healthy.
          </p>
        ) : (
          <ul className="space-y-3">
            {Array.from(syncByOrg.entries()).map(([orgId, errs]) => (
              <li key={orgId} className="rounded-xl border border-white/5 bg-white/[0.02] overflow-hidden">
                <div className="px-4 py-2.5 border-b border-white/5 bg-rose-400/[0.05] flex items-center justify-between">
                  <p className="text-[12.5px] text-slate-100 font-medium">
                    {errs[0].orgName ?? '?'}
                    <span className="ml-1.5 text-rose-300 text-[11px]">
                      {errs.length} broken
                    </span>
                  </p>
                  <Link
                    href={`/admin/workspaces/${orgId}`}
                    className="text-[11px] text-amber-300 hover:text-amber-200"
                  >
                    Open workspace →
                  </Link>
                </div>
                <ul className="divide-y divide-white/5">
                  {errs.map((e) => (
                    <li key={e.userId} className="px-4 py-2.5">
                      <p className="text-[12.5px] text-slate-200">
                        {e.name ?? `@${e.login}`}
                        <span className="ml-1.5 text-[10.5px] text-slate-500">{e.email ?? ''}</span>
                      </p>
                      <p className="text-[11px] text-rose-300/90 mt-0.5 break-all">
                        {(e.error ?? '').slice(0, 240)}
                      </p>
                      <p className="text-[10.5px] text-slate-500 mt-0.5">
                        last attempt {formatAgo(e.lastSyncedAt?.toISOString() ?? null)}
                      </p>
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Rate-limit blocks */}
      <section className="mb-7">
        <h2 className="text-[12px] uppercase tracking-wider text-slate-500 font-semibold mb-2">
          Rate-limit blocks · 30d
          <span className="ml-1.5 text-slate-600">{rateLimitRows.length} buckets</span>
        </h2>
        {rateLimitRows.length === 0 ? (
          <p className="text-[13px] text-slate-500 px-4 py-4 rounded-xl border border-white/5 bg-white/[0.02]">
            No rate-limit hits recorded.
          </p>
        ) : (
          <ul className="divide-y divide-white/5 rounded-xl border border-white/5 overflow-hidden">
            {rateLimitRows.map((r) => (
              <li key={r.key} className="bg-white/[0.02] px-4 py-2.5 flex items-center gap-3">
                <code className="text-[11.5px] text-amber-300/80 font-mono truncate flex-1">{r.key}</code>
                <span className="text-[11.5px] text-slate-400 tabular-nums shrink-0">
                  {Number(r.n)} hits
                </span>
                <span className="text-[10.5px] text-slate-500 shrink-0 w-20 text-right">
                  {formatAgo(r.latest ? new Date(r.latest).toISOString() : null)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Stuck blockers > 48h */}
      <section className="mb-7">
        <h2 className="text-[12px] uppercase tracking-wider text-slate-500 font-semibold mb-2">
          Stuck blockers · &gt; 48h open
          <span className="ml-1.5 text-slate-600">{stuckBlockers.length}</span>
        </h2>
        {stuckBlockers.length === 0 ? (
          <p className="text-[13px] text-slate-500 px-4 py-4 rounded-xl border border-white/5 bg-white/[0.02]">
            No blockers stuck past 48 hours.
          </p>
        ) : (
          <ul className="divide-y divide-white/5 rounded-xl border border-white/5 overflow-hidden">
            {stuckBlockers.map((b) => {
              const hrs = Math.floor((Date.now() - new Date(b.startedAt).getTime()) / 3600000)
              return (
                <li key={b.breakId} className="bg-white/[0.02] px-4 py-2.5 flex items-start gap-3">
                  <span className="mt-1 inline-block w-1.5 h-1.5 rounded-full bg-rose-400 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-[12.5px] text-slate-100 truncate">
                      {b.userName ?? `@${b.userLogin}`}
                      <span className="ml-2 text-slate-500 text-[11px]">{b.orgName}</span>
                    </p>
                    <p className="text-[11px] text-slate-400 truncate">{b.reason ?? '(no reason given)'}</p>
                  </div>
                  <span className="text-[11px] text-rose-300 tabular-nums shrink-0">{hrs}h</span>
                  {b.orgId && (
                    <Link
                      href={`/admin/workspaces/${b.orgId}`}
                      className="text-[11px] text-amber-300 hover:text-amber-200 shrink-0"
                    >
                      Inspect
                    </Link>
                  )}
                </li>
              )
            })}
          </ul>
        )}
      </section>

      {/* Denied leaves (7d) */}
      <section>
        <h2 className="text-[12px] uppercase tracking-wider text-slate-500 font-semibold mb-2">
          Denied leaves · 7d
          <span className="ml-1.5 text-slate-600">{deniedLeaves.length}</span>
        </h2>
        {deniedLeaves.length === 0 ? (
          <p className="text-[13px] text-slate-500 px-4 py-4 rounded-xl border border-white/5 bg-white/[0.02]">
            No denials this week.
          </p>
        ) : (
          <ul className="divide-y divide-white/5 rounded-xl border border-white/5 overflow-hidden">
            {deniedLeaves.map((l) => (
              <li key={l.leaveId} className="bg-white/[0.02] px-4 py-2.5">
                <p className="text-[12.5px] text-slate-200">
                  {l.userName ?? `@${l.userLogin}`}
                  <span className="ml-1.5 text-[11px] text-slate-500">{l.orgName}</span>
                </p>
                {l.decidedNote && (
                  <p className="text-[11px] text-slate-400 mt-0.5 truncate">{l.decidedNote}</p>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
