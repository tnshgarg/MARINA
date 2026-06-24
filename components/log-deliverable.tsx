'use client'

import { useState } from 'react'

type Item = { title: string; url?: string | null }

/**
 * The one-line end-of-day capture: log the work that isn't code (wrote the spec,
 * ran the demo, closed the deal) — with an optional link to the work, which gets
 * included in your generated update. Kept deliberately light.
 */
export function LogDeliverable({ initial }: { initial: Item[] }) {
  const [items, setItems] = useState<Item[]>(initial)
  const [value, setValue] = useState('')
  const [url, setUrl] = useState('')
  const [showLink, setShowLink] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function add(e: React.FormEvent) {
    e.preventDefault()
    const title = value.trim()
    if (!title) return
    const link = url.trim()
    setBusy(true)
    setError(null)
    try {
      const res = await fetch('/api/me/deliverables', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, url: link || undefined }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data?.error ?? 'failed')
      setItems((prev) => [{ title, url: link || null }, ...prev])
      setValue('')
      setUrl('')
      setShowLink(false)
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

      <form onSubmit={add} className="mt-3 space-y-1.5">
        <div className="flex gap-1.5">
          <input
            type="text"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder="e.g. Wrote the launch spec; ran the demo"
            className="input flex-1 min-w-0"
            disabled={busy}
          />
          <button type="submit" disabled={busy || !value.trim()} className="btn-sage text-[13px] shrink-0 disabled:opacity-50">
            {busy ? '…' : 'Log it'}
          </button>
        </div>
        {showLink ? (
          <input
            type="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://link-to-the-work (optional)"
            className="input"
            disabled={busy}
          />
        ) : (
          <button type="button" onClick={() => setShowLink(true)} className="text-[12px] text-[var(--m-accent-2)] hover:underline">
            + add a link
          </button>
        )}
      </form>
      {error && <p className="mt-2 text-[12px] text-[var(--m-bad)]">Couldn&apos;t save — {error}</p>}

      {items.length > 0 && (
        <ul className="mt-3 space-y-1.5">
          {items.map((d, i) => (
            <li key={i} className="flex items-start gap-2 text-[13px] text-[var(--m-ink)] leading-snug">
              <svg width={15} height={15} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} className="mt-0.5 shrink-0 text-[var(--m-good)]">
                <path d="M5 13l4 4 10-10" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              <span className="min-w-0">
                {d.title}
                {d.url ? (
                  <a href={d.url} target="_blank" rel="noreferrer" className="ml-1.5 text-[var(--m-accent-2)] hover:underline break-all">↗ link</a>
                ) : null}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
