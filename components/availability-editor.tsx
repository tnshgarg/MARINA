'use client'

import { useMemo, useState } from 'react'

/**
 * Set your booking availability — the days + hours you take meetings, the slot
 * length, and your timezone. Drives the real open slots shown on your public
 * /book link (Calendly-style). Saved via PATCH /api/me/availability.
 */

const DAY_LABELS: Array<{ d: number; label: string }> = [
  { d: 1, label: 'Mon' },
  { d: 2, label: 'Tue' },
  { d: 3, label: 'Wed' },
  { d: 4, label: 'Thu' },
  { d: 5, label: 'Fri' },
  { d: 6, label: 'Sat' },
  { d: 0, label: 'Sun' },
]

function minToHHMM(min: number): string {
  const h = Math.floor(min / 60)
  const m = min % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}
function hhmmToMin(s: string): number {
  const [h, m] = s.split(':').map(Number)
  return (h || 0) * 60 + (m || 0)
}

export function AvailabilityEditor({
  initial,
}: {
  initial: { workDays: number[]; startMin: number; endMin: number; slotMin: number; timezone: string }
}) {
  const [workDays, setWorkDays] = useState<number[]>(initial.workDays)
  const [start, setStart] = useState(minToHHMM(initial.startMin))
  const [end, setEnd] = useState(minToHHMM(initial.endMin))
  const [slot, setSlot] = useState(initial.slotMin)
  const [tz, setTz] = useState(initial.timezone)
  const [busy, setBusy] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const browserTz = useMemo(() => {
    try {
      return Intl.DateTimeFormat().resolvedOptions().timeZone
    } catch {
      return ''
    }
  }, [])

  const tzOptions = useMemo(() => {
    const common = [
      'Asia/Kolkata',
      'Asia/Dubai',
      'Asia/Singapore',
      'Europe/London',
      'Europe/Berlin',
      'America/New_York',
      'America/Chicago',
      'America/Los_Angeles',
      'Australia/Sydney',
      'UTC',
    ]
    const set = new Set<string>()
    if (browserTz) set.add(browserTz)
    set.add(tz)
    for (const c of common) set.add(c)
    return [...set]
  }, [browserTz, tz])

  function toggleDay(d: number) {
    setWorkDays((prev) => (prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d].sort((a, b) => a - b)))
  }

  async function save() {
    const startMin = hhmmToMin(start)
    const endMin = hhmmToMin(end)
    if (!workDays.length) {
      setError('Pick at least one working day.')
      return
    }
    if (startMin >= endMin) {
      setError('Start time must be before end time.')
      return
    }
    setBusy(true)
    setError(null)
    setSaved(false)
    try {
      const res = await fetch('/api/me/availability', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workDays, startMin, endMin, slotMin: slot, timezone: tz }),
      })
      if (!res.ok) {
        const d = await res.json().catch(() => ({}))
        throw new Error(d?.error ?? 'failed')
      }
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    } catch (e) {
      setError(String(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-4">
      {/* Working days */}
      <div>
        <p className="text-[12px] font-medium text-[var(--m-ink-2)] mb-1.5">Working days</p>
        <div className="flex flex-wrap gap-1.5">
          {DAY_LABELS.map(({ d, label }) => {
            const on = workDays.includes(d)
            return (
              <button
                key={d}
                type="button"
                onClick={() => toggleDay(d)}
                aria-pressed={on}
                className={`px-3 py-1.5 rounded-lg border text-[12.5px] font-medium transition-colors ${
                  on
                    ? 'border-[var(--m-accent)] bg-[var(--m-accent-soft)] text-[var(--m-accent-2)]'
                    : 'border-[var(--m-border)] text-[var(--m-ink-3)] hover:border-[var(--m-accent)]'
                }`}
              >
                {label}
              </button>
            )
          })}
        </div>
      </div>

      {/* Hours + slot */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <label className="block">
          <span className="block text-[12px] font-medium text-[var(--m-ink-2)] mb-1">From</span>
          <input type="time" value={start} onChange={(e) => setStart(e.target.value)} className="input" disabled={busy} />
        </label>
        <label className="block">
          <span className="block text-[12px] font-medium text-[var(--m-ink-2)] mb-1">To</span>
          <input type="time" value={end} onChange={(e) => setEnd(e.target.value)} className="input" disabled={busy} />
        </label>
        <label className="block">
          <span className="block text-[12px] font-medium text-[var(--m-ink-2)] mb-1">Slot length</span>
          <select value={slot} onChange={(e) => setSlot(Number(e.target.value))} className="select" disabled={busy}>
            <option value={15}>15 min</option>
            <option value={30}>30 min</option>
            <option value={45}>45 min</option>
            <option value={60}>60 min</option>
          </select>
        </label>
      </div>

      {/* Timezone */}
      <label className="block max-w-xs">
        <span className="block text-[12px] font-medium text-[var(--m-ink-2)] mb-1">Timezone</span>
        <select value={tz} onChange={(e) => setTz(e.target.value)} className="select" disabled={busy}>
          {tzOptions.map((z) => (
            <option key={z} value={z}>
              {z.replace(/_/g, ' ')}
              {z === browserTz ? ' (detected)' : ''}
            </option>
          ))}
        </select>
      </label>

      <div className="flex items-center gap-3 pt-1">
        <button type="button" onClick={save} disabled={busy} className="btn-sage text-[13px] disabled:opacity-50">
          {busy ? 'Saving…' : saved ? 'Saved ✓' : 'Save availability'}
        </button>
        {error && <span className="text-[12px] text-[var(--m-bad)]">{error}</span>}
      </div>
    </div>
  )
}
