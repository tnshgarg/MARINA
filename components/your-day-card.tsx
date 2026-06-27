'use client'

import { useEffect, useState } from 'react'

type Snapshot = {
  punchedIn: boolean
  shiftStartedAt: string | null
  productivity: number       // 0-100, focus/total since shift start
  focusMinutes: number
  totalShiftMinutes: number
  deliverablesToday: number
  meetingsRemainingToday: number
  nextMeetingAt: string | null
  nextMeetingTitle: string | null
  activeBreak: { reason: string; minutesAgo: number } | null
  /** Latest narrative bullet/headline — fallback if no other signal. */
  narrative: string | null
}

/**
 * Real-time "Your day" card for the personal dashboard.
 *
 * Replaces the static AI story (which was stale by mid-day and read like
 * "you know this already"). This card answers the only question the
 * employee cares about while logged in:
 *
 *   "Am I having a good day, what's left, and what's one thing I should do?"
 *
 * Updates every 30s. Designed to fit in a single row above the fold.
 */
export function YourDayCard() {
  const [snap, setSnap] = useState<Snapshot | null>(null)
  const [loading, setLoading] = useState(true)
  const [tick, setTick] = useState(0)

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      try {
        const res = await fetch('/api/me/day-snapshot')
        if (!res.ok) return
        const data = await res.json()
        if (!cancelled) setSnap(data as Snapshot)
      } catch {
        // ignore
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    const id = setInterval(() => {
      setTick((t) => t + 1)
      void load()
    }, 30_000)
    return () => {
      cancelled = true
      clearInterval(id)
    }
  }, [])

  if (loading || !snap) {
    return (
      <section className="app-card app-card-lg">
        <p className="text-[13px] text-[var(--m-ink-3)]">Loading your day…</p>
      </section>
    )
  }

  if (!snap.punchedIn) {
    return (
      <section className="app-card app-card-lg flex items-center justify-between gap-3 flex-wrap">
        <div>
          <p className="app-eyebrow">Off-clock</p>
          <p className="app-h2 mt-1">Ready when you are</p>
          <p className="app-sub mt-1">Punch in to start your day.</p>
        </div>
      </section>
    )
  }

  const headline =
    snap.activeBreak
      ? `On a break — ${snap.activeBreak.reason}`
      : snap.productivity >= 65
      ? `You're on a roll today`
      : snap.productivity >= 45
      ? `Steady day so far`
      : `Choppy day — let's reset`

  const next =
    snap.activeBreak
      ? `Wrap the break when ready · ${humanMin(snap.activeBreak.minutesAgo)} so far`
      : snap.nextMeetingAt
      ? `Next: ${snap.nextMeetingTitle} at ${fmtClock(snap.nextMeetingAt)}`
      : snap.meetingsRemainingToday === 0
      ? `No more meetings today — protect this focus block`
      : `${snap.meetingsRemainingToday} more meeting${snap.meetingsRemainingToday === 1 ? '' : 's'} today`

  return (
    <section
      className="app-card app-card-lg"
      key={tick}  // re-mount on each tick for the subtle fade
    >
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
        <div className="min-w-0 sm:flex-1">
          <p className="app-eyebrow">Your day</p>
          <p className="text-[20px] leading-tight font-semibold tracking-tight text-[var(--m-ink)] mt-1.5">{headline}</p>
          <p className="app-sub mt-1">{next}</p>
        </div>

        {/* Three live KPI tiles — a 3-col grid on mobile, an inline row on desktop */}
        <div className="grid grid-cols-3 gap-2 sm:flex sm:items-stretch sm:shrink-0">
          <KpiTile
            value={`${snap.productivity}%`}
            label="productive"
            tone={
              snap.productivity >= 65 ? 'good' :
              snap.productivity >= 45 ? 'warn' :
              'bad'
            }
          />
          <KpiTile
            value={String(snap.deliverablesToday)}
            label={`shipped today`}
            tone="accent"
          />
          <KpiTile
            value={String(snap.meetingsRemainingToday)}
            label="meetings left"
            tone="info"
          />
        </div>
      </div>

      {/* Focus bar — visual reinforcement of the % */}
      <div className="mt-3 h-1.5 rounded-full bg-[var(--m-bg-soft)] overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-700"
          style={{
            width: `${snap.productivity}%`,
            background:
              snap.productivity >= 65 ? 'var(--m-good)' :
              snap.productivity >= 45 ? 'var(--m-warn)' :
              'var(--m-bad)',
          }}
        />
      </div>

      <p className="mt-1.5 text-[11px] text-[var(--m-ink-3)] tabular-nums">
        {humanMin(snap.focusMinutes)} focused of {humanMin(snap.totalShiftMinutes)} logged
      </p>
    </section>
  )
}

function KpiTile({
  value,
  label,
  tone,
}: {
  value: string
  label: string
  tone: 'good' | 'warn' | 'bad' | 'accent' | 'info'
}) {
  const fg =
    tone === 'good' ? 'text-[var(--m-good)]' :
    tone === 'warn' ? 'text-[var(--m-warn)]' :
    tone === 'bad'  ? 'text-[var(--m-bad)]' :
    tone === 'accent' ? 'text-[var(--m-accent)]' :
    'text-[var(--m-info)]'
  return (
    <div className="min-w-0 sm:min-w-[88px] rounded-lg border border-[var(--m-border)] bg-white px-2.5 sm:px-3 py-2 text-center sm:text-right">
      <p className={`text-[18px] sm:text-[20px] font-semibold tabular-nums tracking-tight ${fg}`}>{value}</p>
      <p className="text-[10.5px] text-[var(--m-ink-3)] mt-0.5 truncate">{label}</p>
    </div>
  )
}

function humanMin(min: number): string {
  if (min < 60) return `${min}m`
  const h = Math.floor(min / 60)
  const m = min % 60
  return m === 0 ? `${h}h` : `${h}h ${m}m`
}
function fmtClock(iso: string): string {
  return new Date(iso).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
}
