'use client'

import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { usePathname, useRouter } from 'next/navigation'
import { useToast } from '@/components/toast'
import { ScheduleMeetingDialog } from '@/components/schedule-meeting-dialog'
import { HubHeader, StatCard, Card, EmptyState } from '../ui'

type Meeting = {
  id: number
  title: string
  startAt: string
  endAt: string
  location: string | null
  conferenceUrl: string | null
  rsvpStatus: string | null
  attendeeCount: number
}
type Teammate = { membershipId: number; name: string }

export default function CalendarHubClient({
  orgId,
  connected,
  today,
  tomorrow,
  later,
  pastRecent,
  pastCount,
  teammates,
}: {
  orgId: number
  connected: boolean
  today: Meeting[]
  tomorrow: Meeting[]
  later: Meeting[]
  pastRecent: Meeting[]
  pastCount: number
  teammates: Teammate[]
}) {
  const router = useRouter()
  const pathname = usePathname()
  const toast = useToast()
  const [syncing, setSyncing] = useState(false)
  const [pickerOpen, setPickerOpen] = useState(false)
  const [attendee, setAttendee] = useState<Teammate | null>(null)

  const upcoming = useMemo(() => [...today, ...tomorrow, ...later], [today, tomorrow, later])
  const bookedMin = useMemo(
    () => upcoming.reduce((a, m) => a + Math.max(0, (new Date(m.endAt).getTime() - new Date(m.startAt).getTime()) / 60000), 0),
    [upcoming],
  )

  async function sync() {
    setSyncing(true)
    try {
      const res = await fetch('/api/me/calendar/sync', { method: 'POST' })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`)
      toast.push({ kind: 'success', title: 'Calendar synced', body: `${data.inserted ?? 0} new · ${data.updated ?? 0} updated` })
      router.refresh()
    } catch (e) {
      toast.push({ kind: 'error', title: 'Sync failed', body: e instanceof Error ? e.message : String(e) })
    } finally {
      setSyncing(false)
    }
  }

  if (!connected) {
    return (
      <div className="max-w-3xl">
        <HubHeader brand="calendar" title="Calendar" subtitle="Your meetings, focus load, and one-click scheduling." />
        <EmptyState
          brand="calendar"
          title="Connect your Google Calendar"
          body="Once connected, MARINA shows your meetings here, flags meeting overload, and lets you schedule 1:1s with anyone on the team — invite + Meet link included."
          action={
            <a
              href={`/api/connect/google/start?return_to=${encodeURIComponent(pathname || `/org/${orgId}/integrations/calendar`)}`}
              className="inline-flex px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-[13px] font-medium transition"
            >
              Connect Google Calendar
            </a>
          }
        />
      </div>
    )
  }

  return (
    <div className="max-w-5xl">
      <HubHeader
        brand="calendar"
        title="Calendar"
        subtitle="Your meetings, focus load, and one-click scheduling."
        actions={
          <>
            <button type="button" onClick={() => setPickerOpen(true)} className="btn-primary inline-flex text-[12.5px] !py-1.5 !px-3">
              + Schedule
            </button>
            <button type="button" onClick={sync} disabled={syncing} className="btn-secondary inline-flex text-[12.5px] !py-1.5 !px-3">
              {syncing ? 'Syncing…' : 'Sync'}
            </button>
          </>
        }
      />

      <div className="grid grid-cols-3 gap-2.5 mb-5">
        <StatCard value={today.length} label="today" accent="var(--m-accent-2)" />
        <StatCard value={upcoming.length} label="upcoming" />
        <StatCard value={pastCount} label="past (tracked)" />
      </div>

      <div className="grid lg:grid-cols-3 gap-4">
        {/* Meetings */}
        <div className="lg:col-span-2 space-y-4">
          <Card title="Today" hint={today.length ? `${today.length}` : undefined}>
            {today.length ? (
              <ul className="space-y-1.5">{today.map((m) => <MeetingRow key={m.id} m={m} />)}</ul>
            ) : (
              <MiniEmpty text="No meetings today — a clear runway." onSchedule={() => setPickerOpen(true)} />
            )}
          </Card>

          <Card title="Tomorrow" hint={tomorrow.length ? `${tomorrow.length}` : undefined}>
            {tomorrow.length ? (
              <ul className="space-y-1.5">{tomorrow.map((m) => <MeetingRow key={m.id} m={m} />)}</ul>
            ) : (
              <MiniEmpty text="Nothing tomorrow." onSchedule={() => setPickerOpen(true)} />
            )}
          </Card>

          {later.length > 0 && (
            <Card title="Upcoming" hint={`${later.length}`}>
              <ul className="space-y-1.5">{later.map((m) => <MeetingRow key={m.id} m={m} showDate />)}</ul>
            </Card>
          )}
        </div>

        {/* Side panel */}
        <div className="space-y-4">
          <Card title="Focus load" hint="this week">
            <p className="text-[23px] font-semibold tabular-nums text-[var(--m-ink)] leading-none">
              {Math.round(bookedMin / 60)}<span className="text-[14px] text-[var(--m-ink-4)] font-medium">h</span>
            </p>
            <p className="mt-1.5 text-[11.5px] text-[var(--m-ink-3)] leading-snug">
              {upcoming.length === 0
                ? 'Nothing booked — plenty of deep-work time.'
                : bookedMin / 60 >= 15
                  ? 'Heavy meeting week — guard some focus blocks.'
                  : `${upcoming.length} meeting${upcoming.length === 1 ? '' : 's'} booked across the next few days.`}
            </p>
            <a
              href="https://calendar.google.com/calendar/r/day"
              target="_blank"
              rel="noopener noreferrer"
              className="mt-3 inline-flex items-center gap-1 text-[11.5px] font-medium text-[var(--m-accent)] hover:text-[var(--m-accent-2)]"
            >
              Open Google Calendar
              <svg width={11} height={11} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M7 17L17 7M9 7h8v8" strokeLinecap="round" strokeLinejoin="round" /></svg>
            </a>
          </Card>

          {pastRecent.length > 0 && (
            <Card title="Recent" hint="past">
              <ul className="space-y-2">
                {pastRecent.map((m) => (
                  <li key={m.id} className="flex items-baseline gap-2">
                    <span className="shrink-0 text-[10.5px] text-[var(--m-ink-4)] tabular-nums w-12">{fmtDay(new Date(m.startAt))}</span>
                    <span className="text-[12px] text-[var(--m-ink-2)] truncate">{m.title}</span>
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </div>
      </div>

      <TeammatePicker
        open={pickerOpen}
        teammates={teammates}
        onClose={() => setPickerOpen(false)}
        onPick={(t) => {
          setPickerOpen(false)
          setAttendee(t)
        }}
      />
      {attendee && (
        <ScheduleMeetingDialog open={!!attendee} onClose={() => setAttendee(null)} orgId={orgId} membershipId={attendee.membershipId} attendeeName={attendee.name} />
      )}
    </div>
  )
}

function MeetingRow({ m, showDate }: { m: Meeting; showDate?: boolean }) {
  const start = new Date(m.startAt)
  const end = new Date(m.endAt)
  const mins = Math.max(0, Math.round((end.getTime() - start.getTime()) / 60000))
  const rsvp = m.rsvpStatus
  return (
    <li className="flex items-stretch gap-3 rounded-lg border border-[var(--m-border-soft)] bg-white hover:border-[var(--m-border)] transition overflow-hidden">
      <span className="w-1 shrink-0" style={{ background: 'var(--m-accent)' }} />
      <div className="shrink-0 w-16 py-2 text-right">
        <p className="text-[12.5px] font-semibold text-[var(--m-ink)] tabular-nums leading-tight">{fmtClock(start)}</p>
        <p className="text-[10.5px] text-[var(--m-ink-4)] tabular-nums">{showDate ? fmtDay(start) : `${mins}m`}</p>
      </div>
      <div className="min-w-0 flex-1 py-2">
        <p className="text-[13px] font-medium text-[var(--m-ink)] truncate">{m.title}</p>
        <p className="text-[11px] text-[var(--m-ink-4)] truncate">
          {m.attendeeCount > 0 ? `${m.attendeeCount} attendee${m.attendeeCount === 1 ? '' : 's'}` : 'No attendees'}
          {m.location ? ` · ${m.location}` : ''}
        </p>
      </div>
      <div className="shrink-0 flex items-center gap-2 pr-3">
        {rsvp && (
          <span
            className={`text-[9.5px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded ${
              rsvp === 'accepted' ? 'bg-[var(--m-good-soft)] text-[var(--m-good)]' : rsvp === 'declined' ? 'bg-[var(--m-bad-soft)] text-[var(--m-bad)]' : 'bg-[var(--m-warn-soft)] text-[var(--m-warn)]'
            }`}
          >
            {rsvp === 'needsAction' ? 'no reply' : rsvp}
          </span>
        )}
        {m.conferenceUrl && (
          <a href={m.conferenceUrl} target="_blank" rel="noreferrer" className="text-[11.5px] font-medium text-[var(--m-accent)] hover:text-[var(--m-accent-2)]">
            Join →
          </a>
        )}
      </div>
    </li>
  )
}

function MiniEmpty({ text, onSchedule }: { text: string; onSchedule: () => void }) {
  return (
    <div className="flex items-center justify-between gap-3 py-1">
      <p className="text-[12.5px] text-[var(--m-ink-3)]">{text}</p>
      <button type="button" onClick={onSchedule} className="text-[11.5px] font-medium text-[var(--m-accent)] hover:text-[var(--m-accent-2)] shrink-0">
        + Schedule
      </button>
    </div>
  )
}

function TeammatePicker({
  open,
  teammates,
  onClose,
  onPick,
}: {
  open: boolean
  teammates: Teammate[]
  onClose: () => void
  onPick: (t: Teammate) => void
}) {
  const [q, setQ] = useState('')
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])
  const filtered = useMemo(() => teammates.filter((t) => t.name.toLowerCase().includes(q.toLowerCase())), [teammates, q])
  // Portal to <body> — rendered inline it inherits the page's `.fade-in`
  // transform, which becomes the containing block for `position: fixed` and
  // clips the overlay into that boxed, dark-edged rectangle.
  if (!open || !mounted) return null
  return createPortal(
    <div className="fixed inset-0 z-[120] flex items-center justify-center px-4 bg-slate-900/40" onClick={onClose}>
      <div className="w-full max-w-sm bg-white rounded-2xl shadow-xl p-4" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-[14px] font-semibold text-[var(--m-ink)]">Schedule with…</h3>
          <button onClick={onClose} aria-label="Close" className="text-[var(--m-ink-4)] hover:text-[var(--m-ink)]">✕</button>
        </div>
        <input
          autoFocus
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search teammates…"
          className="input w-full mb-2"
        />
        <div className="max-h-72 overflow-y-auto space-y-0.5">
          {filtered.length === 0 ? (
            <p className="text-[12px] text-[var(--m-ink-3)] italic py-2 px-1">No teammates match.</p>
          ) : (
            filtered.map((t) => (
              <button
                key={t.membershipId}
                type="button"
                onClick={() => onPick(t)}
                className="w-full text-left px-3 py-2 rounded-lg hover:bg-[var(--m-bg-soft)] text-[13px] text-[var(--m-ink)] transition"
              >
                {t.name}
              </button>
            ))
          )}
        </div>
      </div>
    </div>,
    document.body,
  )
}

function fmtClock(d: Date): string {
  return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
}
function fmtDay(d: Date): string {
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' })
}
