'use client'

import { useEffect, useState } from 'react'

/**
 * Choose which repos count toward your report — so personal side-projects stay
 * out of your work updates. Empty = include everything. Match is a loose
 * substring on "owner/name" (e.g. "acme" includes all acme repos).
 */
export function TrackedRepos() {
  const [value, setValue] = useState('')
  const [saved, setSaved] = useState(false)
  const [busy, setBusy] = useState(false)
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    fetch('/api/me/tracked-repos')
      .then((r) => r.json())
      .then((d) => setValue((d.repos ?? []).join(', ')))
      .catch(() => {})
      .finally(() => setLoaded(true))
  }, [])

  async function save() {
    setBusy(true)
    setSaved(false)
    const repos = value.split(',').map((s) => s.trim()).filter(Boolean)
    try {
      const res = await fetch('/api/me/tracked-repos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ repos }),
      })
      if (res.ok) {
        setSaved(true)
        setTimeout(() => setSaved(false), 2000)
      }
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="app-card app-card-lg">
      <p className="app-eyebrow">Privacy</p>
      <h2 className="app-h2 mt-0.5">Which repos count?</h2>
      <p className="app-sub mt-1 max-w-md">
        Keep personal projects out of your reports. Add the repos or owners to include — leave empty to include everything.
      </p>
      <div className="mt-3 flex gap-1.5">
        <input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="acme-corp, my-team/api  (comma-separated)"
          disabled={!loaded || busy}
          className="flex-1 min-w-0 px-3 py-2 text-[13px] rounded-lg border border-[var(--m-border)] outline-none focus:border-[var(--m-accent)] focus:ring-2 focus:ring-[var(--m-accent)]/15 transition disabled:opacity-60"
        />
        <button type="button" onClick={save} disabled={busy || !loaded} className="btn-sage text-[13px] shrink-0 disabled:opacity-50">
          {busy ? '…' : saved ? 'Saved ✓' : 'Save'}
        </button>
      </div>
    </section>
  )
}
