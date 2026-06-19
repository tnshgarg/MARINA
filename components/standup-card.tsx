'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

/**
 * File today's standup from the web (parity with the Slack modal). Yesterday is
 * pre-drafted from the member's activity; they add today + blockers and post.
 * Re-posting updates the same day's row.
 */
export function StandupCard({
  orgId,
  prefill,
  existing,
}: {
  orgId: number
  prefill: { yesterday: string; blockers: string }
  existing: { yesterday: string; today: string; blockers: string } | null
}) {
  const router = useRouter()
  const [yesterday, setYesterday] = useState(existing?.yesterday || prefill.yesterday)
  const [today, setToday] = useState(existing?.today || '')
  const [blockers, setBlockers] = useState(existing?.blockers || prefill.blockers)
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState<{ kind: 'idle' | 'ok' | 'error'; text?: string }>(
    existing ? { kind: 'ok', text: 'Filed for today — edit and re-post anytime.' } : { kind: 'idle' },
  )

  async function submit() {
    if (!today.trim()) {
      setStatus({ kind: 'error', text: "Add what you're working on today." })
      return
    }
    setBusy(true)
    setStatus({ kind: 'idle' })
    try {
      const r = await fetch(`/api/orgs/${orgId}/standup`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ yesterday, today, blockers }),
      })
      if (!r.ok) {
        const d = await r.json().catch(() => ({}))
        setStatus({ kind: 'error', text: d.error ?? 'Could not post.' })
        setBusy(false)
        return
      }
      setBusy(false)
      setStatus({ kind: 'ok', text: 'Posted — your team can see it.' })
      router.refresh()
    } catch {
      setStatus({ kind: 'error', text: 'Could not post.' })
      setBusy(false)
    }
  }

  const statusColor =
    status.kind === 'ok' ? 'text-[var(--m-good)]' : status.kind === 'error' ? 'text-[var(--m-bad)]' : 'text-transparent'

  return (
    <div className="rounded-xl border border-[var(--m-border)] bg-white p-4">
      <p className="text-[13px] font-semibold text-[var(--m-ink)]">Today&apos;s standup</p>
      <p className="text-[11.5px] text-[var(--m-ink-4)] mb-2.5">
        Marina drafted yesterday from your activity — add today and post.
      </p>
      <label className="block text-[11px] font-medium text-[var(--m-ink-3)] mb-0.5">Yesterday</label>
      <textarea value={yesterday} onChange={(e) => setYesterday(e.target.value)} rows={2} className="input w-full text-[13px] resize-y mb-2" />
      <label className="block text-[11px] font-medium text-[var(--m-ink-3)] mb-0.5">Today</label>
      <textarea
        value={today}
        onChange={(e) => {
          setToday(e.target.value)
          setStatus({ kind: 'idle' })
        }}
        rows={2}
        placeholder="What you're focusing on"
        className="input w-full text-[13px] resize-y mb-2"
      />
      <label className="block text-[11px] font-medium text-[var(--m-ink-3)] mb-0.5">Blockers (optional)</label>
      <textarea value={blockers} onChange={(e) => setBlockers(e.target.value)} rows={1} placeholder="Anything in your way?" className="input w-full text-[13px] resize-y" />
      <div className="mt-2.5 flex items-center justify-between gap-2">
        <span className={`text-[12px] ${statusColor}`}>{status.text ?? '·'}</span>
        <button type="button" onClick={submit} disabled={busy || !today.trim()} className="btn-sage text-[12.5px] disabled:opacity-50 shrink-0">
          {busy ? 'Posting…' : existing ? 'Update standup' : 'Post standup'}
        </button>
      </div>
    </div>
  )
}
