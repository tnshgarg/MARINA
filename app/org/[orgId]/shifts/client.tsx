'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { CharacterAvatar } from '@/components/character-avatar'

export type RangeKey = 'today' | '7d' | '30d' | 'all'

export const RANGES: Array<{ key: RangeKey; label: string; days: number | null }> = [
  { key: 'today', label: 'Today', days: 1 },
  { key: '7d', label: '7 days', days: 7 },
  { key: '30d', label: '30 days', days: 30 },
  { key: 'all', label: 'All', days: null },
]

// Mirrors lib/db/schema.ts `ShiftVerificationStatus` plus a defensive 'pending'
// fallback so an unexpected value still renders a sane pill rather than crashing.
type VerificationStatus = 'unverified' | 'verified' | 'suspect' | 'skipped' | 'pending'

export type ShiftDTO = {
  id: number
  userId: number
  userName: string | null
  userLogin: string
  characterKey: string | null
  punchedInAt: string // ISO
  punchedOutAt: string | null // ISO, null = still on the clock
  workSummary: string | null
  verificationStatus: VerificationStatus
  verificationScore: number | null
  verificationNotes: string | null
  punchedInVia: string
}

type EmployeeGroup = {
  userId: number
  name: string | null
  login: string
  characterKey: string | null
  shifts: ShiftDTO[] // all shifts in range, newest first
  completed: ShiftDTO[] // shifts with a punch-out, newest first
  shiftCount: number
  totalMins: number // summed duration of completed shifts
  avgMins: number // mean duration of completed shifts
  mostRecentAt: string // ISO of newest shift start
  verifiedCount: number
  suspectCount: number
}

// ---------- formatting helpers ----------

function fmtDuration(mins: number): string {
  const m = Math.max(0, Math.round(mins))
  const h = Math.floor(m / 60)
  const rem = m % 60
  if (h > 0 && rem > 0) return `${h}h ${rem}m`
  if (h > 0) return `${h}h`
  return `${rem}m`
}

function durationMins(start: string, end: string): number {
  return Math.max(0, Math.round((new Date(end).getTime() - new Date(start).getTime()) / 60000))
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

function liveDuration(start: string): string {
  return fmtDuration(durationMins(start, new Date().toISOString()))
}

function pillFor(status: VerificationStatus): string {
  switch (status) {
    case 'verified':
      return 'pill-good'
    case 'suspect':
      return 'pill-bad'
    case 'skipped':
      return 'pill-slate'
    default:
      return 'pill-warn' // unverified / pending
  }
}

// ---------- grouping ----------

function groupByEmployee(shifts: ShiftDTO[]): EmployeeGroup[] {
  const map = new Map<number, EmployeeGroup>()
  for (const s of shifts) {
    let g = map.get(s.userId)
    if (!g) {
      g = {
        userId: s.userId,
        name: s.userName,
        login: s.userLogin,
        characterKey: s.characterKey,
        shifts: [],
        completed: [],
        shiftCount: 0,
        totalMins: 0,
        avgMins: 0,
        mostRecentAt: s.punchedInAt,
        verifiedCount: 0,
        suspectCount: 0,
      }
      map.set(s.userId, g)
    }
    g.shifts.push(s)
    g.shiftCount += 1
    if (new Date(s.punchedInAt).getTime() > new Date(g.mostRecentAt).getTime()) {
      g.mostRecentAt = s.punchedInAt
    }
    if (s.punchedOutAt) {
      g.completed.push(s)
      g.totalMins += durationMins(s.punchedInAt, s.punchedOutAt)
    }
    if (s.verificationStatus === 'verified') g.verifiedCount += 1
    if (s.verificationStatus === 'suspect') g.suspectCount += 1
  }

  const groups = Array.from(map.values())
  for (const g of groups) {
    // Server already returns newest-first; keep that ordering within each group.
    g.shifts.sort((a, b) => new Date(b.punchedInAt).getTime() - new Date(a.punchedInAt).getTime())
    g.completed.sort((a, b) => new Date(b.punchedInAt).getTime() - new Date(a.punchedInAt).getTime())
    g.avgMins = g.completed.length ? Math.round(g.totalMins / g.completed.length) : 0
  }
  // Most active first.
  groups.sort((a, b) => b.totalMins - a.totalMins || b.shiftCount - a.shiftCount)
  return groups
}

function verificationSummary(g: EmployeeGroup): string {
  const parts: string[] = []
  if (g.verifiedCount) parts.push(`${g.verifiedCount} verified`)
  if (g.suspectCount) parts.push(`${g.suspectCount} suspect`)
  return parts.join(' · ')
}

// ---------- top-level component ----------

export default function ShiftsClient({
  orgId,
  range,
  shifts,
}: {
  orgId: number
  range: RangeKey
  shifts: ShiftDTO[]
}) {
  const groups = useMemo(() => groupByEmployee(shifts), [shifts])

  // Genuinely active shifts (no punch-out), newest in first.
  const active = useMemo(
    () =>
      shifts
        .filter((s) => s.punchedOutAt == null)
        .sort((a, b) => new Date(a.punchedInAt).getTime() - new Date(b.punchedInAt).getTime()),
    [shifts],
  )

  const totals = useMemo(() => {
    const totalMins = groups.reduce((acc, g) => acc + g.totalMins, 0)
    const scored = shifts.filter((s) => s.verificationScore != null)
    const avgScore = scored.length
      ? Math.round(scored.reduce((acc, s) => acc + (s.verificationScore ?? 0), 0) / scored.length)
      : null
    return {
      employees: groups.length,
      shiftCount: shifts.length,
      totalMins,
      avgScore,
    }
  }, [groups, shifts])

  const rangeLabel = RANGES.find((r) => r.key === range)!.label

  return (
    <>
      <div className="mb-4 flex items-end justify-between gap-3 flex-wrap">
        <div>
          <h1 className="app-h1">People</h1>
          <p className="mt-1.5 text-[13px] text-[color:var(--m-ink-3)]">
            Punch-in / punch-out history with AI-verified work summaries, grouped by person.
          </p>
        </div>
        <RangeChips orgId={orgId} active={range} />
      </div>

      {/* Org-wide summary strip */}
      <div className="grid gap-3 grid-cols-2 lg:grid-cols-4 items-stretch mb-6">
        <div className="app-card app-card-tight h-full">
          <div className="stat-num tabular-nums">{totals.employees}</div>
          <div className="stat-label">People with shifts</div>
          <div className="stat-sub">{rangeLabel.toLowerCase() === 'all' ? 'All time' : rangeLabel}</div>
        </div>
        <div className="app-card app-card-tight h-full">
          <div className="stat-num tabular-nums">{totals.shiftCount}</div>
          <div className="stat-label">Total shifts</div>
          <div className="stat-sub">{active.length} still open</div>
        </div>
        <div className="app-card app-card-tight h-full">
          <div className="stat-num tabular-nums">{fmtDuration(totals.totalMins)}</div>
          <div className="stat-label">Hours worked</div>
          <div className="stat-sub">Completed shifts only</div>
        </div>
        <div className="app-card app-card-tight h-full">
          <div className="stat-num tabular-nums">
            {totals.avgScore != null ? `${totals.avgScore}` : '—'}
            {totals.avgScore != null && <span className="text-[14px] text-[color:var(--m-ink-4)]">/100</span>}
          </div>
          <div className="stat-label">Avg verification</div>
          <div className="stat-sub">AI confidence score</div>
        </div>
      </div>

      {/* Currently punched in */}
      <section className="app-card app-card-lg hover-lift mb-6">
        <div className="section-title-row">
          <h2 className="app-h2">Currently punched in</h2>
          <span className="pill pill-good">{active.length} working now</span>
        </div>
        {active.length === 0 ? (
          <p className="mt-3 app-sub">Nobody&apos;s on the clock right now.</p>
        ) : (
          <ul className="mt-4 space-y-2">
            {active.map((s) => (
              <li
                key={s.id}
                className="flex items-center gap-3 rounded-xl border border-emerald-100 bg-emerald-50/60 p-3"
              >
                <CharacterAvatar characterKey={s.characterKey} name={s.userName} login={s.userLogin} size={32} />
                <div className="flex-1 min-w-0">
                  <p className="text-[13.5px] font-medium text-[color:var(--m-ink)] truncate">
                    {s.userName ?? `@${s.userLogin}`}
                  </p>
                  <p className="text-[11.5px] text-[color:var(--m-ink-3)]">
                    On the clock for {liveDuration(s.punchedInAt)} · since {timeAgo(s.punchedInAt)} · via {s.punchedInVia}
                  </p>
                </div>
                <span className="pill pill-good shrink-0">Live</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Grouped-by-employee list */}
      <section className="app-card hover-lift">
        <div className="px-5 py-4 border-b border-[color:var(--m-border)] flex items-baseline justify-between gap-3 flex-wrap">
          <div>
            <h2 className="app-h2">By person</h2>
            <p className="text-[12px] text-[color:var(--m-ink-4)] mt-0.5">
              {rangeLabel} · {groups.length} {groups.length === 1 ? 'person' : 'people'} · sorted by hours worked
            </p>
          </div>
        </div>

        {groups.length === 0 ? (
          <div className="p-12 text-center">
            <p className="text-[13px] text-[color:var(--m-ink-3)]">No shifts logged in this window.</p>
            {range !== 'all' && (
              <Link
                href={`/org/${orgId}/shifts?range=all`}
                className="mt-3 inline-block text-[12.5px] text-[var(--m-accent)] hover:text-[var(--m-accent-2)]"
              >
                See all time →
              </Link>
            )}
          </div>
        ) : (
          <ul className="divide-y divide-[color:var(--m-border-soft)]">
            {groups.map((g) => (
              <EmployeeRow key={g.userId} group={g} />
            ))}
          </ul>
        )}
      </section>
    </>
  )
}

// ---------- employee accordion row ----------

function EmployeeRow({ group: g }: { group: EmployeeGroup }) {
  const [open, setOpen] = useState(false)
  const verSummary = verificationSummary(g)

  return (
    <li>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="w-full flex items-center gap-3 px-5 py-4 text-left transition-colors hover:bg-[color:var(--m-bg-soft)]"
      >
        <CharacterAvatar characterKey={g.characterKey} name={g.name} login={g.login} size={36} />
        <div className="flex-1 min-w-0">
          <div className="flex items-baseline gap-2 flex-wrap">
            <p className="text-[14px] font-medium text-[color:var(--m-ink)] truncate">
              {g.name ?? `@${g.login}`}
            </p>
            {verSummary && <span className="text-[11.5px] text-[color:var(--m-ink-4)]">{verSummary}</span>}
          </div>
          <p className="text-[12px] text-[color:var(--m-ink-3)] mt-0.5">
            {g.shiftCount} {g.shiftCount === 1 ? 'shift' : 'shifts'} ·{' '}
            <span className="tabular-nums">{fmtDuration(g.totalMins)}</span> total ·{' '}
            avg <span className="tabular-nums">{g.avgMins ? fmtDuration(g.avgMins) : '—'}</span> · last{' '}
            {timeAgo(g.mostRecentAt)}
          </p>
        </div>
        <svg
          width="16"
          height="16"
          viewBox="0 0 16 16"
          fill="none"
          aria-hidden="true"
          className={`shrink-0 text-[color:var(--m-ink-4)] transition-transform ${open ? 'rotate-180' : ''}`}
        >
          <path d="M4 6l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {open && (
        <div className="px-5 pb-4 pt-0">
          <ul className="space-y-2 border-l-2 border-[color:var(--m-border)] pl-4 ml-1">
            {g.shifts.map((s) => (
              <ShiftDetail key={s.id} shift={s} />
            ))}
          </ul>
        </div>
      )}
    </li>
  )
}

// ---------- individual shift detail ----------

function ShiftDetail({ shift: s }: { shift: ShiftDTO }) {
  const [notesOpen, setNotesOpen] = useState(false)
  const start = new Date(s.punchedInAt)
  const isActive = s.punchedOutAt == null
  const mins = isActive ? durationMins(s.punchedInAt, new Date().toISOString()) : durationMins(s.punchedInAt, s.punchedOutAt!)

  const dateLabel = start.toLocaleDateString(undefined, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  })
  const startTime = start.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
  const endTime = isActive
    ? 'now'
    : new Date(s.punchedOutAt!).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })

  return (
    <li className="rounded-xl border border-[color:var(--m-border)] bg-white px-4 py-3">
      <div className="flex items-baseline gap-2 flex-wrap">
        <span className="text-[12.5px] font-medium text-[color:var(--m-ink)]">{dateLabel}</span>
        <span className="text-[12px] text-[color:var(--m-ink-3)] tabular-nums">
          {startTime} → {endTime} · {fmtDuration(mins)}
        </span>
        {isActive ? (
          <span className="pill pill-good">on the clock</span>
        ) : (
          <span className={`pill ${pillFor(s.verificationStatus)}`}>
            {s.verificationStatus}
            {s.verificationScore != null ? ` · ${s.verificationScore}/100` : ''}
          </span>
        )}
      </div>

      {s.workSummary && (
        <p className="mt-2 text-[12.5px] text-[color:var(--m-ink-2)] leading-snug whitespace-pre-line">
          <span className="font-medium text-[color:var(--m-ink)]">Summary:</span> {s.workSummary}
        </p>
      )}

      {s.verificationNotes && (
        <div className="mt-1.5">
          <button
            type="button"
            onClick={() => setNotesOpen((v) => !v)}
            aria-expanded={notesOpen}
            className="text-[11.5px] font-medium text-[var(--m-accent)] hover:text-[var(--m-accent-2)]"
          >
            {notesOpen ? 'Hide AI verification notes' : 'Show AI verification notes'}
          </button>
          {notesOpen && (
            <p className="mt-1 text-[11.5px] text-[color:var(--m-ink-3)] leading-snug">{s.verificationNotes}</p>
          )}
        </div>
      )}
    </li>
  )
}

// ---------- range filter (server-side via Link) ----------

function RangeChips({ orgId, active }: { orgId: number; active: RangeKey }) {
  return (
    <div
      className="inline-flex rounded-lg border border-[color:var(--m-border)] bg-[color:var(--m-bg-soft)] p-0.5"
      role="tablist"
      aria-label="Filter by time window"
    >
      {RANGES.map((r) => {
        const isActive = r.key === active
        const href = r.key === 'today' ? `/org/${orgId}/shifts` : `/org/${orgId}/shifts?range=${r.key}`
        return (
          <Link
            key={r.key}
            href={href}
            role="tab"
            aria-selected={isActive}
            className={`px-3 py-1 text-[12px] font-medium rounded-md transition ${
              isActive
                ? 'bg-white text-[color:var(--m-ink)] shadow-sm border border-[color:var(--m-border)]'
                : 'text-[color:var(--m-ink-3)] hover:text-[color:var(--m-ink)]'
            }`}
          >
            {r.label}
          </Link>
        )
      })}
    </div>
  )
}
