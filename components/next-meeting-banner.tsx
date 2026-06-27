'use client'

import type { MeetingCard } from '@/lib/meetings/upcoming'

/**
 * Top-of-dashboard banner for the next team meeting. Shown on both the employee
 * and manager dashboards. Formats the time in the viewer's local timezone and
 * surfaces a one-click Join when there's a conference link.
 */
export function NextMeetingBanner({ meeting }: { meeting: MeetingCard | null }) {
  if (!meeting) return null

  const start = new Date(meeting.startAt)
  const now = new Date()
  const mins = Math.round((start.getTime() - now.getTime()) / 60000)
  const soon = mins <= 15 && mins >= -5 // joinable window

  const when = relativeWhen(start, mins)

  return (
    <div
      className={`rounded-xl border px-4 py-3 flex items-center gap-3 flex-wrap ${
        soon
          ? 'border-[var(--m-accent)]/50 bg-[var(--m-accent-soft)]'
          : 'border-[var(--m-border)] bg-white'
      }`}
    >
      <span className="shrink-0 w-9 h-9 rounded-lg bg-[var(--m-accent)] text-white inline-flex items-center justify-center">
        <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" aria-hidden>
          <rect x="3" y="4.5" width="18" height="16" rx="2" />
          <path d="M3 9h18M8 3v3M16 3v3" />
        </svg>
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-[11px] uppercase tracking-wider text-[var(--m-accent-2)] font-semibold">
          {soon ? 'Meeting starting soon' : 'Next meeting'}
        </p>
        <p className="text-[13.5px] font-semibold text-[var(--m-ink)] truncate">{meeting.title}</p>
        <p className="text-[12px] text-[var(--m-ink-3)]">{when}</p>
      </div>
      {meeting.conferenceUrl && (
        <a
          href={meeting.conferenceUrl}
          target="_blank"
          rel="noopener noreferrer"
          className={`shrink-0 inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[13px] font-medium transition-colors ${
            soon
              ? 'bg-[var(--m-accent)] text-white hover:bg-[var(--m-accent-2)]'
              : 'border border-[var(--m-border)] text-[var(--m-ink-2)] hover:border-[var(--m-accent)] hover:text-[var(--m-accent-2)]'
          }`}
        >
          <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden>
            <path d="M15 10l4.5-2.5v9L15 14M4 7h9a2 2 0 0 1 2 2v6a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2Z" strokeLinejoin="round" />
          </svg>
          Join
        </a>
      )}
    </div>
  )
}

function relativeWhen(start: Date, mins: number): string {
  const time = start.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
  if (mins < 0) return `Started ${Math.abs(mins)}m ago · ${time}`
  if (mins < 60) return `In ${mins}m · ${time}`
  const today = new Date()
  const sameDay = start.toDateString() === today.toDateString()
  const tomorrow = new Date(today.getTime() + 86400000)
  const isTomorrow = start.toDateString() === tomorrow.toDateString()
  if (sameDay) return `Today at ${time}`
  if (isTomorrow) return `Tomorrow at ${time}`
  return `${start.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })} at ${time}`
}
