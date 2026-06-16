'use client'

import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { useToast } from '@/components/toast'

/**
 * Shared "Schedule a meeting" dialog. Used by the member-detail modal
 * AND the team-card quick-action so a manager can book a 1:1 from
 * anywhere a teammate is shown — without first clicking into the modal.
 *
 * The endpoint creates a `scheduled_meetings` row, notifies the attendee
 * in-app + email, and pushes to Google Calendar if the manager has it
 * linked.
 */
export function ScheduleMeetingDialog({
  open,
  onClose,
  orgId,
  membershipId,
  attendeeName,
}: {
  open: boolean
  onClose: () => void
  orgId: number
  membershipId: number
  attendeeName: string
}) {
  const toast = useToast()
  const [title, setTitle] = useState(`1:1 with ${attendeeName}`)
  const [agenda, setAgenda] = useState('')
  const [startAt, setStartAt] = useState(() => defaultStart())
  const [durationMin, setDurationMin] = useState(30)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [conflict, setConflict] = useState<{ title: string; startAt: string; endAt: string } | null>(null)
  // Portal to <body> so the overlay escapes any ancestor that creates a
  // containing block for position:fixed (e.g. the page's `.fade-in` wrapper,
  // whose lingering transform was pinning this dialog inside the content
  // instead of the viewport — you'd see only the dim backdrop).
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])

  if (!open || !mounted) return null

  async function submit(force = false) {
    setBusy(true)
    setErr(null)
    if (force) setConflict(null)
    try {
      const res = await fetch(`/api/orgs/${orgId}/members/${membershipId}/schedule-meeting`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title,
          agenda: agenda || null,
          startAt: new Date(startAt).toISOString(),
          durationMin,
          force,
        }),
      })
      const data = await res.json()
      // 409 = the attendee already has something booked in that window. Show
      // the clash and let the manager confirm with "Schedule anyway".
      if (res.status === 409 && data?.error === 'conflict' && data.conflict) {
        setConflict(data.conflict)
        setBusy(false)
        return
      }
      if (!res.ok) throw new Error(data?.message || data?.error || `HTTP ${res.status}`)
      toast.push({
        kind: 'success',
        title: 'Meeting scheduled',
        body: data.calendarConnected === false
          ? 'Scheduled (in-app + email). Connect Google Calendar to also add it to calendars.'
          : data.googleError
            ? 'In-app only — Google Calendar push failed.'
            : data.meeting?.conferenceUrl
              ? 'Calendar invite sent with a Meet link.'
              : 'Calendar invite sent.',
      })
      onClose()
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  return createPortal(
    <div
      className="fixed inset-0 z-[210] flex items-center justify-center px-4 bg-[var(--m-ink)]/40"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md bg-white rounded-2xl shadow-xl p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-[15px] font-semibold text-[var(--m-ink)]">Schedule a meeting</h3>
          <button
            onClick={onClose}
            aria-label="Close"
            className="text-[var(--m-ink-4)] hover:text-[var(--m-ink-2)]"
          >
            ✕
          </button>
        </div>
        <p className="text-[12px] text-[var(--m-ink-3)] mb-3">
          We&apos;ll send {attendeeName} an in-app notification and an email. If you have Google
          Calendar connected, the event is also added to both calendars with a Meet link.
        </p>

        <label className="text-[10.5px] uppercase tracking-wider font-semibold text-[var(--m-ink-3)] block mb-1">Title</label>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          maxLength={200}
          disabled={busy}
          className="input w-full mb-3"
        />

        <div className="grid grid-cols-2 gap-3 mb-3">
          <div>
            <label className="text-[10.5px] uppercase tracking-wider font-semibold text-[var(--m-ink-3)] block mb-1">When</label>
            <input
              type="datetime-local"
              value={startAt}
              min={defaultStart()}
              onChange={(e) => setStartAt(e.target.value)}
              disabled={busy}
              className="input w-full"
            />
          </div>
          <div>
            <label className="text-[10.5px] uppercase tracking-wider font-semibold text-[var(--m-ink-3)] block mb-1">Length</label>
            <select
              value={durationMin}
              onChange={(e) => setDurationMin(Number(e.target.value))}
              disabled={busy}
              className="select w-full"
            >
              <option value={15}>15 min</option>
              <option value={25}>25 min</option>
              <option value={30}>30 min</option>
              <option value={45}>45 min</option>
              <option value={60}>1 hour</option>
            </select>
          </div>
        </div>

        <label className="text-[10.5px] uppercase tracking-wider font-semibold text-[var(--m-ink-3)] block mb-1">Agenda (optional)</label>
        <textarea
          value={agenda}
          onChange={(e) => setAgenda(e.target.value)}
          maxLength={2000}
          disabled={busy}
          rows={3}
          placeholder="What do you want to cover?"
          className="textarea w-full mb-3"
        />

        {err && <p className="text-[12px] text-rose-600 mb-2">{err}</p>}

        {conflict && (
          <div className="mb-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[12px] text-amber-900">
            <p className="font-semibold">⚠ {attendeeName} already has something then</p>
            <p className="mt-0.5">
              “{conflict.title}” · {new Date(conflict.startAt).toLocaleString()} – {new Date(conflict.endAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </p>
            <p className="mt-1 text-amber-800">Pick another time, or schedule anyway.</p>
          </div>
        )}

        <div className="flex items-center justify-end gap-2">
          <button onClick={onClose} disabled={busy} className="btn-secondary">
            Cancel
          </button>
          {conflict ? (
            <button
              onClick={() => submit(true)}
              disabled={busy || !title.trim() || !startAt}
              className="btn-primary"
            >
              {busy ? 'Scheduling…' : 'Schedule anyway'}
            </button>
          ) : (
            <button
              onClick={() => submit()}
              disabled={busy || !title.trim() || !startAt}
              className="btn-primary"
            >
              {busy ? 'Scheduling…' : 'Schedule meeting'}
            </button>
          )}
        </div>
      </div>
    </div>,
    document.body,
  )
}

function defaultStart(): string {
  // 1 hour from now, rounded up to the next 15 min, formatted for the
  // datetime-local input.
  const d = new Date(Date.now() + 60 * 60_000)
  const m = d.getMinutes()
  d.setMinutes(m + ((15 - (m % 15)) % 15))
  d.setSeconds(0)
  d.setMilliseconds(0)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}
