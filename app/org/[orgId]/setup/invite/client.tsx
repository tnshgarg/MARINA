'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

type Row = {
  email: string
  role: 'manager' | 'member'
  discipline: string
  jobTitle: string
}

const DISCIPLINES: Array<[Row['discipline'], string]> = [
  ['engineering', 'Engineering'],
  ['design', 'Design'],
  ['product', 'Product'],
  ['sales', 'Sales'],
  ['support', 'Customer Support'],
  ['marketing', 'Marketing'],
  ['ops', 'Operations'],
  ['hr', 'People / HR'],
  ['finance', 'Finance'],
  ['exec', 'Leadership'],
  ['other', 'Other'],
]

/**
 * One-time invite-your-team step shown right after org creation. We give
 * the owner three pre-filled rows so the page feels useful immediately
 * (most teams invite ≥3 people on day one), and an "add another row"
 * button for larger batches.
 */
export default function InviteSetupClient({
  orgId,
  orgName,
}: {
  orgId: number
  orgName: string
}) {
  const router = useRouter()
  const [rows, setRows] = useState<Row[]>([
    { email: '', role: 'member', discipline: 'other', jobTitle: '' },
    { email: '', role: 'member', discipline: 'other', jobTitle: '' },
    { email: '', role: 'member', discipline: 'other', jobTitle: '' },
  ])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [results, setResults] = useState<Array<{ email: string; ok: boolean; error?: string }> | null>(null)

  function setRow(i: number, patch: Partial<Row>) {
    setRows((rs) => rs.map((r, idx) => (idx === i ? { ...r, ...patch } : r)))
  }

  function addRow() {
    setRows((rs) => [...rs, { email: '', role: 'member', discipline: 'other', jobTitle: '' }])
  }

  function removeRow(i: number) {
    setRows((rs) => rs.filter((_, idx) => idx !== i))
  }

  async function send() {
    const filled = rows.filter((r) => r.email.trim().length > 0)
    if (filled.length === 0) {
      setError('Add at least one email to send invites.')
      return
    }
    setBusy(true)
    setError(null)
    const out: Array<{ email: string; ok: boolean; error?: string }> = []
    for (const r of filled) {
      try {
        const res = await fetch(`/api/orgs/${orgId}/invites`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            email: r.email.trim(),
            role: r.role,
            discipline: r.discipline,
            jobTitle: r.jobTitle.trim() || null,
          }),
        })
        const data = await res.json().catch(() => ({}))
        if (!res.ok) {
          out.push({ email: r.email, ok: false, error: data?.message ?? data?.error ?? 'failed' })
        } else {
          out.push({ email: r.email, ok: true })
        }
      } catch (e) {
        out.push({ email: r.email, ok: false, error: e instanceof Error ? e.message : String(e) })
      }
    }
    setBusy(false)
    setResults(out)
    // Auto-advance if everything went out.
    if (out.every((r) => r.ok)) {
      setTimeout(() => router.push(`/org/${orgId}`), 1200)
    }
  }

  return (
    <main className="min-h-screen bg-[var(--m-bg)] px-6 py-12">
      <div className="max-w-3xl mx-auto">
        <p className="app-eyebrow">Step 04 · Invite your team</p>
        <h1 className="app-h1 mt-2">Bring your team into {orgName}</h1>
        <p className="app-sub mt-2 max-w-xl">
          Add as many teammates as you want. They&apos;ll get an email with a one-click link to
          join — no manual setup on their end. You can always invite more later from the Members
          page.
        </p>

        <div className="mt-8 space-y-3">
          {rows.map((r, i) => (
            <div
              key={i}
              className="rounded-xl border border-[var(--m-border)] bg-white p-3 grid grid-cols-1 sm:grid-cols-[minmax(0,1.4fr)_120px_minmax(0,1fr)_minmax(0,1fr)_auto] gap-2.5 items-center"
            >
              <input
                type="email"
                placeholder="teammate@example.com"
                value={r.email}
                onChange={(e) => setRow(i, { email: e.target.value })}
                disabled={busy}
                className="input"
              />
              <select
                value={r.role}
                onChange={(e) => setRow(i, { role: e.target.value as Row['role'] })}
                disabled={busy}
                className="select"
              >
                <option value="member">Member</option>
                <option value="manager">Manager</option>
              </select>
              <select
                value={r.discipline}
                onChange={(e) => setRow(i, { discipline: e.target.value })}
                disabled={busy}
                className="select"
              >
                {DISCIPLINES.map(([k, label]) => (
                  <option key={k} value={k}>
                    {label}
                  </option>
                ))}
              </select>
              <input
                type="text"
                placeholder="Job title (optional)"
                value={r.jobTitle}
                onChange={(e) => setRow(i, { jobTitle: e.target.value })}
                disabled={busy}
                maxLength={80}
                className="input"
              />
              <button
                type="button"
                onClick={() => removeRow(i)}
                disabled={busy || rows.length === 1}
                className="text-[var(--m-ink-4)] hover:text-rose-600 disabled:opacity-30 transition px-2"
                aria-label="Remove row"
                title="Remove"
              >
                ×
              </button>
            </div>
          ))}

          <button
            type="button"
            onClick={addRow}
            disabled={busy}
            className="text-[12.5px] text-[var(--m-accent)] hover:text-[var(--m-accent-2)] font-medium"
          >
            + Add another teammate
          </button>
        </div>

        {error && (
          <p className="mt-4 text-[12.5px] text-rose-700 bg-rose-50 border border-rose-200 rounded-md px-3 py-2">
            {error}
          </p>
        )}

        {results && (
          <div className="mt-5 rounded-xl border border-[var(--m-border)] bg-white p-4">
            <p className="text-[12.5px] font-semibold text-[var(--m-ink)] mb-2">Invites sent</p>
            <ul className="space-y-1">
              {results.map((r, i) => (
                <li key={i} className="text-[12.5px] flex items-baseline gap-2">
                  <span className={r.ok ? 'text-[var(--m-good)]' : 'text-rose-700'}>
                    {r.ok ? '✓' : '✗'}
                  </span>
                  <span className="text-[var(--m-ink)] flex-1 truncate">{r.email}</span>
                  {r.error && <span className="text-rose-700 text-[11.5px]">{r.error}</span>}
                </li>
              ))}
            </ul>
            {results.every((r) => r.ok) && (
              <p className="mt-3 text-[12.5px] text-[var(--m-good)]">
                All invites sent — heading to the dashboard…
              </p>
            )}
          </div>
        )}

        <div className="mt-8 flex items-center justify-between gap-3 flex-wrap">
          <button
            type="button"
            onClick={() => router.push(`/org/${orgId}`)}
            className="text-[13px] text-[var(--m-ink-3)] hover:text-[var(--m-ink)] underline"
          >
            Skip — I&apos;ll invite later
          </button>
          <button
            type="button"
            onClick={send}
            disabled={busy}
            className="btn-primary"
          >
            {busy ? 'Sending…' : 'Send invites →'}
          </button>
        </div>
      </div>
    </main>
  )
}
