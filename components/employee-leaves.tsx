'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

/**
 * The employee's own leave-request list with an inline "cancel" for pending
 * rows. Pulled out as a client island so the Overview server component can
 * render it without going client itself.
 */

export type LeaveDto = {
  id: number
  startDate: string
  endDate: string
  reason: string
  status: 'pending' | 'approved' | 'denied' | 'cancelled'
  decidedNote: string | null
}

const LEAVE_PILL: Record<LeaveDto['status'], string> = {
  pending: 'pill-warn',
  approved: 'pill-good',
  denied: 'pill-bad',
  cancelled: 'pill-slate',
}

export function EmployeeLeaves({ leaves }: { leaves: LeaveDto[] }) {
  const router = useRouter()
  const [busy, setBusy] = useState<number | null>(null)

  async function cancelLeave(id: number) {
    if (!confirm('Cancel this leave request?')) return
    setBusy(id)
    try {
      const res = await fetch(`/api/me/leaves/${id}`, { method: 'DELETE' })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data?.error || 'failed')
      }
      router.refresh()
    } catch {
      // surfaced via no-op; the row stays visible
    } finally {
      setBusy(null)
    }
  }

  return (
    <section className="app-card app-card-lg">
      <div className="section-title-row">
        <h2 className="app-h2">Leave requests</h2>
        <span className="text-[12px] text-[var(--m-ink-3)]">{leaves.length}</span>
      </div>
      {leaves.length === 0 ? (
        <p className="app-sub mt-3">No requests on file.</p>
      ) : (
        <ul className="mt-3 space-y-3">
          {leaves.slice(0, 5).map((l) => (
            <li key={l.id} className="rounded-xl border border-[var(--m-border-soft)] p-3">
              <div className="flex items-center justify-between gap-2">
                <span className={`pill ${LEAVE_PILL[l.status]}`}>{l.status}</span>
                {l.status === 'pending' && (
                  <button
                    onClick={() => cancelLeave(l.id)}
                    disabled={busy === l.id}
                    className="text-[11px] text-[var(--m-ink-3)] hover:text-rose-600"
                  >
                    {busy === l.id ? 'Cancelling…' : 'Cancel'}
                  </button>
                )}
              </div>
              <p className="text-[13px] text-[var(--m-ink)] mt-1.5 font-medium">{fmtDateRange(l.startDate, l.endDate)}</p>
              <p className="text-[12px] text-[var(--m-ink-2)] mt-0.5">{l.reason}</p>
              {l.decidedNote && <p className="text-[11px] text-[var(--m-ink-3)] mt-1">Manager: {l.decidedNote}</p>}
            </li>
          ))}
        </ul>
      )}
    </section>
  )
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
