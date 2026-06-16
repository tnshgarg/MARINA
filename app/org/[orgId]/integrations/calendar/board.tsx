'use client'

import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'

export type CalPerson = {
  id: number
  name: string
  count: number
  withPeople: string[]
  meetings: Array<{ title: string; startAt: string }>
  total: number
}

function fmt(iso: string) {
  const d = new Date(iso)
  return d.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' }) + ' · ' + d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
}
function fmtShort(iso: string) {
  const d = new Date(iso)
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' }) + ' · ' + d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
}

export default function CalendarBoard({ people }: { people: CalPerson[] }) {
  const [sort, setSort] = useState<'meetings' | 'name'>('meetings')
  const [selected, setSelected] = useState<CalPerson | null>(null)
  const shown = useMemo(
    () => [...people].sort((a, b) => (sort === 'meetings' ? b.count - a.count : a.name.localeCompare(b.name))),
    [people, sort],
  )

  return (
    <div>
      <div className="flex items-center justify-between gap-2 mb-2.5 flex-wrap">
        <p className="text-[11.5px] text-[var(--m-ink-4)]">{shown.length} people with meetings · ±14 days</p>
        <div className="inline-flex rounded-lg border border-[var(--m-border)] overflow-hidden text-[11.5px]">
          {(['meetings', 'name'] as const).map((s, i) => (
            <button
              key={s}
              type="button"
              onClick={() => setSort(s)}
              className={`px-2.5 py-1 transition ${i ? 'border-l border-[var(--m-border)]' : ''} ${
                sort === s ? 'bg-[var(--m-accent-soft)] text-[var(--m-accent-2)] font-medium' : 'text-[var(--m-ink-3)] hover:bg-[var(--m-bg-soft)]'
              }`}
            >
              {s === 'meetings' ? 'Most meetings' : 'A–Z'}
            </button>
          ))}
        </div>
      </div>

      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {shown.map((p) => (
          <button
            key={p.id}
            type="button"
            onClick={() => setSelected(p)}
            className="text-left rounded-xl border border-[var(--m-border)] bg-white p-3.5 hover:border-[var(--m-ink-5)] hover:shadow-[var(--m-shadow-sm)] transition"
          >
            <div className="flex items-baseline justify-between gap-2">
              <p className="text-[13px] font-semibold text-[var(--m-ink)] truncate">{p.name}</p>
              <span className="shrink-0 text-[10px] text-[var(--m-ink-4)] tabular-nums">{p.count} mtg{p.count === 1 ? '' : 's'}</span>
            </div>

            {p.withPeople.length > 0 && (
              <p className="mt-1.5 text-[11.5px] text-[var(--m-ink-3)] truncate">
                <span className="text-[var(--m-accent-2)] font-medium">Meeting with</span> → {p.withPeople.slice(0, 4).join(', ')}
                {p.withPeople.length > 4 ? ` +${p.withPeople.length - 4}` : ''}
              </p>
            )}

            {p.meetings.length > 0 && (
              <ul className="mt-2.5 pt-2.5 border-t border-[var(--m-border-soft)] space-y-1">
                {p.meetings.slice(0, 3).map((m, i) => (
                  <li key={i}>
                    <p className="text-[12px] text-[var(--m-ink)] truncate">▸ {m.title}</p>
                    <p className="text-[10.5px] text-[var(--m-ink-4)] tabular-nums">{fmtShort(m.startAt)}</p>
                  </li>
                ))}
                {p.meetings.length > 3 && (
                  <li className="text-[11px] font-medium text-[var(--m-accent)]">+{p.meetings.length - 3} more — view schedule →</li>
                )}
              </ul>
            )}
          </button>
        ))}
      </div>

      <ScheduleModal person={selected} onClose={() => setSelected(null)} />
    </div>
  )
}

function ScheduleModal({ person, onClose }: { person: CalPerson | null; onClose: () => void }) {
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])
  if (!person || !mounted) return null
  const now = Date.now()
  const upcoming = person.meetings.filter((m) => new Date(m.startAt).getTime() >= now)
  const past = person.meetings.filter((m) => new Date(m.startAt).getTime() < now)
  return createPortal(
    <div className="fixed inset-0 z-[120] flex items-center justify-center px-4 bg-[var(--m-ink)]/40" onClick={onClose}>
      <div className="w-full max-w-md max-h-[85vh] overflow-y-auto bg-white rounded-2xl shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="sticky top-0 bg-white px-5 py-3.5 border-b border-[var(--m-border)] flex items-start justify-between gap-3">
          <div>
            <p className="text-[15px] font-semibold text-[var(--m-ink)]">{person.name}</p>
            <p className="text-[11.5px] text-[var(--m-ink-4)]">{person.count} meeting{person.count === 1 ? '' : 's'} · ±14 days</p>
          </div>
          <button onClick={onClose} aria-label="Close" className="shrink-0 text-[var(--m-ink-4)] hover:text-[var(--m-ink)] text-[15px]">✕</button>
        </div>
        <div className="px-5 py-4 space-y-4">
          {person.withPeople.length > 0 && (
            <div>
              <h4 className="text-[10.5px] uppercase tracking-wider font-semibold text-[var(--m-ink-4)] mb-1.5">Meeting with</h4>
              <div className="flex flex-wrap gap-1.5">
                {person.withPeople.map((n, i) => (
                  <span key={i} className="text-[11.5px] rounded-md bg-[var(--m-accent-soft)] text-[var(--m-accent-2)] px-2 py-0.5">{n}</span>
                ))}
              </div>
            </div>
          )}
          {upcoming.length > 0 && (
            <div>
              <h4 className="text-[10.5px] uppercase tracking-wider font-semibold text-[var(--m-ink-4)] mb-1.5">Upcoming</h4>
              <ul className="space-y-2">
                {upcoming.map((m, i) => (
                  <li key={i} className="flex items-baseline gap-3">
                    <span className="shrink-0 w-32 text-[11px] text-[var(--m-ink-4)] tabular-nums">{fmt(m.startAt)}</span>
                    <span className="text-[12.5px] text-[var(--m-ink)]">{m.title}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {past.length > 0 && (
            <div>
              <h4 className="text-[10.5px] uppercase tracking-wider font-semibold text-[var(--m-ink-4)] mb-1.5">Earlier</h4>
              <ul className="space-y-2 opacity-75">
                {past.map((m, i) => (
                  <li key={i} className="flex items-baseline gap-3">
                    <span className="shrink-0 w-32 text-[11px] text-[var(--m-ink-4)] tabular-nums">{fmt(m.startAt)}</span>
                    <span className="text-[12.5px] text-[var(--m-ink-2)]">{m.title}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body,
  )
}
