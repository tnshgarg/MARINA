'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

/**
 * Schedule a new meeting from the dashboard — creates a Google Calendar event
 * with a Meet link + emailed invites. Gated on Google Calendar being connected:
 * if it isn't, the panel nudges the user to connect rather than letting them
 * compose a meeting that can't be created.
 */
export function NewMeeting({ calendarConnected }: { calendarConnected: boolean }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [title, setTitle] = useState('')
  const [attendees, setAttendees] = useState('')
  const [when, setWhen] = useState('')
  const [dur, setDur] = useState(30)
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<{ ok: boolean; url?: string | null; error?: string } | null>(null)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!title.trim() || !when) return
    setBusy(true)
    setResult(null)
    try {
      const res = await fetch('/api/me/meetings/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          summary: title.trim(),
          attendees: attendees.split(/[\s,]+/).map((s) => s.trim()).filter(Boolean),
          startISO: new Date(when).toISOString(),
          durationMin: dur,
        }),
      })
      const data = await res.json()
      if (res.ok) {
        setResult({ ok: true, url: data.meetingUrl })
        setTitle('')
        setAttendees('')
        setWhen('')
        router.refresh()
      } else {
        setResult({ ok: false, error: data.error })
      }
    } catch {
      setResult({ ok: false, error: 'error' })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div>
      <button
        type="button"
        onClick={() => {
          setOpen((o) => !o)
          setResult(null)
        }}
        className="text-[12px] px-2.5 py-1 rounded-md border border-[var(--m-border)] text-[var(--m-ink-2)] hover:border-[var(--m-accent)] hover:text-[var(--m-accent)] transition-colors"
      >
        {open ? 'Cancel' : '+ New meeting'}
      </button>

      {open && (
        <div className="mt-3">
          {!calendarConnected ? (
            <div className="rounded-lg border border-[var(--m-border)] bg-[var(--m-bg-soft)] p-3.5">
              <p className="text-[13px] text-[var(--m-ink-2)]">
                Connect Google Calendar to schedule meetings — Marina adds a Meet link and emails the invites.
              </p>
              <a href="/api/connect/google/start?return_to=/dashboard" className="btn-sage text-[12.5px] mt-2.5 inline-flex">
                Connect Google Calendar
              </a>
            </div>
          ) : (
            <form onSubmit={submit} className="space-y-2">
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Meeting title"
                className="input"
                disabled={busy}
                required
              />
              <input
                value={attendees}
                onChange={(e) => setAttendees(e.target.value)}
                placeholder="Guest emails (comma-separated, optional)"
                className="input"
                disabled={busy}
              />
              <div className="flex gap-2">
                <input
                  type="datetime-local"
                  value={when}
                  onChange={(e) => setWhen(e.target.value)}
                  className="input flex-1 min-w-0"
                  disabled={busy}
                  required
                />
                <select value={dur} onChange={(e) => setDur(Number(e.target.value))} className="select w-[110px] shrink-0" disabled={busy}>
                  <option value={15}>15 min</option>
                  <option value={30}>30 min</option>
                  <option value={45}>45 min</option>
                  <option value={60}>60 min</option>
                </select>
              </div>
              <div className="flex items-center gap-2">
                <button type="submit" disabled={busy || !title.trim() || !when} className="btn-sage text-[13px] disabled:opacity-50">
                  {busy ? 'Creating…' : 'Create meeting'}
                </button>
                {result?.ok && (
                  <span className="text-[12px] text-[var(--m-good)]">
                    Created ✓{' '}
                    {result.url && (
                      <a href={result.url} target="_blank" rel="noreferrer" className="text-[var(--m-accent-2)] underline ml-1">
                        Join
                      </a>
                    )}
                  </span>
                )}
                {result && !result.ok && (
                  <span className="text-[12px] text-[var(--m-bad)]">
                    {result.error === 'no_calendar' ? 'Connect Google Calendar first.' : "Couldn't create — try again."}
                  </span>
                )}
              </div>
            </form>
          )}
        </div>
      )}
    </div>
  )
}
