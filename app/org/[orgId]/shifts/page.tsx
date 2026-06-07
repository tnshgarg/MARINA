import { notFound } from 'next/navigation'
import Link from 'next/link'
import { and, desc, eq, gte, inArray } from 'drizzle-orm'
import { db, schema } from '@/lib/db/client'
import { CharacterAvatar } from '@/components/character-avatar'
import { PeopleTabs } from '@/components/org-tabs'

export const dynamic = 'force-dynamic'

type RangeKey = 'today' | '7d' | '30d' | 'all'

const RANGES: Array<{ key: RangeKey; label: string; days: number | null }> = [
  { key: 'today', label: 'Today', days: 1 },
  { key: '7d', label: '7 days', days: 7 },
  { key: '30d', label: '30 days', days: 30 },
  { key: 'all', label: 'All', days: null },
]

function parseRange(raw: string | undefined): RangeKey {
  if (raw === '7d' || raw === '30d' || raw === 'all') return raw
  return 'today'
}

function sinceFor(range: RangeKey): Date | null {
  if (range === 'today') {
    const d = new Date()
    d.setHours(0, 0, 0, 0)
    return d
  }
  const cfg = RANGES.find((r) => r.key === range)!
  if (cfg.days == null) return null
  return new Date(Date.now() - cfg.days * 24 * 60 * 60 * 1000)
}

export default async function ShiftsPage({
  params,
  searchParams,
}: {
  params: Promise<{ orgId: string }>
  searchParams: Promise<{ range?: string }>
}) {
  const { orgId: raw } = await params
  const sp = await searchParams
  const range = parseRange(sp.range)
  const orgId = Number(raw)
  if (!Number.isInteger(orgId)) notFound()

  const memberRows = await db
    .select({ userId: schema.memberships.userId })
    .from(schema.memberships)
    .where(eq(schema.memberships.orgId, orgId))
  const userIds = memberRows.map((m) => m.userId)

  const since = sinceFor(range)

  const baseWhere = userIds.length
    ? since
      ? and(inArray(schema.shifts.userId, userIds), gte(schema.shifts.punchedInAt, since))
      : inArray(schema.shifts.userId, userIds)
    : undefined

  const rows = userIds.length
    ? await db
        .select({ s: schema.shifts, u: schema.users })
        .from(schema.shifts)
        .innerJoin(schema.users, eq(schema.shifts.userId, schema.users.id))
        .where(baseWhere)
        .orderBy(desc(schema.shifts.punchedInAt))
        .limit(200)
    : []

  const open = rows.filter((r) => !r.s.punchedOutAt)
  const closed = rows.filter((r) => r.s.punchedOutAt)

  const rangeLabel = RANGES.find((r) => r.key === range)!.label

  return (
    <>
      <div className="mb-4">
        <h1 className="text-[22px] font-semibold text-slate-900 tracking-tight">People</h1>
        <p className="mt-1.5 text-[13px] text-slate-600">
          Punch-in / punch-out history with AI-verified work summaries.
        </p>
      </div>
      <PeopleTabs orgId={orgId} />

      <section className="app-card app-card-lg hover-lift mb-6">
        <div className="section-title-row">
          <h2 className="app-h2">Punched in now</h2>
          <span className="pill pill-good">{open.length} working</span>
        </div>
        {open.length === 0 ? (
          <p className="mt-3 app-sub">Nobody&apos;s on the clock right now.</p>
        ) : (
          <ul className="mt-4 space-y-2">
            {open.map(({ s, u }) => (
              <li
                key={s.id}
                className="flex items-center gap-3 rounded-xl border border-emerald-100 bg-emerald-50/60 p-3"
              >
                <CharacterAvatar characterKey={u.characterKey} size={32} />
                <div className="flex-1 min-w-0">
                  <p className="text-[13.5px] font-medium text-slate-900 truncate">
                    {u.name ?? `@${u.login}`}
                  </p>
                  <p className="text-[11.5px] text-slate-600">
                    Punched in {timeAgo(s.punchedInAt.toISOString())} · via {s.punchedInVia}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="app-card hover-lift">
        <div className="px-5 py-4 border-b border-slate-100 flex items-baseline justify-between gap-3 flex-wrap">
          <div>
            <h2 className="app-h2">Recent punch-outs</h2>
            <p className="text-[12px] text-slate-500 mt-0.5">
              {rangeLabel} · {closed.length} {closed.length === 1 ? 'shift' : 'shifts'}
            </p>
          </div>
          <RangeChips orgId={orgId} active={range} />
        </div>
        {closed.length === 0 ? (
          <div className="p-12 text-center">
            <p className="text-[13px] text-slate-500">
              No completed shifts in this window.
            </p>
            {range !== 'all' && (
              <Link
                href={`/org/${orgId}/shifts?range=all`}
                className="mt-3 inline-block text-[12.5px] text-indigo-600 hover:text-indigo-700"
              >
                See all time →
              </Link>
            )}
          </div>
        ) : (
          <ul className="divide-y divide-slate-100">
            {closed.map(({ s, u }) => (
              <ShiftRow key={s.id} shift={s} user={u} />
            ))}
          </ul>
        )}
      </section>
    </>
  )
}

function RangeChips({ orgId, active }: { orgId: number; active: RangeKey }) {
  return (
    <div
      className="inline-flex rounded-lg border border-slate-200 bg-slate-50 p-0.5"
      role="tablist"
      aria-label="Filter by time window"
    >
      {RANGES.map((r) => {
        const isActive = r.key === active
        const href =
          r.key === 'today'
            ? `/org/${orgId}/shifts`
            : `/org/${orgId}/shifts?range=${r.key}`
        return (
          <Link
            key={r.key}
            href={href}
            role="tab"
            aria-selected={isActive}
            className={`px-3 py-1 text-[12px] font-medium rounded-md transition ${
              isActive
                ? 'bg-white text-slate-900 shadow-sm border border-slate-200'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            {r.label}
          </Link>
        )
      })}
    </div>
  )
}

function ShiftRow({
  shift: s,
  user: u,
}: {
  shift: typeof schema.shifts.$inferSelect
  user: typeof schema.users.$inferSelect
}) {
  const start = s.punchedInAt
  const end = s.punchedOutAt!
  const mins = Math.max(0, Math.round((end.getTime() - start.getTime()) / 60000))
  const h = Math.floor(mins / 60)
  const m = mins % 60
  const pill =
    s.verificationStatus === 'verified'
      ? 'pill-good'
      : s.verificationStatus === 'suspect'
        ? 'pill-bad'
        : s.verificationStatus === 'skipped'
          ? 'pill-slate'
          : 'pill-warn'
  return (
    <li className="px-5 py-4">
      <div className="flex items-start gap-3">
        <CharacterAvatar characterKey={u.characterKey} size={32} />
        <div className="flex-1 min-w-0">
          <div className="flex items-baseline gap-2 flex-wrap">
            <p className="text-[13.5px] font-medium text-slate-900">{u.name ?? `@${u.login}`}</p>
            <span className="text-[12px] text-slate-500">
              {start.toLocaleString(undefined, {
                weekday: 'short',
                day: 'numeric',
                month: 'short',
                hour: 'numeric',
                minute: '2-digit',
              })}
              {' → '}
              {end.toLocaleString(undefined, { hour: 'numeric', minute: '2-digit' })}
              {' · '}
              {h > 0 ? `${h}h ${m}m` : `${m}m`}
            </span>
            <span className={`pill ${pill}`}>
              {s.verificationStatus}
              {s.verificationScore !== null ? ` · ${s.verificationScore}/100` : ''}
            </span>
          </div>
          {s.workSummary && (
            <p className="mt-2 text-[12.5px] text-slate-700 leading-snug whitespace-pre-line">
              <span className="font-medium text-slate-900">Summary:</span> {s.workSummary}
            </p>
          )}
          {s.verificationNotes && (
            <p className="mt-1.5 text-[11.5px] text-slate-500 leading-snug">
              <span className="font-medium">AI note:</span> {s.verificationNotes}
            </p>
          )}
        </div>
      </div>
    </li>
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
