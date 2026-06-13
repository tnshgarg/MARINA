'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { CharacterAvatar } from '@/components/character-avatar'
import { Modal } from '@/components/modal'

type Member = {
  userId: number
  login: string
  name: string | null
  characterKey: string | null
  joinedOnIso: string  // YYYY-MM-DD — earliest day this person should be tracked
}

type Shift = {
  id: number
  punchedInAt: string
  punchedOutAt: string | null
}

type Leave = {
  id: number
  startDate: string
  endDate: string
  leaveType: string
  reason: string
  status: 'pending' | 'approved' | 'denied' | 'cancelled'
}

type Holiday = { date: string; name: string; isOptional: boolean }

type DayKind = 'present' | 'absent' | 'leave' | 'holiday' | 'weekend' | 'future' | 'today-empty' | 'pre-join'

type DayCell = {
  date: string         // YYYY-MM-DD
  kind: DayKind
  detail?: string
  leave?: Leave
  holiday?: Holiday
  shiftMins?: number
}

const KIND_STYLE: Record<DayKind, { bg: string; fg: string; label: string }> = {
  present:     { bg: 'bg-emerald-50',  fg: 'text-emerald-700', label: 'Present'        },
  absent:      { bg: 'bg-rose-50',     fg: 'text-rose-700',    label: 'Absent'         },
  leave:       { bg: 'bg-amber-50',    fg: 'text-amber-700',   label: 'On leave'       },
  holiday:     { bg: 'bg-[var(--m-clay-soft)]',   fg: 'text-[var(--m-clay-deep)]',  label: 'Holiday'        },
  weekend:     { bg: 'bg-slate-50',    fg: 'text-slate-400',   label: 'Weekend'        },
  future:      { bg: 'bg-white',       fg: 'text-slate-300',   label: 'Upcoming'       },
  'today-empty': { bg: 'bg-white',     fg: 'text-slate-500',   label: 'Not yet logged' },
  'pre-join':  { bg: 'bg-white',       fg: 'text-slate-300',   label: 'Before joining' },
}

export default function AttendanceClient({
  orgId,
  month,
  members,
  selectedUserId,
  shifts,
  leaves,
  holidays,
}: {
  orgId: number
  month: string                    // YYYY-MM
  members: Member[]
  selectedUserId: number | null
  shifts: Shift[]
  leaves: Leave[]
  holidays: Holiday[]
}) {
  const router = useRouter()
  const [pickedDay, setPickedDay] = useState<DayCell | null>(null)

  const selectedMember = useMemo(
    () => members.find((m) => m.userId === selectedUserId) ?? null,
    [members, selectedUserId],
  )
  const cells = useMemo(
    () => buildCalendar(month, shifts, leaves, holidays, selectedMember?.joinedOnIso ?? null),
    [month, shifts, leaves, holidays, selectedMember],
  )

  const summary = useMemo(() => summarise(cells), [cells])

  const [yy, mm] = month.split('-').map(Number) as [number, number]
  const monthLabel = new Date(yy, mm - 1, 1).toLocaleString(undefined, {
    month: 'long',
    year: 'numeric',
  })

  function changeMonth(delta: number) {
    const d = new Date(yy, mm - 1 + delta, 1)
    const next = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    router.push(`/org/${orgId}/attendance?month=${next}${selectedUserId ? `&member=${selectedUserId}` : ''}`)
  }

  function selectMember(userId: number) {
    router.push(`/org/${orgId}/attendance?month=${month}&member=${userId}`)
  }

  return (
    <div className="grid grid-cols-12 gap-5">
      {/* Left: member list */}
      <aside className="col-span-12 md:col-span-3">
        <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
          <div className="px-3 py-2.5 border-b border-slate-100">
            <p className="text-[11.5px] uppercase tracking-wider font-semibold text-slate-500">Team</p>
          </div>
          {members.length === 0 ? (
            <p className="px-3 py-6 text-[12.5px] text-slate-500">No members yet.</p>
          ) : (
            <ul className="max-h-[420px] overflow-y-auto">
              {members.map((m) => {
                const active = m.userId === selectedUserId
                return (
                  <li key={m.userId}>
                    <button
                      type="button"
                      onClick={() => selectMember(m.userId)}
                      className={`w-full flex items-center gap-2 px-3 py-2 text-left transition ${
                        active ? 'bg-[var(--m-accent-soft)]/60 text-[var(--m-accent-2)]' : 'hover:bg-slate-50 text-slate-700'
                      }`}
                    >
                      <CharacterAvatar characterKey={m.characterKey} name={m.name} login={m.login} size={24} />
                      <span className="text-[12.5px] font-medium truncate">
                        {m.name ?? `@${m.login}`}
                      </span>
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      </aside>

      {/* Right: calendar */}
      <main className="col-span-12 md:col-span-9">
        <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => changeMonth(-1)}
                className="px-2 py-1 rounded-md hover:bg-slate-100 text-slate-600"
                aria-label="Previous month"
              >
                ‹
              </button>
              <h2 className="text-[14px] font-semibold text-slate-900 tabular-nums min-w-[140px] text-center">
                {monthLabel}
              </h2>
              <button
                type="button"
                onClick={() => changeMonth(1)}
                className="px-2 py-1 rounded-md hover:bg-slate-100 text-slate-600"
                aria-label="Next month"
              >
                ›
              </button>
            </div>
            <div className="flex items-center gap-3 text-[11.5px] text-slate-500 flex-wrap">
              <Counter n={summary.present} label="present" tone="emerald" />
              <Counter n={summary.leave} label="on leave" tone="amber" />
              <Counter n={summary.absent} label="absent" tone="rose" />
              <Counter n={summary.holiday} label="holiday" tone="violet" />
            </div>
          </div>

          <div className="p-4">
            {/* Day-of-week header */}
            <div className="grid grid-cols-7 gap-1.5 mb-1.5">
              {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((d) => (
                <div
                  key={d}
                  className="text-[10.5px] uppercase tracking-wider text-slate-400 font-semibold text-center"
                >
                  {d}
                </div>
              ))}
            </div>

            {/* Day cells */}
            <div className="grid grid-cols-7 gap-1.5">
              {cells.map((c, i) => {
                if (!c) return <div key={i} />
                const style = KIND_STYLE[c.kind]
                const isToday = c.date === todayIso()
                const day = Number(c.date.slice(-2))
                return (
                  <button
                    key={c.date}
                    type="button"
                    onClick={() => setPickedDay(c)}
                    className={`group relative h-16 rounded-lg border border-slate-100 ${style.bg} hover:border-slate-300 transition text-left p-1.5 flex flex-col justify-between focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--m-accent)]/30`}
                    title={style.label + (c.detail ? ` — ${c.detail}` : '')}
                  >
                    <span
                      className={`text-[11.5px] font-medium tabular-nums ${
                        isToday ? 'text-[var(--m-accent-2)]' : style.fg
                      }`}
                    >
                      {day}
                      {isToday && <span className="ml-0.5 text-[9px]">●</span>}
                    </span>
                    <span className={`text-[9.5px] font-medium uppercase tracking-wider ${style.fg}`}>
                      {c.kind === 'present' && c.shiftMins
                        ? fmtHm(c.shiftMins)
                        : c.kind === 'leave'
                          ? c.leave?.leaveType
                          : c.kind === 'holiday'
                            ? 'holiday'
                            : c.kind === 'absent'
                              ? 'absent'
                              : ''}
                    </span>
                  </button>
                )
              })}
            </div>
          </div>
        </div>

        <Legend />
      </main>

      <Modal
        open={pickedDay !== null}
        onClose={() => setPickedDay(null)}
        size="sm"
        title={pickedDay ? fmtDate(pickedDay.date) : ''}
        subtitle={pickedDay ? KIND_STYLE[pickedDay.kind].label : ''}
      >
        {pickedDay && <DayDetail cell={pickedDay} />}
      </Modal>
    </div>
  )
}

function DayDetail({ cell: c }: { cell: DayCell }) {
  if (c.kind === 'leave' && c.leave) {
    return (
      <div className="space-y-2 text-[13px] text-slate-700">
        <p>
          <span className="capitalize text-slate-900 font-medium">{c.leave.leaveType}</span> ·{' '}
          <span className={c.leave.status === 'approved' ? 'text-emerald-700' : 'text-amber-700'}>
            {c.leave.status}
          </span>
        </p>
        <p className="text-[12.5px] text-slate-600">{fmtDate(c.leave.startDate)} — {fmtDate(c.leave.endDate)}</p>
        {c.leave.reason && (
          <div className="mt-2 rounded-lg bg-slate-50 border border-slate-200 px-3 py-2 text-[12.5px] text-slate-700 leading-snug">
            {c.leave.reason}
          </div>
        )}
      </div>
    )
  }
  if (c.kind === 'holiday' && c.holiday) {
    return (
      <p className="text-[13px] text-slate-700">
        <span className="font-medium text-slate-900">{c.holiday.name}</span>
        {c.holiday.isOptional && <span className="ml-1.5 text-[11.5px] text-slate-500">(optional)</span>}
      </p>
    )
  }
  if (c.kind === 'present') {
    return (
      <p className="text-[13px] text-slate-700">
        On-shift {c.shiftMins ? `for ${fmtHm(c.shiftMins)}` : ''}
        {c.detail && <span className="text-slate-500"> · {c.detail}</span>}
      </p>
    )
  }
  if (c.kind === 'absent') {
    return (
      <p className="text-[13px] text-slate-700">
        No shift, no approved leave on this day.
      </p>
    )
  }
  if (c.kind === 'weekend') {
    return <p className="text-[13px] text-slate-500">Weekend — not a working day.</p>
  }
  if (c.kind === 'future') {
    return <p className="text-[13px] text-slate-500">Upcoming — nothing to report yet.</p>
  }
  return <p className="text-[13px] text-slate-500">Today — no shift logged yet.</p>
}

function Counter({
  n,
  label,
  tone,
}: {
  n: number
  label: string
  tone: 'emerald' | 'amber' | 'rose' | 'violet'
}) {
  const fg =
    tone === 'emerald' ? 'text-emerald-700'
    : tone === 'amber' ? 'text-amber-700'
    : tone === 'rose'  ? 'text-rose-700'
    : 'text-[var(--m-clay-deep)]'
  return (
    <span className="inline-flex items-baseline gap-1">
      <span className={`text-[13px] font-semibold tabular-nums ${fg}`}>{n}</span>
      <span>{label}</span>
    </span>
  )
}

function Legend() {
  return (
    <div className="mt-3 flex items-center gap-3 text-[11px] text-slate-500 flex-wrap">
      <Swatch className="bg-emerald-50" label="Present" />
      <Swatch className="bg-amber-50" label="On leave" />
      <Swatch className="bg-rose-50" label="Absent" />
      <Swatch className="bg-[var(--m-clay-soft)]" label="Holiday" />
      <Swatch className="bg-slate-50" label="Weekend" />
    </div>
  )
}

function Swatch({ className, label }: { className: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={`inline-block w-3 h-3 rounded border border-slate-200 ${className}`} />
      <span>{label}</span>
    </span>
  )
}

/* ---------- compute helpers ---------- */

function buildCalendar(
  month: string,
  shifts: Shift[],
  leaves: Leave[],
  holidays: Holiday[],
  joinedOnIso: string | null,
): (DayCell | null)[] {
  const [yy, mm] = month.split('-').map(Number) as [number, number]
  const first = new Date(yy, mm - 1, 1)
  const daysInMonth = new Date(yy, mm, 0).getDate()
  // Monday-first offset (so Mon=0 ... Sun=6)
  const offset = (first.getDay() + 6) % 7

  const holidaysByDate = new Map(holidays.map((h) => [h.date, h]))
  const approvedLeaves = leaves.filter((l) => l.status === 'approved')

  // Shift minutes per day
  const shiftMinsByDay = new Map<string, number>()
  for (const s of shifts) {
    const start = new Date(s.punchedInAt)
    const key = isoDay(start)
    const ended = s.punchedOutAt ? new Date(s.punchedOutAt) : new Date()
    const mins = Math.max(0, Math.round((ended.getTime() - start.getTime()) / 60000))
    shiftMinsByDay.set(key, (shiftMinsByDay.get(key) ?? 0) + mins)
  }

  const todayKey = todayIso()
  const todayDate = new Date(todayKey + 'T00:00:00').getTime()

  const cells: (DayCell | null)[] = []
  for (let i = 0; i < offset; i++) cells.push(null)

  for (let day = 1; day <= daysInMonth; day++) {
    const date = `${yy}-${String(mm).padStart(2, '0')}-${String(day).padStart(2, '0')}`
    const d = new Date(date + 'T00:00:00')
    const dow = d.getDay() // 0=Sun, 6=Sat
    const future = d.getTime() > todayDate
    const todayCell = date === todayKey

    let kind: DayKind = 'absent'
    let detail: string | undefined
    let leaveForDay: Leave | undefined
    const holiday = holidaysByDate.get(date)
    const shiftMins = shiftMinsByDay.get(date)

    if (future) {
      kind = 'future'
    } else if (joinedOnIso && date < joinedOnIso) {
      // Person wasn't in the company yet — don't count it against them.
      kind = 'pre-join'
    } else {
      // approved leave covering this date
      leaveForDay = approvedLeaves.find((l) => l.startDate <= date && l.endDate >= date)
      if (leaveForDay) {
        kind = 'leave'
        detail = leaveForDay.leaveType
      } else if (holiday) {
        kind = 'holiday'
        detail = holiday.name
      } else if (shiftMins && shiftMins > 0) {
        kind = 'present'
      } else if (dow === 0 || dow === 6) {
        kind = 'weekend'
      } else if (todayCell) {
        kind = 'today-empty'
      } else {
        kind = 'absent'
      }
    }

    cells.push({ date, kind, detail, leave: leaveForDay, holiday, shiftMins })
  }
  return cells
}

function summarise(cells: (DayCell | null)[]) {
  let present = 0, absent = 0, leave = 0, holiday = 0
  for (const c of cells) {
    if (!c) continue
    if (c.kind === 'present') present++
    else if (c.kind === 'absent') absent++
    else if (c.kind === 'leave') leave++
    else if (c.kind === 'holiday') holiday++
  }
  return { present, absent, leave, holiday }
}

function isoDay(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
function todayIso(): string {
  return isoDay(new Date())
}
function fmtDate(s: string): string {
  return new Date(s + 'T00:00:00').toLocaleDateString(undefined, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })
}
function fmtHm(mins: number): string {
  const h = Math.floor(mins / 60)
  const m = mins % 60
  if (h === 0) return `${m}m`
  return m === 0 ? `${h}h` : `${h}h ${m}m`
}
