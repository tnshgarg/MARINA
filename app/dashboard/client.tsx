'use client'

import { useEffect, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { StoryCard } from '@/components/story-card'

type EventDto = {
  id: number
  type: 'commit' | 'pr_opened' | 'pr_reviewed' | 'issue_closed'
  repo: string
  title: string
  url: string
  occurredAt: string
}

type NarrativeDto = {
  id: number
  body: string
  signal: 'High' | 'Steady' | 'Low' | 'Blocked'
  blockers: string[]
  provider: string
  model: string
  periodStart: string
  periodEnd: string
  createdAt: string
}

type ActiveBreak = { id: number; startedAt: string; reason: string } | null
type RecentBreak = { id: number; startedAt: string; endedAt: string | null; reason: string }
type LeaveDto = {
  id: number
  startDate: string
  endDate: string
  reason: string
  status: 'pending' | 'approved' | 'denied' | 'cancelled'
  decidedAt: string | null
  decidedNote: string | null
  createdAt: string
}

type TodaySummary = {
  activeSeconds: number
  idleSeconds: number
  sampleCount: number
  topApps: Array<{ app: string; seconds: number }>
}

type Props = {
  orgId: number | null
  initialEvents: EventDto[]
  initialNarrative: NarrativeDto | null
  periodStart: string
  periodEnd: string
  today: TodaySummary
  paused: boolean
  activeBreak: ActiveBreak
  recentBreaks: RecentBreak[]
  myLeaves: LeaveDto[]
}

const SIGNAL_PILL: Record<NarrativeDto['signal'], string> = {
  High: 'pill-good',
  Steady: 'pill-info',
  Low: 'pill-warn',
  Blocked: 'pill-bad',
}

const TYPE_LABEL: Record<EventDto['type'], string> = {
  commit: 'commit',
  pr_opened: 'PR opened',
  pr_reviewed: 'review',
  issue_closed: 'issue closed',
}
const TYPE_PILL: Record<EventDto['type'], string> = {
  commit: 'pill-info',
  pr_opened: 'pill-violet',
  pr_reviewed: 'pill-good',
  issue_closed: 'pill-pink',
}

const LEAVE_PILL: Record<LeaveDto['status'], string> = {
  pending: 'pill-warn',
  approved: 'pill-good',
  denied: 'pill-bad',
  cancelled: 'pill-slate',
}

export default function DashboardClient({
  orgId,
  initialEvents,
  initialNarrative,
  periodEnd,
  today,
  paused,
  activeBreak,
  recentBreaks,
  myLeaves,
}: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [provider, setProvider] = useState<'groq' | 'openai'>(
    (process.env.NEXT_PUBLIC_DEFAULT_AI_PROVIDER as 'groq' | 'openai') || 'groq'
  )
  const [narrative, setNarrative] = useState<NarrativeDto | null>(initialNarrative)

  // Break modal state
  const [breakOpen, setBreakOpen] = useState(false)
  const [breakReason, setBreakReason] = useState('')

  // Leave modal state
  const [leaveOpen, setLeaveOpen] = useState(false)
  const [leaveStart, setLeaveStart] = useState('')
  const [leaveEnd, setLeaveEnd] = useState('')
  const [leaveReason, setLeaveReason] = useState('')
  const [leaveType, setLeaveType] = useState<string>('casual')

  // Live timer for active break
  const [breakElapsed, setBreakElapsed] = useState(0)
  useEffect(() => {
    if (!activeBreak) return
    const tick = () => setBreakElapsed(Math.floor((Date.now() - new Date(activeBreak.startedAt).getTime()) / 1000))
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [activeBreak])

  async function runSync() {
    setBusy('sync')
    setError(null)
    try {
      const res = await fetch('/api/sync/github', { method: 'POST' })
      const data = await res.json()
      if (!res.ok) throw new Error(data?.message || data?.error || 'sync failed')
      startTransition(() => router.refresh())
    } catch (e) {
      setError(String(e))
    } finally {
      setBusy(null)
    }
  }

  async function runNarrative() {
    setBusy('narrative')
    setError(null)
    try {
      const res = await fetch(`/api/narrative?provider=${provider}`, { method: 'POST' })
      const data = await res.json()
      if (!res.ok) throw new Error(data?.message || data?.error || 'narrative failed')
      setNarrative(data.narrative)
    } catch (e) {
      setError(String(e))
    } finally {
      setBusy(null)
    }
  }

  async function startBreak() {
    if (breakReason.trim().length === 0) return
    setBusy('break-start')
    setError(null)
    try {
      const res = await fetch('/api/me/breaks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: breakReason, orgId }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data?.error || 'failed')
      setBreakOpen(false)
      setBreakReason('')
      router.refresh()
    } catch (e) {
      setError(String(e))
    } finally {
      setBusy(null)
    }
  }

  async function endBreak() {
    if (!activeBreak) return
    setBusy('break-end')
    setError(null)
    try {
      const res = await fetch(`/api/me/breaks/${activeBreak.id}`, { method: 'PATCH' })
      const data = await res.json()
      if (!res.ok) throw new Error(data?.error || 'failed')
      router.refresh()
    } catch (e) {
      setError(String(e))
    } finally {
      setBusy(null)
    }
  }

  async function submitLeave() {
    if (!orgId) {
      setError('No team selected — accept a team invite first.')
      return
    }
    if (!leaveStart || !leaveEnd || leaveReason.trim().length === 0) return
    setBusy('leave-submit')
    setError(null)
    try {
      const res = await fetch('/api/me/leaves', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orgId,
          startDate: leaveStart,
          endDate: leaveEnd,
          reason: leaveReason,
          leaveType,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data?.error || 'failed')
      setLeaveOpen(false)
      setLeaveStart('')
      setLeaveEnd('')
      setLeaveReason('')
      router.refresh()
    } catch (e) {
      setError(String(e))
    } finally {
      setBusy(null)
    }
  }

  async function cancelLeave(id: number) {
    if (!confirm('Cancel this leave request?')) return
    setBusy(`leave-cancel-${id}`)
    try {
      const res = await fetch(`/api/me/leaves/${id}`, { method: 'DELETE' })
      const data = await res.json()
      if (!res.ok) throw new Error(data?.error || 'failed')
      router.refresh()
    } catch (e) {
      setError(String(e))
    } finally {
      setBusy(null)
    }
  }

  const onlineSeconds = today.activeSeconds + today.idleSeconds
  const idleRatio = onlineSeconds > 0 ? today.idleSeconds / onlineSeconds : 0
  const workPct = onlineSeconds > 0 ? Math.round((today.activeSeconds / onlineSeconds) * 100) : 0
  const totals = countByType(initialEvents)
  const todayDateStr = new Date().toISOString().slice(0, 10)

  return (
    <div className="max-w-6xl mx-auto px-6 py-8 grid gap-6 grid-cols-12">
      {/* Active break banner */}
      {activeBreak && (
        <div className="col-span-12 app-card app-card-lg" style={{ background: '#fffbeb', borderColor: '#fde68a' }}>
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div>
              <p className="app-eyebrow" style={{ color: '#b45309' }}>You&apos;re on break</p>
              <p className="app-h2 mt-1">{formatElapsed(breakElapsed)}</p>
              <p className="app-sub mt-1">Reason: {activeBreak.reason}</p>
            </div>
            <button onClick={endBreak} disabled={busy === 'break-end'} className="btn-primary">
              {busy === 'break-end' ? 'Ending…' : 'End break'}
            </button>
          </div>
        </div>
      )}

      {/* Main column */}
      <div className="col-span-12 lg:col-span-8 space-y-6">
        {/* AI Story */}
        <StoryCard endpoint="/api/me/story" />

        {/* Today summary */}
        <section className="app-card app-card-lg">
          <div className="section-title-row">
            <div>
              <h2 className="app-h2">Today</h2>
              <p className="app-sub mt-1">
                Mac agent telemetry
                {paused && <span className="pill pill-warn ml-2">Paused</span>}
              </p>
            </div>
          </div>
          {today.sampleCount === 0 ? (
            <p className="app-sub mt-4">
              No telemetry yet. Install & pair the Mac agent from Settings → Pair a Mac.
            </p>
          ) : (
            <>
              <div className="mt-4 grid grid-cols-3 gap-3">
                <Stat label="Online" value={fmt(onlineSeconds)} />
                <Stat label="Active" value={fmt(today.activeSeconds)} />
                <Stat label="Idle" value={`${fmt(today.idleSeconds)} · ${Math.round(idleRatio * 100)}%`} />
              </div>
              <div className="mt-4">
                <div className="flex items-center justify-between text-[12px] text-slate-600 mb-1">
                  <span>Focus</span>
                  <span className="font-medium text-slate-900">{workPct}%</span>
                </div>
                <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
                  <div
                    className="h-full rounded-full"
                    style={{ width: `${workPct}%`, background: 'linear-gradient(90deg, #38bdf8, #6366f1)' }}
                  />
                </div>
              </div>
            </>
          )}
          {today.topApps.length > 0 && (
            <div className="mt-5">
              <p className="app-eyebrow">Top apps</p>
              <ul className="mt-2 space-y-1.5">
                {today.topApps.map((a) => (
                  <li key={a.app} className="flex items-center justify-between text-[13px]">
                    <span className="text-slate-700 truncate">{a.app}</span>
                    <span className="text-slate-500">{fmt(a.seconds)}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>

        {/* Work narrative */}
        <section className="app-card app-card-lg">
          <div className="section-title-row flex-wrap gap-3">
            <div>
              <h2 className="app-h2">Work Narrative</h2>
              <p className="app-sub mt-1">Last 7 days · ending {new Date(periodEnd).toLocaleDateString()}</p>
            </div>
            <div className="flex items-center gap-2">
              <select
                value={provider}
                onChange={(e) => setProvider(e.target.value as 'groq' | 'openai')}
                className="select max-w-[180px]"
                disabled={busy !== null}
              >
                <option value="groq">Groq · Llama 3.3</option>
                <option value="openai">OpenAI · 4o-mini</option>
              </select>
              <button onClick={runNarrative} disabled={busy !== null || isPending} className="btn-primary">
                {busy === 'narrative' ? 'Generating…' : 'Generate'}
              </button>
            </div>
          </div>
          {narrative ? (
            <div className="mt-4 space-y-3">
              <span className={`pill ${SIGNAL_PILL[narrative.signal]}`}>Signal · {narrative.signal}</span>
              <p className="text-[14px] text-slate-800 leading-relaxed whitespace-pre-line">{narrative.body}</p>
              {narrative.blockers.length > 0 && (
                <div>
                  <p className="app-eyebrow">Possible blockers</p>
                  <ul className="mt-1 list-disc pl-5 text-[13px] text-slate-700 space-y-0.5">
                    {narrative.blockers.map((b, i) => (
                      <li key={i}>{b}</li>
                    ))}
                  </ul>
                </div>
              )}
              <p className="text-[11px] text-slate-500">
                {narrative.provider} · {narrative.model} · {new Date(narrative.createdAt).toLocaleString()}
              </p>
            </div>
          ) : (
            <p className="app-sub mt-4">No narrative yet. Sync GitHub then click Generate.</p>
          )}
        </section>

        {/* Recent activity */}
        <section className="app-card app-card-lg">
          <div className="section-title-row">
            <h2 className="app-h2">Recent activity</h2>
            <span className="text-[12px] text-slate-500">{initialEvents.length} events · 7d</span>
          </div>
          {initialEvents.length === 0 ? (
            <p className="app-sub mt-4">No events synced yet.</p>
          ) : (
            <ul className="mt-3 divide-y divide-slate-100">
              {initialEvents.slice(0, 12).map((e) => (
                <li key={e.id} className="py-2.5 flex items-start gap-3">
                  <span className={`pill ${TYPE_PILL[e.type]}`}>{TYPE_LABEL[e.type]}</span>
                  <div className="flex-1 min-w-0">
                    <a
                      href={e.url}
                      target="_blank"
                      rel="noreferrer"
                      className="text-[14px] text-slate-900 hover:text-indigo-600 line-clamp-2"
                    >
                      {e.title}
                    </a>
                    <p className="text-[12px] text-slate-500">
                      {e.repo} · {new Date(e.occurredAt).toLocaleString()}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      {/* Right rail */}
      <aside className="col-span-12 lg:col-span-4 space-y-6">
        {/* Actions */}
        <section className="app-card app-card-lg">
          <h3 className="app-h2">Quick actions</h3>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <button onClick={runSync} disabled={busy !== null} className="btn-secondary justify-center">
              {busy === 'sync' ? 'Syncing…' : '⟳ Sync GitHub'}
            </button>
            {!activeBreak && (
              <button onClick={() => setBreakOpen(true)} disabled={busy !== null} className="btn-secondary justify-center">
                ☕ Take a break
              </button>
            )}
            <button
              onClick={() => setLeaveOpen(true)}
              disabled={busy !== null || !orgId}
              className="btn-secondary col-span-2 justify-center"
              title={!orgId ? 'Join an org first' : undefined}
            >
              🌴 Request leave
            </button>
          </div>
          {error && <p className="mt-3 text-[12px] text-rose-600">{error}</p>}
        </section>

        {/* My leaves */}
        <section className="app-card app-card-lg">
          <div className="section-title-row">
            <h3 className="app-h2">My leave requests</h3>
            <span className="text-[12px] text-slate-500">{myLeaves.length}</span>
          </div>
          {myLeaves.length === 0 ? (
            <p className="app-sub mt-3">No requests on file.</p>
          ) : (
            <ul className="mt-3 space-y-3">
              {myLeaves.slice(0, 4).map((l) => (
                <li key={l.id} className="rounded-xl border border-slate-100 p-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className={`pill ${LEAVE_PILL[l.status]}`}>{l.status}</span>
                    {l.status === 'pending' && (
                      <button
                        onClick={() => cancelLeave(l.id)}
                        disabled={busy === `leave-cancel-${l.id}`}
                        className="text-[11px] text-slate-500 hover:text-rose-600"
                      >
                        Cancel
                      </button>
                    )}
                  </div>
                  <p className="text-[13px] text-slate-900 mt-1.5 font-medium">
                    {fmtDateRange(l.startDate, l.endDate)}
                  </p>
                  <p className="text-[12px] text-slate-600 mt-0.5">{l.reason}</p>
                  {l.decidedNote && (
                    <p className="text-[11px] text-slate-500 mt-1">Manager: {l.decidedNote}</p>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* Recent breaks */}
        <section className="app-card app-card-lg">
          <h3 className="app-h2">Recent breaks</h3>
          {recentBreaks.length === 0 ? (
            <p className="app-sub mt-3">No breaks logged.</p>
          ) : (
            <ul className="mt-3 space-y-2">
              {recentBreaks.map((b) => (
                <li key={b.id} className="text-[12px] text-slate-600">
                  <span className="text-slate-900 font-medium">
                    {new Date(b.startedAt).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}
                  </span>{' '}
                  · {b.endedAt ? duration(b.startedAt, b.endedAt) : 'ongoing'} ·{' '}
                  {b.reason.slice(0, 60)}
                  {b.reason.length > 60 ? '…' : ''}
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* Stats */}
        <section className="app-card app-card-lg">
          <h3 className="app-h2">7d stats</h3>
          <dl className="mt-3 space-y-1.5 text-[13px]">
            <Row label="Commits" value={totals.commit} />
            <Row label="PRs opened" value={totals.pr_opened} />
            <Row label="Reviews given" value={totals.pr_reviewed} />
            <Row label="Issues closed" value={totals.issue_closed} />
          </dl>
        </section>
      </aside>

      {/* Break Modal */}
      {breakOpen && (
        <Modal onClose={() => setBreakOpen(false)} title="Take a break">
          <p className="app-sub mb-3">
            Let your team know what&apos;s pulling you away. HR will see your reason.
          </p>
          <textarea
            className="textarea"
            placeholder="e.g. Waiting on deployment approval from DevOps · short lunch"
            value={breakReason}
            onChange={(e) => setBreakReason(e.target.value)}
            maxLength={500}
            autoFocus
          />
          <div className="mt-4 flex items-center justify-end gap-2">
            <button onClick={() => setBreakOpen(false)} className="btn-secondary">Cancel</button>
            <button
              onClick={startBreak}
              disabled={busy === 'break-start' || breakReason.trim().length === 0}
              className="btn-primary"
            >
              {busy === 'break-start' ? 'Starting…' : 'Start break'}
            </button>
          </div>
        </Modal>
      )}

      {/* Leave Modal */}
      {leaveOpen && (
        <Modal onClose={() => setLeaveOpen(false)} title="Request leave">
          <p className="app-sub mb-3">Pick the type, dates, and a quick note for your manager.</p>
          <label className="app-eyebrow block mb-1">Leave type</label>
          <select
            className="select"
            value={leaveType}
            onChange={(e) => setLeaveType(e.target.value)}
          >
            <option value="casual">Casual Leave</option>
            <option value="sick">Sick Leave</option>
            <option value="earned">Earned / Privileged Leave</option>
            <option value="compoff">Compensatory Off</option>
            <option value="maternity">Maternity Leave</option>
            <option value="paternity">Paternity Leave</option>
            <option value="bereavement">Bereavement Leave</option>
            <option value="unpaid">Unpaid Leave</option>
            <option value="other">Other</option>
          </select>
          <div className="grid grid-cols-2 gap-3 mt-3">
            <div>
              <label className="app-eyebrow block mb-1">From</label>
              <input
                type="date"
                className="input"
                value={leaveStart}
                min={todayDateStr}
                onChange={(e) => {
                  setLeaveStart(e.target.value)
                  if (leaveEnd && e.target.value > leaveEnd) setLeaveEnd(e.target.value)
                }}
              />
            </div>
            <div>
              <label className="app-eyebrow block mb-1">Until</label>
              <input
                type="date"
                className="input"
                value={leaveEnd}
                min={leaveStart || todayDateStr}
                onChange={(e) => setLeaveEnd(e.target.value)}
              />
            </div>
          </div>
          <label className="app-eyebrow block mt-3 mb-1">Reason</label>
          <textarea
            className="textarea"
            placeholder="e.g. Family function · personal day"
            value={leaveReason}
            onChange={(e) => setLeaveReason(e.target.value)}
            maxLength={500}
          />
          <div className="mt-4 flex items-center justify-end gap-2">
            <button onClick={() => setLeaveOpen(false)} className="btn-secondary">Cancel</button>
            <button
              onClick={submitLeave}
              disabled={
                busy === 'leave-submit' ||
                !leaveStart ||
                !leaveEnd ||
                leaveReason.trim().length === 0
              }
              className="btn-primary"
            >
              {busy === 'leave-submit' ? 'Submitting…' : 'Submit request'}
            </button>
          </div>
        </Modal>
      )}
    </div>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-slate-100 bg-slate-50 px-3 py-2">
      <p className="text-[11px] text-slate-500 uppercase tracking-wider font-medium">{label}</p>
      <p className="mt-0.5 text-[14px] font-semibold text-slate-900">{value}</p>
    </div>
  )
}

function Row({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-center justify-between">
      <dt className="text-slate-600">{label}</dt>
      <dd className="font-medium text-slate-900">{value}</dd>
    </div>
  )
}

function Modal({
  children,
  title,
  onClose,
}: {
  children: React.ReactNode
  title: string
  onClose: () => void
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center px-4 bg-slate-900/30 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md bg-white rounded-2xl shadow-xl p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-2">
          <h2 className="app-h2">{title}</h2>
          <button onClick={onClose} aria-label="Close" className="btn-ghost">✕</button>
        </div>
        {children}
      </div>
    </div>
  )
}

function countByType(events: EventDto[]) {
  const base = { commit: 0, pr_opened: 0, pr_reviewed: 0, issue_closed: 0 }
  for (const e of events) base[e.type]++
  return base
}

function fmt(seconds: number): string {
  if (seconds <= 0) return '0m'
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  if (h > 0) return `${h}h ${m}m`
  return `${m}m`
}

function duration(startIso: string, endIso: string): string {
  const ms = new Date(endIso).getTime() - new Date(startIso).getTime()
  const m = Math.max(1, Math.round(ms / 60000))
  if (m < 60) return `${m}m`
  return `${Math.floor(m / 60)}h ${m % 60}m`
}

function formatElapsed(seconds: number): string {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = seconds % 60
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
  return `${m}:${String(s).padStart(2, '0')}`
}

function fmtDateRange(start: string, end: string): string {
  const s = new Date(start + 'T00:00:00')
  const e = new Date(end + 'T00:00:00')
  const sameMonth = s.getMonth() === e.getMonth() && s.getFullYear() === e.getFullYear()
  const fmtD = (d: Date, withMonth: boolean) =>
    d.toLocaleDateString(undefined, withMonth ? { day: 'numeric', month: 'short' } : { day: 'numeric' })
  const days = Math.round((e.getTime() - s.getTime()) / (24 * 60 * 60 * 1000)) + 1
  const label = start === end ? fmtD(s, true) : `${fmtD(s, !sameMonth)} – ${fmtD(e, true)}`
  return `${label} · ${days}d`
}
