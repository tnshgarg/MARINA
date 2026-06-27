'use client'

import { useMemo, useState } from 'react'

type Member = { userId: number; name: string | null; login: string }

/**
 * Schedule a meeting with multiple teammates in one click — from the Teams page.
 * Posts to /api/orgs/{orgId}/meetings which creates a single Google event (with
 * a Meet link) and records it for every attendee.
 */
export function TeamMeetingScheduler({
  orgId,
  members,
  preselect,
  label = 'Schedule meeting',
}: {
  orgId: number
  members: Member[]
  /** userIds to pre-check when the modal opens (e.g. a whole team). */
  preselect?: number[]
  /** Override the trigger button copy. */
  label?: string
}) {
  const [open, setOpen] = useState(false)
  const [title, setTitle] = useState('')
  const [when, setWhen] = useState('')
  const [duration, setDuration] = useState(30)
  const [picked, setPicked] = useState<Set<number>>(() => new Set(preselect ?? []))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState<string | null>(null)

  const sorted = useMemo(
    () => [...members].sort((a, b) => (a.name ?? a.login).localeCompare(b.name ?? b.login)),
    [members],
  )

  function toggle(id: number) {
    setPicked((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  async function submit() {
    setError(null)
    if (picked.size === 0) return setError('Pick at least one teammate.')
    if (!when) return setError('Choose a date and time.')
    setBusy(true)
    try {
      const res = await fetch(`/api/orgs/${orgId}/meetings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: title.trim() || 'Team meeting',
          startISO: new Date(when).toISOString(),
          durationMin: duration,
          attendeeUserIds: Array.from(picked),
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data?.error || 'failed')
      setDone(
        data.calendarConnected
          ? `Scheduled with ${data.count} ${data.count === 1 ? 'person' : 'people'} — calendar invites sent.`
          : `Scheduled with ${data.count} ${data.count === 1 ? 'person' : 'people'}. Connect Google Calendar to add Meet links.`,
      )
      setTimeout(() => window.location.reload(), 1400)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setBusy(false)
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setPicked(new Set(preselect ?? []))
          setOpen(true)
        }}
        className="inline-flex items-center gap-1.5 rounded-lg bg-[var(--m-accent)] text-white hover:bg-[var(--m-accent-2)] px-3 py-1.5 text-[12.5px] font-medium transition-colors"
      >
        <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" aria-hidden>
          <rect x="3" y="4.5" width="18" height="16" rx="2" />
          <path d="M3 9h18M8 3v3M16 3v3M12 13v3M10.5 14.5h3" />
        </svg>
        {label}
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/30" onClick={() => !busy && setOpen(false)}>
          <div className="w-full max-w-md bg-white rounded-2xl border border-[var(--m-border)] shadow-xl p-5 max-h-[85vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-[15px] font-semibold text-[var(--m-ink)]">New team meeting</h2>
              <button type="button" onClick={() => !busy && setOpen(false)} aria-label="Close" className="w-7 h-7 inline-flex items-center justify-center rounded-md text-[var(--m-ink-4)] hover:bg-[var(--m-bg-soft)]">
                <svg width={15} height={15} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M6 6l12 12M18 6L6 18" strokeLinecap="round" /></svg>
              </button>
            </div>

            <label className="app-eyebrow block mb-1">Title</label>
            <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Sprint planning" className="input w-full mb-3" maxLength={200} />

            <div className="grid grid-cols-2 gap-3 mb-3">
              <div>
                <label className="app-eyebrow block mb-1">When</label>
                <input type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} className="input w-full" />
              </div>
              <div>
                <label className="app-eyebrow block mb-1">Duration</label>
                <select value={duration} onChange={(e) => setDuration(Number(e.target.value))} className="select w-full">
                  {[15, 30, 45, 60, 90].map((m) => (
                    <option key={m} value={m}>{m} min</option>
                  ))}
                </select>
              </div>
            </div>

            <label className="app-eyebrow block mb-1">Attendees · {picked.size} selected</label>
            <div className="border border-[var(--m-border)] rounded-lg max-h-52 overflow-y-auto divide-y divide-[var(--m-border-soft)]">
              {sorted.map((m) => (
                <label key={m.userId} className="flex items-center gap-2.5 px-3 py-2 cursor-pointer hover:bg-[var(--m-bg-soft)]">
                  <input type="checkbox" checked={picked.has(m.userId)} onChange={() => toggle(m.userId)} className="accent-[var(--m-accent)]" />
                  <span className="text-[13px] text-[var(--m-ink)] truncate">{m.name ?? `@${m.login}`}</span>
                </label>
              ))}
            </div>

            {error && <p className="mt-3 text-[12px] text-[var(--m-bad)]">{error}</p>}
            {done && <p className="mt-3 text-[12px] text-[var(--m-good)]">{done}</p>}

            <div className="mt-4 flex justify-end gap-2">
              <button type="button" onClick={() => setOpen(false)} disabled={busy} className="btn-secondary text-[13px]">Cancel</button>
              <button type="button" onClick={submit} disabled={busy} className="btn-sage text-[13px] disabled:opacity-50">
                {busy ? 'Scheduling…' : 'Schedule'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
