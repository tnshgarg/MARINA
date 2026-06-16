'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { usePathname } from 'next/navigation'
import { useToast } from '@/components/toast'
import { ScheduleMeetingDialog } from '@/components/schedule-meeting-dialog'

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

  const weekCount = today.length + tomorrow.length + later.length

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
      <div className="max-w-2xl">
        <Header onSync={null} onSchedule={null} />
        <div className="rounded-xl border border-[var(--m-border)] bg-white p-6 text-center">
          <p className="text-[14px] font-medium text-[var(--m-ink)]">Connect your Google Calendar</p>
          <p className="mt-1.5 text-[12.5px] text-[var(--m-ink-3)] max-w-md mx-auto">
            Once connected, MARINA shows your meetings here, flags meeting overload, and lets you
            schedule 1:1s with anyone on the team — invite + Meet link included.
          </p>
          <a
            href={`/api/connect/google/start?return_to=${encodeURIComponent(pathname || `/org/${orgId}/integrations/calendar`)}`}
            className="mt-4 inline-flex px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-[13px] font-medium transition"
          >
            Connect Google Calendar
          </a>
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-3xl">
      <Header onSync={sync} syncing={syncing} onSchedule={() => setPickerOpen(true)} />

      <div className="flex flex-wrap gap-2 mb-5">
        <Stat value={today.length} label="today" />
        <Stat value={weekCount} label="upcoming" />
        <Stat value={pastCount} label="past (tracked)" />
      </div>

      <MeetingGroup title="Today" meetings={today} empty="No meetings today." />
      <MeetingGroup title="Tomorrow" meetings={tomorrow} empty="Nothing tomorrow." />
      {later.length > 0 && <MeetingGroup title="Upcoming" meetings={later} empty="" />}

      {pastRecent.length > 0 && (
        <section className="mt-6">
          <h2 className="text-[11px] uppercase tracking-wider font-semibold text-[var(--m-ink-4)] mb-2">
            Recent past meetings
          </h2>
          <div className="space-y-1.5 opacity-80">
            {pastRecent.map((m) => (
              <MeetingRow key={m.id} m={m} past />
            ))}
          </div>
        </section>
      )}

      {/* Schedule flow: pick a teammate, then the shared dialog. */}
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
        <ScheduleMeetingDialog
          open={!!attendee}
          onClose={() => setAttendee(null)}
          orgId={orgId}
          membershipId={attendee.membershipId}
          attendeeName={attendee.name}
        />
      )}
    </div>
  )
}

function Header({
  onSync,
  syncing,
  onSchedule,
}: {
  onSync: (() => void) | null
  syncing?: boolean
  onSchedule: (() => void) | null
}) {
  return (
    <div className="flex items-start justify-between gap-3 mb-4">
      <div>
        <h1 className="app-h1">Calendar</h1>
        <p className="mt-1 text-[13px] text-[var(--m-ink-3)]">
          Your meetings, focus load, and one-click scheduling.
        </p>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        {onSchedule && (
          <button
            type="button"
            onClick={onSchedule}
            className="px-3 py-1.5 rounded-md bg-[var(--m-ink)] hover:bg-[var(--m-ink-2)] text-white text-[12.5px] font-medium transition"
          >
            + Schedule meeting
          </button>
        )}
        {onSync && (
          <button
            type="button"
            onClick={onSync}
            disabled={syncing}
            className="px-3 py-1.5 rounded-md bg-white border border-[var(--m-border)] hover:bg-[var(--m-bg-soft)] text-[var(--m-ink-2)] text-[12.5px] font-medium disabled:opacity-50 transition"
          >
            {syncing ? 'Syncing…' : 'Sync now'}
          </button>
        )}
      </div>
    </div>
  )
}

function Stat({ value, label }: { value: number; label: string }) {
  return (
    <span className="inline-flex items-baseline gap-1.5 rounded-lg border border-[var(--m-border-soft)] bg-white px-3 py-1.5">
      <span className="text-[16px] font-semibold text-[var(--m-ink)] tabular-nums">{value}</span>
      <span className="text-[11px] text-[var(--m-ink-4)]">{label}</span>
    </span>
  )
}

function MeetingGroup({ title, meetings, empty }: { title: string; meetings: Meeting[]; empty: string }) {
  return (
    <section className="mb-5">
      <h2 className="text-[11px] uppercase tracking-wider font-semibold text-[var(--m-ink-4)] mb-2">{title}</h2>
      {meetings.length === 0 ? (
        empty ? <p className="text-[12.5px] text-[var(--m-ink-3)] italic">{empty}</p> : null
      ) : (
        <div className="space-y-1.5">
          {meetings.map((m) => (
            <MeetingRow key={m.id} m={m} />
          ))}
        </div>
      )}
    </section>
  )
}

function MeetingRow({ m, past }: { m: Meeting; past?: boolean }) {
  const start = new Date(m.startAt)
  const end = new Date(m.endAt)
  const mins = Math.max(0, Math.round((end.getTime() - start.getTime()) / 60000))
  const rsvp = m.rsvpStatus
  return (
    <div className="flex items-center gap-3 rounded-lg border border-[var(--m-border-soft)] bg-white px-3.5 py-2.5">
      <div className="shrink-0 w-16 text-right">
        <p className="text-[12.5px] font-semibold text-[var(--m-ink)] tabular-nums">{fmtClock(start)}</p>
        <p className="text-[10.5px] text-[var(--m-ink-4)] tabular-nums">{past ? fmtDay(start) : `${mins}m`}</p>
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-[13px] font-medium text-[var(--m-ink)] truncate">{m.title}</p>
        <p className="text-[11.5px] text-[var(--m-ink-4)] truncate">
          {m.attendeeCount > 0 ? `${m.attendeeCount} attendee${m.attendeeCount === 1 ? '' : 's'}` : 'No attendees'}
          {m.location ? ` · ${m.location}` : ''}
        </p>
      </div>
      {rsvp && !past && (
        <span
          className={`shrink-0 text-[10px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded ${
            rsvp === 'accepted'
              ? 'bg-emerald-100 text-emerald-700'
              : rsvp === 'declined'
                ? 'bg-rose-100 text-rose-700'
                : 'bg-amber-100 text-amber-700'
          }`}
        >
          {rsvp === 'needsAction' ? 'no reply' : rsvp}
        </span>
      )}
      {m.conferenceUrl && !past && (
        <a
          href={m.conferenceUrl}
          target="_blank"
          rel="noreferrer"
          className="shrink-0 text-[11.5px] font-medium text-[var(--m-accent)] hover:text-[var(--m-accent-2)]"
        >
          Join →
        </a>
      )}
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
  const filtered = useMemo(
    () => teammates.filter((t) => t.name.toLowerCase().includes(q.toLowerCase())),
    [teammates, q],
  )
  if (!open) return null
  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center px-4 bg-slate-900/40" onClick={onClose}>
      <div className="w-full max-w-sm bg-white rounded-2xl shadow-xl p-4" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-[14px] font-semibold text-[var(--m-ink)]">Schedule with…</h3>
          <button onClick={onClose} aria-label="Close" className="text-slate-400 hover:text-slate-700">✕</button>
        </div>
        <input
          autoFocus
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search teammates…"
          className="w-full text-[13px] border border-[var(--m-border)] rounded-lg px-3 py-2 mb-2 focus:outline-none focus:ring-2 focus:ring-[var(--m-accent)]/20"
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
    </div>
  )
}

function fmtClock(d: Date): string {
  return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
}
function fmtDay(d: Date): string {
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' })
}
