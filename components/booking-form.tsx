'use client'

import { useState } from 'react'

/** The public request form on /book/<handle>. No account needed. */
export function BookingForm({ handle, hostName }: { handle: string; hostName: string }) {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [proposedAt, setProposedAt] = useState('')
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      const res = await fetch(`/api/book/${encodeURIComponent(handle)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, proposedAt: new Date(proposedAt).toISOString(), note }),
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
          {hostName} will get back to you at {email} to confirm.
        </p>
      </div>
    )
  }

  return (
    <form onSubmit={submit} className="rounded-2xl border border-[var(--m-border)] bg-white p-6 shadow-[var(--m-shadow-sm)] space-y-3">
      <Field label="Your name">
        <input required value={name} onChange={(e) => setName(e.target.value)} className="input" placeholder="Alex Rivera" disabled={busy} />
      </Field>
      <Field label="Your email">
        <input required type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="input" placeholder="alex@company.com" disabled={busy} />
      </Field>
      <Field label="Preferred time">
        <input required type="datetime-local" value={proposedAt} onChange={(e) => setProposedAt(e.target.value)} className="input" disabled={busy} />
      </Field>
      <Field label="What's it about? (optional)">
        <textarea value={note} onChange={(e) => setNote(e.target.value)} className="textarea" placeholder="A quick intro / what you'd like to discuss" disabled={busy} />
      </Field>
      {error && <p className="text-[12px] text-[var(--m-bad)]">Couldn&apos;t send — {error}</p>}
      <button type="submit" disabled={busy} className="btn-primary w-full justify-center disabled:opacity-60">
        {busy ? 'Sending…' : 'Request this time'}
      </button>
    </form>
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
