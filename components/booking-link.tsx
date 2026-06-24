'use client'

import { useState } from 'react'

type Pending = { id: number; requesterName: string; requesterEmail: string; proposedAt: string; note: string | null }
type Resolved = { status: 'accepted' | 'declined'; meetingUrl: string | null }

/** "Your booking link" — share it, and accept/decline who's requested time. */
export function BookingLink({ url, pending }: { url: string; pending: Pending[] }) {
  const [copied, setCopied] = useState(false)
  const [busyId, setBusyId] = useState<number | null>(null)
  const [resolved, setResolved] = useState<Record<number, Resolved>>({})

  async function copy() {
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
      setTimeout(() => setCopied(false), 1800)
    } catch {
      /* unavailable */
    }
  }

  async function act(id: number, action: 'accept' | 'decline') {
    setBusyId(id)
    try {
      const res = await fetch(`/api/me/bookings/${id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      })
      const data = await res.json()
      if (res.ok) setResolved((r) => ({ ...r, [id]: { status: data.status, meetingUrl: data.meetingUrl ?? null } }))
    } catch {
      /* ignore — row stays actionable */
    } finally {
      setBusyId(null)
    }
  }

  const display = url.replace(/^https?:\/\//, '')
  const stillPending = pending.filter((p) => !resolved[p.id] || resolved[p.id].status === 'accepted')

  return (
    <section className="app-card app-card-lg">
      <p className="app-eyebrow">Your booking link</p>
      <h2 className="app-h2 mt-0.5">Let people grab time with you</h2>
      <p className="app-sub mt-1 max-w-md">Share it — anyone can request a time, it lands here to accept, and they&rsquo;re saved to your contacts.</p>

      <div className="mt-3 flex items-center gap-2">
        <code className="flex-1 min-w-0 truncate text-[12.5px] px-3 py-2 rounded-lg bg-[var(--m-bg-soft)] border border-[var(--m-border)] text-[var(--m-ink-2)]">{display}</code>
        <button type="button" onClick={copy} className="btn-sage text-[12.5px] shrink-0">{copied ? 'Copied ✓' : 'Copy link'}</button>
        <a href={url} target="_blank" rel="noreferrer" className="text-[12.5px] px-2.5 py-2 rounded-lg border border-[var(--m-border)] text-[var(--m-ink-2)] hover:border-[var(--m-accent)] hover:text-[var(--m-accent)] transition-colors shrink-0">Preview</a>
      </div>

      {stillPending.length > 0 && (
        <div className="mt-4">
          <p className="text-[11px] uppercase tracking-wider text-[var(--m-clay-deep)] font-semibold mb-2">Meeting requests</p>
          <ul className="space-y-2">
            {stillPending.map((p) => {
              const r = resolved[p.id]
              return (
                <li key={p.id} className="rounded-xl border border-[var(--m-border)] bg-white p-3">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-[13px] font-semibold text-[var(--m-ink)]">{p.requesterName}</p>
                    <span className="text-[11.5px] text-[var(--m-ink-3)] tabular-nums">
                      {new Date(p.proposedAt).toLocaleString(undefined, { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
                    </span>
                  </div>
                  <p className="text-[12px] text-[var(--m-ink-3)] mt-0.5">
                    <a href={`mailto:${p.requesterEmail}`} className="hover:text-[var(--m-accent)]">{p.requesterEmail}</a>
                    {p.note ? <span> · &ldquo;{p.note}&rdquo;</span> : null}
                  </p>

                  <div className="mt-2.5 flex items-center gap-2">
                    {r?.status === 'accepted' ? (
                      <>
                        <span className="text-[12px] font-medium text-[var(--m-good)]">Accepted ✓</span>
                        {r.meetingUrl ? (
                          <a href={r.meetingUrl} target="_blank" rel="noreferrer" className="btn-sage text-[12px]">Join</a>
                        ) : (
                          <span className="text-[11.5px] text-[var(--m-ink-4)]">Connect Google Calendar for an auto Meet link</span>
                        )}
                      </>
                    ) : (
                      <>
                        <button type="button" onClick={() => act(p.id, 'accept')} disabled={busyId === p.id} className="btn-sage text-[12px] disabled:opacity-50">
                          {busyId === p.id ? '…' : 'Accept'}
                        </button>
                        <button type="button" onClick={() => act(p.id, 'decline')} disabled={busyId === p.id} className="text-[12px] px-2.5 py-1 rounded-md border border-[var(--m-border)] text-[var(--m-ink-3)] hover:text-[var(--m-bad)] hover:border-[var(--m-bad)]/40 transition-colors disabled:opacity-50">
                          Decline
                        </button>
                      </>
                    )}
                  </div>
                </li>
              )
            })}
          </ul>
        </div>
      )}
    </section>
  )
}
