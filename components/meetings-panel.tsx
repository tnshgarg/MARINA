'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

/**
 * Today's meetings panel. Fetches from /api/me/calendar/today, polls every
 * 3 min, and fires a desktop notification 1 min before each meeting starts.
 *
 * If the user hasn't connected Google Calendar, it shows a quiet Connect CTA
 * (one-liner — we don't want to push hard if they don't want it).
 */

type Meeting = {
  id: number
  title: string
  startAt: string
  endAt: string
  location: string | null
  conferenceUrl: string | null
  organizerEmail: string | null
  attendees: string[]
  rsvpStatus: string | null
  attendedAt: string | null
}

export function MeetingsPanel() {
  const [connected, setConnected] = useState<boolean | null>(null)
  const [meetings, setMeetings] = useState<Meeting[]>([])
  const [, setNotified] = useState<Set<number>>(new Set())
  const notifiedRef = useRef<Set<number>>(new Set())

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/me/calendar/today')
      if (!res.ok) return
      const data = (await res.json()) as { connected: boolean; meetings: Meeting[] }
      setConnected(data.connected)
      setMeetings(data.meetings ?? [])
    } catch {
      // ignore
    }
  }, [])

  useEffect(() => {
    load()
    const id = setInterval(load, 180_000) // 3 min
    return () => clearInterval(id)
  }, [load])

  // Per-minute notification ticker. Fires once per meeting at T-1m.
  useEffect(() => {
    if (typeof window === 'undefined') return
    if (!('Notification' in window)) return

    const tick = () => {
      const now = Date.now()
      for (const m of meetings) {
        if (notifiedRef.current.has(m.id)) continue
        const startMs = new Date(m.startAt).getTime()
        const minsAway = (startMs - now) / 60_000
        if (minsAway > 0 && minsAway <= 1.5) {
          if (Notification.permission === 'granted') {
            try {
              new Notification(`Starting now · ${m.title}`, {
                body: m.location || m.conferenceUrl || 'Tap to join.',
                tag: `meeting-${m.id}`,
              })
            } catch {
              // Some browsers block on cross-origin; ignore
            }
          }
          notifiedRef.current.add(m.id)
          setNotified(new Set(notifiedRef.current))
        }
      }
    }
    tick()
    const id = setInterval(tick, 30_000)
    return () => clearInterval(id)
  }, [meetings])

  async function askPermission() {
    if (typeof window === 'undefined' || !('Notification' in window)) return
    try {
      await Notification.requestPermission()
    } catch {
      // ignore
    }
  }

  if (connected === null) {
    return null // loading
  }

  if (!connected) {
    return (
      <section className="rounded-xl border border-slate-200 bg-white p-4">
        <div className="flex items-baseline justify-between gap-3 flex-wrap">
          <h3 className="text-[13px] font-semibold text-slate-900">Today's meetings</h3>
        </div>
        <p className="mt-1.5 text-[12px] text-slate-500 leading-snug">
          Connect Google Calendar to see today's schedule and get notified before each meeting.
        </p>
        <a
          href="/api/connect/google/start?return_to=/dashboard"
          className="mt-3 inline-flex px-3 py-1.5 rounded-md bg-slate-900 hover:bg-slate-700 text-white text-[12px] font-medium transition"
        >
          Connect Google Calendar
        </a>
      </section>
    )
  }

  const now = Date.now()
  const nextUp = meetings.find((m) => new Date(m.endAt).getTime() > now)
  const later = meetings.filter((m) => m.id !== nextUp?.id && new Date(m.startAt).getTime() > now)
  const past = meetings.filter((m) => new Date(m.endAt).getTime() <= now)

  return (
    <section className="rounded-xl border border-slate-200 bg-white overflow-hidden">
      <div className="px-4 py-3 border-b border-slate-100 flex items-baseline justify-between gap-3 flex-wrap">
        <h3 className="text-[13px] font-semibold text-slate-900">
          Today's meetings
          <span className="ml-1.5 text-slate-400 tabular-nums">{meetings.length}</span>
        </h3>
        {typeof window !== 'undefined' &&
          'Notification' in window &&
          Notification.permission === 'default' && (
            <button
              type="button"
              onClick={askPermission}
              className="text-[11.5px] text-[var(--m-accent)] hover:text-[var(--m-accent-2)] font-medium"
            >
              Enable notifications
            </button>
          )}
      </div>

      {meetings.length === 0 ? (
        <p className="px-4 py-5 text-[12.5px] text-slate-500">Nothing scheduled today.</p>
      ) : (
        <ul className="divide-y divide-slate-100">
          {nextUp && (
            <MeetingRow meeting={nextUp} isNext />
          )}
          {later.map((m) => (
            <MeetingRow key={m.id} meeting={m} />
          ))}
          {past.map((m) => (
            <MeetingRow key={m.id} meeting={m} isPast />
          ))}
        </ul>
      )}
    </section>
  )
}

function MeetingRow({
  meeting: m,
  isNext,
  isPast,
}: {
  meeting: Meeting
  isNext?: boolean
  isPast?: boolean
}) {
  const start = new Date(m.startAt)
  const end = new Date(m.endAt)
  const fmt = (d: Date) => d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
  const inProgress = !isPast && Date.now() >= start.getTime() && Date.now() <= end.getTime()
  const declined = m.rsvpStatus === 'declined'
  return (
    <li
      className={`px-4 py-2.5 flex items-start gap-3 ${
        isNext ? 'bg-[var(--m-accent-soft)]/60' : isPast ? 'opacity-60' : ''
      }`}
    >
      <div className="shrink-0 w-14 text-[11px] text-slate-500 tabular-nums leading-tight pt-0.5">
        {fmt(start)}
        <br />
        <span className="text-slate-400">{fmt(end)}</span>
      </div>
      <div className="min-w-0 flex-1">
        <p className={`text-[12.5px] truncate ${declined ? 'line-through text-slate-400' : 'text-slate-900 font-medium'}`}>
          {m.title}
        </p>
        <p className="text-[11px] text-slate-500 truncate">
          {inProgress && <span className="text-emerald-700 font-medium">In progress · </span>}
          {m.location || (m.attendees.length > 0 ? `${m.attendees.length} attendees` : 'no details')}
          {m.attendedAt && <span className="text-emerald-700"> · attended</span>}
        </p>
      </div>
      {m.conferenceUrl && (
        <a
          href={m.conferenceUrl}
          target="_blank"
          rel="noreferrer"
          className="px-2.5 py-1 rounded-md bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 text-[11.5px] font-medium transition shrink-0"
        >
          Join
        </a>
      )}
    </li>
  )
}
