'use client'

import { useEffect, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { WelcomeTour } from '@/components/welcome-tour'
import { BlockerCoaching } from '@/components/blocker-coaching'
import { ProfileCompletionCard } from '@/components/profile-completion-card'
import { MeetingsPanel } from '@/components/meetings-panel'
import { LogDeliverableCard } from '@/components/log-deliverable-card'
import { YourDayCard } from '@/components/your-day-card'

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

type ActiveBreak = {
  id: number
  startedAt: string
  reason: string
  /** When the employee is in `blocked` we render a louder banner — they're
   * stuck waiting on someone, not just stepped out for coffee. */
  category: string
} | null
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
  userName: string
  hasAnyShift: boolean
  /** True if this user has linked GitHub. Different from "events.length > 0"
   * — an account can be linked but the sync hasn't run yet, or the linked
   * GitHub user has zero public activity. */
  githubLinked: boolean
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
  userName,
  hasAnyShift,
  githubLinked,
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
  const [, startTransition] = useTransition()
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  // AI provider is a server-side decision now — we don't surface which model
  // we're using to the user. They get the best available; the server picks.
  const [narrative] = useState<NarrativeDto | null>(initialNarrative)

  // Break modal state
  const [breakOpen, setBreakOpen] = useState(false)
  const [breakReason, setBreakReason] = useState('')

  // Leave modal state
  const [leaveOpen, setLeaveOpen] = useState(false)
  const [leaveStart, setLeaveStart] = useState('')
  const [leaveEnd, setLeaveEnd] = useState('')
  const [leaveReason, setLeaveReason] = useState('')
  const [leaveType, setLeaveType] = useState<string>('casual')
  const [leaveBalance, setLeaveBalance] = useState<
    { rows: { type: string; remaining: number; quota: number }[]; year: number } | null
  >(null)

  // Fetch the remaining allowance ONLY when the request-leave modal opens —
  // we deliberately don't show it on the dashboard (it nudges leave-taking).
  useEffect(() => {
    if (!leaveOpen || !orgId) return
    let cancelled = false
    void fetch(`/api/me/leave-balance?orgId=${orgId}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!cancelled && d && Array.isArray(d.rows)) setLeaveBalance(d)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [leaveOpen, orgId])

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
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6 sm:py-8 grid gap-5 sm:gap-6 grid-cols-12">
      {/* Active break banner. Blocked-category uses a louder red treatment
          and the primary action becomes "Mark blocker resolved" so the
          employee can clear their own state once unstuck — no need to wait
          for a manager to do it for them. */}
      {/* When the user is in a blocked break, surface any manager coaching
          (suggestions, notes, route-to-teammate notes) RIGHT under the
          break banner so it's the first thing they see. The card hides
          itself when there's nothing new in the thread. */}
      {activeBreak?.category === 'blocked' && <BlockerCoaching />}

      {/* People-care field self-fill — auto-hides once the user has set both
          their joining date and birthday. Keeps HR off the data-entry hook. */}
      <div className="col-span-12">
        <ProfileCompletionCard />
      </div>

      {activeBreak && (
        <div
          className="col-span-12 app-card app-card-lg"
          style={
            activeBreak.category === 'blocked'
              ? { background: 'rgba(179, 77, 77, 0.06)', borderColor: 'rgba(179, 77, 77, 0.3)' }
              : { background: '#fffbeb', borderColor: '#fde68a' }
          }
        >
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div className="min-w-0 flex-1">
              <p
                className="app-eyebrow"
                style={{ color: activeBreak.category === 'blocked' ? 'var(--m-bad)' : '#b45309' }}
              >
                {activeBreak.category === 'blocked' ? "You're blocked" : "You're on break"}
              </p>
              <p className="app-h2 mt-1 tabular-nums">{formatElapsed(breakElapsed)}</p>
              <p className="app-sub mt-1 truncate">Reason: {activeBreak.reason}</p>
            </div>
            <button
              onClick={endBreak}
              disabled={busy === 'break-end'}
              className="btn-primary shrink-0 whitespace-nowrap"
            >
              {busy === 'break-end'
                ? activeBreak.category === 'blocked' ? 'Resolving…' : 'Ending…'
                : activeBreak.category === 'blocked' ? "I'm unblocked" : 'End break'}
            </button>
          </div>
        </div>
      )}

      {/* Connect-GitHub banner. Shown to users who signed up via Google or
          magic-link and haven't linked GitHub yet — without this they
          have no way to surface "Connect" beyond the welcome tour, which
          they may dismiss before realising it's a one-click step. */}
      {!githubLinked && (
        <div className="col-span-12 app-card app-card-lg">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div className="min-w-0 flex-1">
              <p className="app-eyebrow">Linked accounts</p>
              <p className="font-display text-[20px] leading-tight text-[var(--m-ink)] mt-1.5">
                Connect GitHub to get credit for what you ship
              </p>
              <p className="app-sub mt-1.5 max-w-xl">
                MARINA reads your commits, PRs, and reviews so the AI can verify your work
                summaries. We never read code — only commit metadata and review actions.
              </p>
            </div>
            <a
              href="/api/auth/signin/github?callbackUrl=/dashboard"
              className="btn-primary shrink-0 whitespace-nowrap inline-flex items-center gap-2"
            >
              <svg viewBox="0 0 24 24" width={14} height={14} fill="currentColor" aria-hidden>
                <path d="M12 .5C5.65.5.5 5.65.5 12c0 5.08 3.29 9.39 7.86 10.91.58.1.79-.25.79-.56v-2.1c-3.2.7-3.88-1.36-3.88-1.36-.52-1.31-1.28-1.66-1.28-1.66-1.05-.72.08-.71.08-.71 1.16.08 1.77 1.19 1.77 1.19 1.03 1.77 2.7 1.26 3.36.96.1-.75.4-1.26.73-1.55-2.55-.29-5.23-1.28-5.23-5.7 0-1.26.45-2.29 1.19-3.1-.12-.29-.52-1.46.11-3.04 0 0 .97-.31 3.18 1.18A11 11 0 0 1 12 6.8c.98.01 1.97.13 2.89.39 2.2-1.49 3.17-1.18 3.17-1.18.64 1.58.24 2.75.12 3.04.74.81 1.19 1.84 1.19 3.1 0 4.43-2.69 5.41-5.25 5.69.41.36.78 1.07.78 2.15v3.19c0 .31.21.67.8.56C20.21 21.39 23.5 17.08 23.5 12 23.5 5.65 18.35.5 12 .5Z" />
              </svg>
              Connect GitHub
            </a>
          </div>
        </div>
      )}

      {/* Main column */}
      <div className="col-span-12 lg:col-span-8 space-y-6">
        {/* Welcome tour — hides itself once the user has real activity */}
        <WelcomeTour
          name={userName}
          orgId={orgId}
          hasGitHub={initialEvents.length > 0 || githubLinked}
          hasAgent={today.sampleCount > 0}
          hasActiveShift={hasAnyShift}
          hasLeavesOrBreaks={myLeaves.length > 0 || recentBreaks.length > 0}
          storyExists={!!narrative}
          onOpenBreak={() => setBreakOpen(true)}
          onOpenLeave={() => setLeaveOpen(true)}
          onRunSync={() => void runSync()}
        />

        {/* Real-time "Your day" card — replaces the static AI story which
            was stale by mid-day. Shows live productivity %, shipped count,
            meetings-remaining. Polls every 30s. */}
        <YourDayCard />

        {/* Mark work as done — universal output. Tip: ⌘⇧L in the desktop
            agent does the same thing without leaving your workflow. */}
        <LogDeliverableCard />

        {/* Telemetry & activity — collapsed by default. Only REAL, live data
            lives here now (today's tracked time + your recent GitHub). The old
            on-demand "7-day narrative" generator was removed — it read as
            gimmicky because it wasn't tied to anything happening right now. */}
        <details className="rounded-xl border border-[var(--m-border)] bg-white">
          <summary className="px-4 py-3 cursor-pointer text-[13px] font-medium text-[var(--m-ink)] select-none">
            Today&apos;s telemetry &amp; recent activity
          </summary>
          <div className="px-4 pb-4 space-y-4 border-t border-[var(--m-border-soft)] pt-4">
            {/* Today telemetry — single tight row */}
            {today.sampleCount > 0 && (
              <div>
                <div className="flex items-baseline justify-between mb-1">
                  <p className="app-eyebrow">Today's telemetry{paused && <span className="ml-2 text-[10px] text-amber-700 font-semibold">Paused</span>}</p>
                  <span className="text-[11.5px] text-[var(--m-ink-3)] tabular-nums">
                    Online {fmt(onlineSeconds)} · Active {fmt(today.activeSeconds)} · Idle {Math.round(idleRatio * 100)}%
                  </span>
                </div>
                <div className="h-1.5 rounded-full bg-[var(--m-bg-soft)] overflow-hidden">
                  <div
                    className="h-full rounded-full"
                    style={{ width: `${workPct}%`, background: 'linear-gradient(90deg, #38bdf8, #6366f1)' }}
                  />
                </div>
              </div>
            )}

            {/* Recent GitHub activity (engineering only, collapsed visually) */}
            {initialEvents.length > 0 && (
              <div>
                <p className="app-eyebrow mb-1.5">Recent GitHub · last 7 days</p>
                <ul className="space-y-1">
                  {initialEvents.slice(0, 8).map((e) => (
                    <li key={e.id} className="flex items-baseline gap-2 text-[12px]">
                      <span className={`pill ${TYPE_PILL[e.type]} text-[10px]`}>{TYPE_LABEL[e.type]}</span>
                      <a
                        href={e.url}
                        target="_blank"
                        rel="noreferrer"
                        className="text-[var(--m-ink)] hover:text-[var(--m-accent)] truncate"
                      >
                        {e.title}
                      </a>
                      <span className="ml-auto shrink-0 text-[10.5px] text-[var(--m-ink-4)]">{e.repo}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </details>
      </div>

      {/* Right rail */}
      <aside className="col-span-12 lg:col-span-4 space-y-6">
        <MeetingsPanel />

        {/* Actions */}
        <section className="app-card app-card-lg">
          <h3 className="app-h2">Quick actions</h3>
          <div className="mt-3 flex flex-col gap-2">
            <button
              onClick={runSync}
              disabled={busy !== null}
              className="btn-secondary justify-center whitespace-nowrap"
            >
              {busy === 'sync' ? 'Syncing…' : 'Sync GitHub'}
            </button>
            {!activeBreak && (
              <button
                onClick={() => setBreakOpen(true)}
                disabled={busy !== null}
                className="btn-secondary justify-center whitespace-nowrap"
              >
                Take a break
              </button>
            )}
            <button
              onClick={() => setLeaveOpen(true)}
              disabled={busy !== null || !orgId}
              className="btn-secondary justify-center whitespace-nowrap"
              title={!orgId ? 'Join an org first' : undefined}
            >
              Request leave
            </button>
          </div>
          {error && <p className="mt-3 text-[12px] text-rose-600">{error}</p>}
        </section>

        {/* My leaves */}
        <section className="app-card app-card-lg">
          <div className="section-title-row">
            <h3 className="app-h2">My leave requests</h3>
            <span className="text-[12px] text-[var(--m-ink-3)]">{myLeaves.length}</span>
          </div>
          {myLeaves.length === 0 ? (
            <p className="app-sub mt-3">No requests on file.</p>
          ) : (
            <ul className="mt-3 space-y-3">
              {myLeaves.slice(0, 4).map((l) => (
                <li key={l.id} className="rounded-xl border border-[var(--m-border-soft)] p-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className={`pill ${LEAVE_PILL[l.status]}`}>{l.status}</span>
                    {l.status === 'pending' && (
                      <button
                        onClick={() => cancelLeave(l.id)}
                        disabled={busy === `leave-cancel-${l.id}`}
                        className="text-[11px] text-[var(--m-ink-3)] hover:text-rose-600"
                      >
                        Cancel
                      </button>
                    )}
                  </div>
                  <p className="text-[13px] text-[var(--m-ink)] mt-1.5 font-medium">
                    {fmtDateRange(l.startDate, l.endDate)}
                  </p>
                  <p className="text-[12px] text-[var(--m-ink-2)] mt-0.5">{l.reason}</p>
                  {l.decidedNote && (
                    <p className="text-[11px] text-[var(--m-ink-3)] mt-1">Manager: {l.decidedNote}</p>
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
                <li key={b.id} className="text-[12px] text-[var(--m-ink-2)]">
                  <span className="text-[var(--m-ink)] font-medium">
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
          {leaveBalance && (() => {
            const row = leaveBalance.rows.find((r) => r.type === leaveType)
            return row ? (
              <p className="mt-1.5 text-[12px] text-[var(--m-ink-3)]">
                You have{' '}
                <span className="font-semibold text-[var(--m-ink)]">{row.remaining}</span> of {row.quota}{' '}
                {row.type} days left in {leaveBalance.year}.
              </p>
            ) : (
              <p className="mt-1.5 text-[12px] text-[var(--m-ink-4)]">
                This type has no fixed annual allowance.
              </p>
            )
          })()}
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
    <div className="rounded-xl border border-[var(--m-border-soft)] bg-[var(--m-bg-soft)] px-3 py-2">
      <p className="text-[11px] text-[var(--m-ink-3)] uppercase tracking-wider font-medium">{label}</p>
      <p className="mt-0.5 text-[14px] font-semibold text-[var(--m-ink)]">{value}</p>
    </div>
  )
}

function Row({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-center justify-between">
      <dt className="text-[var(--m-ink-2)]">{label}</dt>
      <dd className="font-medium text-[var(--m-ink)]">{value}</dd>
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
      className="fixed inset-0 z-50 flex items-center justify-center px-4 bg-[var(--m-ink)]/40"
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
  // Under an hour: m:ss live counter. Past that, drop to a readable "1h 24m"
  // form — once you're hours in, watching seconds tick gets noisy. Past 24h
  // we add a day prefix so "62:37:26" never happens.
  if (seconds < 60) return `${seconds}s`
  if (seconds < 3600) {
    const m = Math.floor(seconds / 60)
    const s = seconds % 60
    return `${m}:${String(s).padStart(2, '0')}`
  }
  const totalMin = Math.floor(seconds / 60)
  const days = Math.floor(totalMin / (60 * 24))
  const h = Math.floor((totalMin % (60 * 24)) / 60)
  const m = totalMin % 60
  if (days > 0) return `${days}d ${h}h ${m}m`
  return `${h}h ${m}m`
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
