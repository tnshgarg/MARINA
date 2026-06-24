'use client'

import { useState } from 'react'

/**
 * "Get your work in" — the one-step data hookup behind the employee features
 * (work journal + review packet). Two states:
 *
 *  - Not linked → link GitHub via NextAuth (identity; merges into this account).
 *  - Linked → pull the user's activity (commits, PRs, reviews) into Marina with
 *    a single button (a 90-day backfill on first run).
 *
 * Org-free: it syncs the signed-in user's own activity with no org filter, so it
 * works for a solo employee and an employee in an org alike.
 */
export function ConnectWork({ linked, hasEvents }: { linked: boolean; hasEvents: boolean }) {
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function sync() {
    setBusy(true)
    setError(null)
    setResult(null)
    try {
      const res = await fetch('/api/sync/github', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ days: 90 }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data?.error ?? 'failed')
      const n = typeof data.inserted === 'number' ? data.inserted : 0
      setResult(n > 0 ? `Synced ${n} new item${n === 1 ? '' : 's'} — refreshing…` : 'Up to date — refreshing…')
      // Reload so the journal + packet pick up the freshly-synced activity.
      setTimeout(() => window.location.reload(), 900)
    } catch (e) {
      setError(String(e))
      setBusy(false)
    }
  }

  return (
    <section className="app-card app-card-lg">
      <div className="flex items-start gap-3">
        <span className="shrink-0 w-10 h-10 rounded-xl bg-[var(--m-ink)] text-white inline-flex items-center justify-center">
          <svg width={20} height={20} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
            <path d="M12 .5C5.65.5.5 5.65.5 12c0 5.08 3.29 9.39 7.86 10.91.58.1.79-.25.79-.56v-2.1c-3.2.7-3.88-1.36-3.88-1.36-.52-1.31-1.28-1.66-1.28-1.66-1.05-.72.08-.71.08-.71 1.16.08 1.77 1.19 1.77 1.19 1.03 1.77 2.7 1.26 3.36.96.1-.75.4-1.26.73-1.55-2.55-.29-5.23-1.28-5.23-5.7 0-1.26.45-2.29 1.19-3.1-.12-.29-.52-1.46.11-3.04 0 0 .97-.31 3.18 1.18a11 11 0 0 1 5.8 0c2.21-1.49 3.18-1.18 3.18-1.18.63 1.58.23 2.75.11 3.04.74.81 1.19 1.84 1.19 3.1 0 4.43-2.69 5.41-5.25 5.69.41.36.78 1.07.78 2.15v3.19c0 .31.21.67.8.56C20.71 21.39 24 17.08 24 12 24 5.65 18.35.5 12 .5Z" />
          </svg>
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="app-h2">
            {linked ? 'Sync your GitHub activity' : 'Connect GitHub'}
          </h2>
          <p className="app-sub mt-1 max-w-md">
            {linked
              ? 'Pull your commits, PRs and reviews into Marina so your journal and review packet are built from real work.'
              : 'Link GitHub so Marina can build your work journal and review packet from your real commits, PRs and reviews. Your data stays private to you.'}
          </p>

          <div className="mt-3 flex items-center gap-3 flex-wrap">
            {linked ? (
              <button type="button" onClick={sync} disabled={busy} className="btn-sage text-[13px] disabled:opacity-60">
                {busy ? 'Syncing…' : hasEvents ? 'Re-sync (last 90 days)' : 'Sync my work'}
              </button>
            ) : (
              <a href="/api/auth/signin/github?callbackUrl=/dashboard" className="btn-sage text-[13px]">
                Connect GitHub
              </a>
            )}
            {result && <span className="text-[12px] text-[var(--m-good)]">{result}</span>}
            {error && (
              <span className="text-[12px] text-rose-600">
                {error.includes('github_not_connected') ? 'Link GitHub first.' : `Couldn't sync — ${error}`}
              </span>
            )}
          </div>
        </div>
      </div>
    </section>
  )
}
