'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'

/**
 * Compact employee day-controls: Take break, Mark blocked, Request leave —
 * plus the active break/blocked banner with an end/unblock action.
 *
 * Calls the existing endpoints:
 *   POST  /api/me/breaks      { reason, orgId, category? }   (category:'blocked' = blocker)
 *   PATCH /api/me/breaks/:id                                  (end / self-resolve)
 *   POST  /api/me/leaves      { orgId, leaveType, startDate, endDate, reason }
 *
 * Designed to live on the Overview (prominent buttons) — it owns its own modal
 * state so a parent server component just hands it the props it needs.
 */

type ActiveBreak = { id: number; startedAt: string; reason: string; category: string } | null

export function EmployeeActions({
  orgId,
  activeBreak,
  variant = 'inline',
}: {
  orgId: number | null
  activeBreak: ActiveBreak
  /** 'inline' = full button row + banner (Overview). 'banner' = banner only. */
  variant?: 'inline' | 'banner'
}) {
  const router = useRouter()
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  // Break / blocker modal
  const [breakOpen, setBreakOpen] = useState<null | 'break' | 'blocked'>(null)
  const [breakReason, setBreakReason] = useState('')

  // Leave modal
  const [leaveOpen, setLeaveOpen] = useState(false)
  const [leaveStart, setLeaveStart] = useState('')
  const [leaveEnd, setLeaveEnd] = useState('')
  const [leaveReason, setLeaveReason] = useState('')
  const [leaveType, setLeaveType] = useState('casual')
  const [leaveBalance, setLeaveBalance] = useState<
    { rows: { type: string; remaining: number; quota: number }[]; year: number } | null
  >(null)

  // Pull the remaining allowance only when the leave modal opens.
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

  // Live timer for the active break.
  const [breakElapsed, setBreakElapsed] = useState(0)
  useEffect(() => {
    if (!activeBreak) return
    const startMs = new Date(activeBreak.startedAt).getTime()
    const tick = () => setBreakElapsed(Math.floor((new Date().getTime() - startMs) / 1000))
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [activeBreak])

  async function startBreak(category: 'break' | 'blocked') {
    if (category === 'break' && breakReason.trim().length === 0) return
    setBusy('break-start')
    setError(null)
    try {
      const res = await fetch('/api/me/breaks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          reason: breakReason,
          orgId,
          category: category === 'blocked' ? 'blocked' : 'other',
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data?.error || 'failed')
      setBreakOpen(null)
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
        body: JSON.stringify({ orgId, startDate: leaveStart, endDate: leaveEnd, reason: leaveReason, leaveType }),
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

  const todayDateStr = new Date().toISOString().slice(0, 10)
  const isBlocked = activeBreak?.category === 'blocked'

  return (
    <div>
      {/* Active break / blocked banner */}
      {activeBreak && (
        <div
          className="app-card app-card-lg mb-3"
          style={
            isBlocked
              ? { background: 'rgba(179, 77, 77, 0.06)', borderColor: 'rgba(179, 77, 77, 0.3)' }
              : { background: '#fffbeb', borderColor: '#fde68a' }
          }
        >
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div className="min-w-0 flex-1">
              <p className="app-eyebrow" style={{ color: isBlocked ? 'var(--m-bad)' : '#b45309' }}>
                {isBlocked ? "You're blocked" : "You're on break"}
              </p>
              <p className="app-h2 mt-1 tabular-nums">{formatElapsed(breakElapsed)}</p>
              <p className="app-sub mt-1 truncate">Reason: {activeBreak.reason}</p>
            </div>
            <button onClick={endBreak} disabled={busy === 'break-end'} className="btn-primary shrink-0 whitespace-nowrap">
              {busy === 'break-end'
                ? isBlocked
                  ? 'Resolving…'
                  : 'Ending…'
                : isBlocked
                  ? "I'm unblocked"
                  : 'End break'}
            </button>
          </div>
        </div>
      )}

      {/* Action buttons — hidden in banner-only mode, or when already on a break. */}
      {variant === 'inline' && !activeBreak && (
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => {
              setBreakReason('')
              setBreakOpen('break')
            }}
            disabled={busy !== null}
            className="btn-secondary whitespace-nowrap"
          >
            Take a break
          </button>
          <button
            onClick={() => {
              setBreakReason('')
              setBreakOpen('blocked')
            }}
            disabled={busy !== null}
            className="btn-secondary whitespace-nowrap"
            title="You're stuck waiting on someone or something"
          >
            Mark blocked
          </button>
          <button
            onClick={() => setLeaveOpen(true)}
            disabled={busy !== null || !orgId}
            className="btn-secondary whitespace-nowrap"
            title={!orgId ? 'Join a team first' : undefined}
          >
            Request leave
          </button>
        </div>
      )}

      {error && <p className="mt-2 text-[12px] text-rose-600">{error}</p>}

      {/* Break / blocker modal */}
      {breakOpen && (
        <Modal onClose={() => setBreakOpen(null)} title={breakOpen === 'blocked' ? "Mark yourself blocked" : 'Take a break'}>
          <p className="app-sub mb-3">
            {breakOpen === 'blocked'
              ? "What's blocking you? Your manager sees this so they can help unstick you."
              : "Let your team know what's pulling you away. HR will see your reason."}
          </p>
          <textarea
            className="textarea"
            placeholder={
              breakOpen === 'blocked'
                ? 'e.g. Waiting on deployment approval from DevOps'
                : 'e.g. Short lunch · quick errand'
            }
            value={breakReason}
            onChange={(e) => setBreakReason(e.target.value)}
            maxLength={500}
            autoFocus
          />
          <div className="mt-4 flex items-center justify-end gap-2">
            <button onClick={() => setBreakOpen(null)} className="btn-secondary">
              Cancel
            </button>
            <button
              onClick={() => startBreak(breakOpen)}
              disabled={busy === 'break-start' || (breakOpen === 'break' && breakReason.trim().length === 0)}
              className="btn-primary"
            >
              {busy === 'break-start' ? 'Saving…' : breakOpen === 'blocked' ? "I'm blocked" : 'Start break'}
            </button>
          </div>
        </Modal>
      )}

      {/* Leave modal */}
      {leaveOpen && (
        <Modal onClose={() => setLeaveOpen(false)} title="Request leave">
          <p className="app-sub mb-3">Pick the type, dates, and a quick note for your manager.</p>
          <label className="app-eyebrow block mb-1">Leave type</label>
          <select className="select" value={leaveType} onChange={(e) => setLeaveType(e.target.value)}>
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
          {leaveBalance &&
            (() => {
              const row = leaveBalance.rows.find((r) => r.type === leaveType)
              return row ? (
                <p className="mt-1.5 text-[12px] text-[var(--m-ink-3)]">
                  You have <span className="font-semibold text-[var(--m-ink)]">{row.remaining}</span> of {row.quota}{' '}
                  {row.type} days left in {leaveBalance.year}.
                </p>
              ) : (
                <p className="mt-1.5 text-[12px] text-[var(--m-ink-4)]">This type has no fixed annual allowance.</p>
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
            <button onClick={() => setLeaveOpen(false)} className="btn-secondary">
              Cancel
            </button>
            <button
              onClick={submitLeave}
              disabled={busy === 'leave-submit' || !leaveStart || !leaveEnd || leaveReason.trim().length === 0}
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

function Modal({ children, title, onClose }: { children: React.ReactNode; title: string; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4 bg-[var(--m-ink)]/40" onClick={onClose}>
      <div className="w-full max-w-md bg-white rounded-2xl shadow-xl p-6" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-2">
          <h2 className="app-h2">{title}</h2>
          <button onClick={onClose} aria-label="Close" className="btn-ghost">
            ✕
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}

function formatElapsed(seconds: number): string {
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
