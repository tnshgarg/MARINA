'use client'

import { useState } from 'react'

export type Contact = { name: string; email: string; count?: number; secondary?: boolean }

/** Your people — accumulated from meetings + same-domain colleagues — each
 *  bookable in two clicks (creates a Google event + emails them the invite). */
export function Contacts({ items, domain }: { items: Contact[]; domain: string }) {
  const primary = items.filter((c) => !c.secondary)
  const secondary = items.filter((c) => c.secondary)
  return (
    <section className="app-card app-card-lg">
      <p className="app-eyebrow">People</p>
      <h2 className="app-h2 mt-0.5 mb-3">Your contacts</h2>
      {primary.length > 0 && (
        <ul className="space-y-1">{primary.map((c, i) => <ContactRow key={`p${i}`} c={c} />)}</ul>
      )}
      {secondary.length > 0 && (
        <div className={primary.length > 0 ? 'mt-3 pt-3 border-t border-[var(--m-border-soft)]' : ''}>
          <p className="text-[11px] uppercase tracking-wider text-[var(--m-ink-4)] font-semibold mb-1.5">From {domain}</p>
          <ul className="space-y-1">{secondary.map((c, i) => <ContactRow key={`s${i}`} c={c} />)}</ul>
        </div>
      )}
    </section>
  )
}

function ContactRow({ c }: { c: Contact }) {
  const [open, setOpen] = useState(false)
  const [when, setWhen] = useState('')
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<{ ok: boolean; url?: string | null; error?: string } | null>(null)

  async function book() {
    if (!when) return
    setBusy(true)
    try {
      const res = await fetch('/api/me/meetings/quick', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: c.email, name: c.name, when: new Date(when).toISOString() }),
      })
      const data = await res.json()
      setResult(res.ok ? { ok: true, url: data.meetingUrl } : { ok: false, error: data.error })
      if (res.ok) setOpen(false)
    } catch {
      setResult({ ok: false, error: 'error' })
    } finally {
      setBusy(false)
    }
  }

  return (
    <li className="py-0.5">
      <div className="flex items-center gap-2.5 text-[13px]">
        <span className={`shrink-0 w-7 h-7 rounded-full inline-flex items-center justify-center text-[11px] font-semibold uppercase ${c.secondary ? 'bg-[var(--m-bg-soft)] text-[var(--m-ink-3)]' : 'bg-[var(--m-accent-soft)] text-[var(--m-accent-2)]'}`}>
          {c.name.slice(0, 2)}
        </span>
        <span className="text-[var(--m-ink)] flex-1 truncate capitalize">{c.name}</span>
        {c.count ? <span className="text-[11px] text-[var(--m-ink-4)] shrink-0">{c.count}&times;</span> : null}
        <button
          type="button"
          onClick={() => { setOpen((o) => !o); setResult(null) }}
          className="shrink-0 text-[11.5px] px-2 py-0.5 rounded-md border border-[var(--m-border)] text-[var(--m-ink-2)] hover:border-[var(--m-accent)] hover:text-[var(--m-accent)] transition-colors"
        >
          {open ? 'Cancel' : 'Book'}
        </button>
      </div>

      {open && (
        <div className="mt-1.5 flex items-center gap-1.5 pl-[38px]">
          <input
            type="datetime-local"
            value={when}
            onChange={(e) => setWhen(e.target.value)}
            className="input flex-1 min-w-0 !py-1 text-[12px]"
            disabled={busy}
          />
          <button type="button" onClick={book} disabled={busy || !when} className="btn-sage text-[11.5px] shrink-0 disabled:opacity-50">
            {busy ? '…' : 'Send invite'}
          </button>
        </div>
      )}

      {result && (
        <div className="mt-1 pl-[38px] text-[11.5px]">
          {result.ok ? (
            <span className="text-[var(--m-good)]">
              Invite sent ✓{' '}
              {result.url && <a href={result.url} target="_blank" rel="noreferrer" className="text-[var(--m-accent-2)] underline ml-1">Join</a>}
            </span>
          ) : result.error === 'no_calendar' ? (
            <span className="text-[var(--m-ink-3)]">Connect Google Calendar (Settings) to send invites.</span>
          ) : (
            <span className="text-[var(--m-bad)]">Couldn&apos;t book — try again.</span>
          )}
        </div>
      )}
    </li>
  )
}
