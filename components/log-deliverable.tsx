'use client'

import { useState } from 'react'

/**
 * The one-line end-of-day capture: log the work that isn't code (wrote the spec,
 * ran the demo, closed the deal) so the auto-captured day (GitHub + meetings)
 * becomes a complete record. Kept deliberately frictionless — one field.
 */
export function LogDeliverable({ initial }: { initial: Array<{ title: string }> }) {
  const [items, setItems] = useState(initial)
  const [value, setValue] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function add(e: React.FormEvent) {
    e.preventDefault()
    const title = value.trim()
    if (!title) return
    setBusy(true)
    setError(null)
    try {
      const res = await fetch('/api/me/deliverables', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data?.error ?? 'failed')
      setItems((prev) => [{ title }, ...prev])
      setValue('')
    } catch (e) {
      setError(String(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="app-card app-card-lg">
      <p className="app-eyebrow">End of day</p>
      <h2 className="app-h2 mt-0.5">Log what you did</h2>
      <p className="app-sub mt-1">The non-code work — so your report is complete.</p>

      <form onSubmit={add} className="mt-3 flex gap-1.5">
        <input
          type="text"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="e.g. Wrote the launch spec; ran the demo for sales"
          className="flex-1 min-w-0 px-3 py-2 text-[13px] rounded-lg border border-[var(--m-border)] outline-none focus:border-[var(--m-accent)] focus:ring-2 focus:ring-[var(--m-accent)]/15 transition"
          disabled={busy}
        />
        <button type="submit" disabled={busy || !value.trim()} className="btn-sage text-[13px] shrink-0 disabled:opacity-50">
          {busy ? '…' : 'Log it'}
        </button>
      </form>
      {error && <p className="mt-2 text-[12px] text-rose-600">Couldn&apos;t save — {error}</p>}

      {items.length > 0 && (
        <ul className="mt-3 space-y-1.5">
          {items.map((d, i) => (
            <li key={i} className="flex items-start gap-2 text-[13px] text-[var(--m-ink)] leading-snug">
              <svg width={15} height={15} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} className="mt-0.5 shrink-0 text-[var(--m-good)]">
                <path d="M5 13l4 4 10-10" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              {d.title}
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
