'use client'

import { useState } from 'react'
import type { DaySlots } from '@/lib/booking/availability'

/**
 * The public request flow on /book/<handle>. No account needed.
 *
 * Calendly-style: when the host has set their availability, we show real open
 * slots (day picker → time grid). Picking a time reveals the short contact form.
 * If the host has no generated slots (none configured, or fully booked), we fall
 * back to "propose any time" so the link is never a dead end.
 */
export function BookingForm({
  handle,
  hostName,
  days,
  timezone,
  slotMin,
}: {
  handle: string
  hostName: string
  days: DaySlots[]
  timezone: string
  slotMin: number
}) {
  const [dayIdx, setDayIdx] = useState(0)
  const [slotIso, setSlotIso] = useState<string | null>(null)
  const [slotLabel, setSlotLabel] = useState('')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [note, setNote] = useState('')
  const [freeTime, setFreeTime] = useState('')
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const hasSlots = days.length > 0
  const day = days[Math.min(dayIdx, days.length - 1)]

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    const proposedAt = slotIso ?? (freeTime ? new Date(freeTime).toISOString() : '')
    if (!proposedAt) {
      setError('Pick a time first.')
      return
    }
    setBusy(true)
    setError(null)
    try {
      const res = await fetch(`/api/book/${encodeURIComponent(handle)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, proposedAt, note }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data?.error ?? 'failed')
      setDone(true)
    } catch (e) {
      setError(String(e))
    } finally {
      setBusy(false)
    }
  }

  if (done) {
    return (
      <div className="rounded-2xl border border-[var(--m-good)]/25 bg-[var(--m-good-soft)]/40 p-6 text-center">
        <p className="font-display text-[20px] text-[var(--m-ink)]">Request sent 🎉</p>
        <p className="text-[13.5px] text-[var(--m-ink-2)] mt-1.5">
          {slotLabel ? (
            <>
              You asked for <span className="font-semibold text-[var(--m-ink)]">{slotLabel}</span>.{' '}
            </>
          ) : null}
          {hostName} will confirm at {email}.
        </p>
      </div>
    )
  }

  const showDetails = !!slotIso || (!hasSlots && !!freeTime)

  return (
    <div className="rounded-2xl border border-[var(--m-border)] bg-white p-5 shadow-[var(--m-shadow-sm)]">
      {hasSlots ? (
        <>
          <div className="flex items-baseline justify-between gap-2">
            <p className="app-eyebrow">Pick a time</p>
            <p className="text-[11.5px] text-[var(--m-ink-4)]">{slotMin} min</p>
          </div>
          <p className="text-[12px] text-[var(--m-ink-3)] mt-0.5 mb-3">Times shown in {timezone.replace(/_/g, ' ')}</p>

          {/* Day picker */}
          <div className="flex gap-1.5 overflow-x-auto pb-2 -mx-1 px-1 scrollbar-thin">
            {days.map((d, i) => (
              <button
                key={i}
                type="button"
                onClick={() => {
                  setDayIdx(i)
                  setSlotIso(null)
                }}
                className={`shrink-0 w-[68px] px-2 py-1.5 rounded-lg border text-center transition-colors ${
                  i === Math.min(dayIdx, days.length - 1)
                    ? 'border-[var(--m-accent)] bg-[var(--m-accent-soft)] text-[var(--m-accent-2)]'
                    : 'border-[var(--m-border)] text-[var(--m-ink-2)] hover:border-[var(--m-accent)]'
                }`}
              >
                <span className="block text-[10.5px] uppercase tracking-wide">{d.weekday}</span>
                <span className="block text-[13px] font-semibold">{d.dayLabel}</span>
              </button>
            ))}
          </div>

          {/* Slots for the selected day */}
          <div className="mt-3 grid grid-cols-3 sm:grid-cols-4 gap-1.5">
            {day.slots.map((s) => (
              <button
                key={s.iso}
                type="button"
                onClick={() => {
                  setSlotIso(s.iso)
                  setSlotLabel(`${day.weekday} ${day.dayLabel}, ${s.label}`)
                  setError(null)
                }}
                className={`px-2 py-1.5 rounded-lg border text-[12.5px] font-medium transition-colors ${
                  slotIso === s.iso
                    ? 'border-[var(--m-accent)] bg-[var(--m-accent)] text-white'
                    : 'border-[var(--m-border)] text-[var(--m-ink-2)] hover:border-[var(--m-accent)] hover:text-[var(--m-accent)]'
                }`}
              >
                {s.label}
              </button>
            ))}
          </div>
        </>
      ) : (
        <>
          <p className="app-eyebrow">Request a time</p>
          <p className="text-[12px] text-[var(--m-ink-3)] mt-0.5 mb-3">
            {hostName.split(' ')[0]} hasn&rsquo;t set fixed hours — propose any time and they&rsquo;ll confirm.
          </p>
          <input
            type="datetime-local"
            value={freeTime}
            onChange={(e) => setFreeTime(e.target.value)}
            className="input"
            disabled={busy}
          />
        </>
      )}

      {showDetails && (
        <form onSubmit={submit} className="mt-4 pt-4 border-t border-[var(--m-border-soft)] space-y-3">
          {slotIso && (
            <p className="text-[13px] text-[var(--m-ink)]">
              Selected: <span className="font-semibold">{slotLabel}</span>
            </p>
          )}
          <Field label="Your name">
            <input required value={name} onChange={(e) => setName(e.target.value)} className="input" placeholder="Alex Rivera" disabled={busy} />
          </Field>
          <Field label="Your email">
            <input required type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="input" placeholder="alex@company.com" disabled={busy} />
          </Field>
          <Field label="What's it about? (optional)">
            <textarea value={note} onChange={(e) => setNote(e.target.value)} className="textarea" placeholder="A quick intro / what you'd like to discuss" disabled={busy} />
          </Field>
          {error && <p className="text-[12px] text-[var(--m-bad)]">Couldn&apos;t send — {error}</p>}
          <button type="submit" disabled={busy} className="btn-primary w-full justify-center disabled:opacity-60">
            {busy ? 'Sending…' : 'Request this time'}
          </button>
        </form>
      )}
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-[12px] font-medium text-[var(--m-ink-2)] mb-1">{label}</span>
      {children}
    </label>
  )
}
