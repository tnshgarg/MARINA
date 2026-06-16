'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { CharacterAvatar } from '@/components/character-avatar'
import { useToast } from '@/components/toast'

type Leave = {
  id: number
  startDate: string
  endDate: string
  reason: string
  status: 'pending' | 'approved' | 'denied' | 'cancelled'
  decidedAt: string | null
  decidedNote: string | null
  createdAt: string
  user: { id: number; login: string; name: string | null; characterKey: string | null }
}

const STATUS_PILL: Record<Leave['status'], string> = {
  pending: 'pill-warn',
  approved: 'pill-good',
  denied: 'pill-bad',
  cancelled: 'pill-slate',
}

export default function LeavesClient({
  orgId,
  isManager,
  leaves,
}: {
  orgId: number
  isManager: boolean
  leaves: Leave[]
}) {
  const router = useRouter()
  const toast = useToast()
  const [filter, setFilter] = useState<Leave['status'] | 'all'>('all')
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const filtered = useMemo(() => {
    if (filter === 'all') return leaves
    return leaves.filter((l) => l.status === filter)
  }, [leaves, filter])

  async function decide(id: number, decision: 'approve' | 'deny' | 'reopen') {
    setBusy(`${id}-${decision}`)
    setError(null)
    try {
      const res = await fetch(`/api/orgs/${orgId}/leaves/${id}/decide`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ decision }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data?.error || data?.message || `HTTP ${res.status}`)
      toast.push({
        kind: 'success',
        title:
          decision === 'approve'
            ? 'Leave approved'
            : decision === 'deny'
              ? 'Leave denied'
              : 'Leave reopened',
      })
      router.refresh()
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      setError(msg)
      toast.push({ kind: 'error', title: 'Could not save decision', body: msg })
    } finally {
      setBusy(null)
    }
  }

  const tabs: Array<{ id: Leave['status'] | 'all'; label: string; count: number }> = [
    { id: 'all', label: 'All', count: leaves.length },
    { id: 'pending', label: 'Pending', count: leaves.filter((l) => l.status === 'pending').length },
    { id: 'approved', label: 'Approved', count: leaves.filter((l) => l.status === 'approved').length },
    { id: 'denied', label: 'Denied', count: leaves.filter((l) => l.status === 'denied').length },
  ]

  return (
    <div className="rounded-xl border border-[var(--m-border)] bg-white overflow-hidden">
      <div className="px-4 py-3 border-b border-[var(--m-border-soft)] flex items-center gap-1 flex-wrap">
        <div
          className="inline-flex rounded-lg border border-[var(--m-border)] bg-[var(--m-bg-soft)] p-0.5"
          role="tablist"
        >
          {tabs.map((t) => (
            <button
              key={t.id}
              onClick={() => setFilter(t.id)}
              role="tab"
              aria-selected={filter === t.id}
              className={`px-3 py-1 text-[12px] font-medium rounded-md transition ${
                filter === t.id
                  ? 'bg-white text-[var(--m-ink)] shadow-sm border border-[var(--m-border)]'
                  : 'text-[var(--m-ink-2)] hover:text-[var(--m-ink)]'
              }`}
            >
              {t.label}
              <span className="ml-1 text-[var(--m-ink-4)] tabular-nums">{t.count}</span>
            </button>
          ))}
        </div>
      </div>
      {error && <p className="px-4 py-2 text-[12px] text-rose-600">{error}</p>}
      <ul className="divide-y divide-[var(--m-border-soft)]">
        {filtered.length === 0 && (
          <li className="px-5 py-10 text-center text-[12.5px] text-[var(--m-ink-3)]">
            No requests in this view.
          </li>
        )}
        {filtered.map((l) => (
          <li key={l.id} className="px-5 py-4 flex items-start gap-3 flex-wrap">
            <CharacterAvatar characterKey={l.user.characterKey} name={l.user.name} login={l.user.login} size={32} />
            <div className="flex-1 min-w-[200px]">
              <div className="flex items-center gap-2 flex-wrap">
                <p className="text-[13px] font-medium text-[var(--m-ink)]">
                  {l.user.name ?? `@${l.user.login}`}
                </p>
                <span className={`pill ${STATUS_PILL[l.status]}`}>{l.status}</span>
              </div>
              <p className="text-[11.5px] text-[var(--m-ink-3)] mt-0.5">
                {fmtDateRange(l.startDate, l.endDate)} · submitted {timeAgo(l.createdAt)}
              </p>
              <p className="mt-1.5 text-[12.5px] text-[var(--m-ink-2)] leading-snug">{l.reason}</p>
              {l.decidedNote && (
                <p className="mt-1 text-[11.5px] text-[var(--m-ink-3)]">
                  Manager note: {l.decidedNote}
                </p>
              )}
            </div>
            {isManager && (
              <DecisionActions
                leave={l}
                busy={busy}
                onDecide={(d) => decide(l.id, d)}
              />
            )}
          </li>
        ))}
      </ul>
    </div>
  )
}

/**
 * Decision controls per row. Pending → primary Approve + outline Deny.
 * Decided → small "Change decision" disclosure that reveals Flip + Reopen.
 * Reopening clears decidedAt/decidedBy/decidedNote and returns status to pending.
 */
function DecisionActions({
  leave: l,
  busy,
  onDecide,
}: {
  leave: Leave
  busy: string | null
  onDecide: (d: 'approve' | 'deny' | 'reopen') => void
}) {
  const [open, setOpen] = useState(false)

  if (l.status === 'pending') {
    return (
      <div className="flex gap-1.5 self-center">
        <button
          className="px-2.5 py-1 rounded-md bg-[var(--m-ink)] hover:bg-[var(--m-ink-2)] text-white text-[12px] font-medium disabled:opacity-50 transition"
          disabled={busy === `${l.id}-approve`}
          onClick={() => onDecide('approve')}
        >
          {busy === `${l.id}-approve` ? '…' : 'Approve'}
        </button>
        <button
          className="px-2.5 py-1 rounded-md bg-white border border-[var(--m-border)] hover:bg-[var(--m-bg-soft)] text-[var(--m-ink-2)] text-[12px] font-medium disabled:opacity-50 transition"
          disabled={busy === `${l.id}-deny`}
          onClick={() => onDecide('deny')}
        >
          {busy === `${l.id}-deny` ? '…' : 'Deny'}
        </button>
      </div>
    )
  }

  if (l.status === 'cancelled') {
    return (
      <span className="self-center text-[11.5px] text-[var(--m-ink-4)]">
        Cancelled by employee
      </span>
    )
  }

  // approved or denied → reversible
  const flipTo: 'approve' | 'deny' = l.status === 'approved' ? 'deny' : 'approve'
  const flipLabel = flipTo === 'approve' ? 'Approve instead' : 'Deny instead'

  return (
    <div className="self-center flex items-center gap-1.5 relative">
      {!open ? (
        <button
          onClick={() => setOpen(true)}
          className="px-2.5 py-1 rounded-md bg-white border border-[var(--m-border)] hover:bg-[var(--m-bg-soft)] text-[var(--m-ink-2)] text-[11.5px] font-medium transition"
        >
          Change decision
        </button>
      ) : (
        <>
          <button
            className="px-2.5 py-1 rounded-md bg-white border border-[var(--m-border)] hover:bg-[var(--m-bg-soft)] text-[var(--m-ink)] text-[11.5px] font-medium disabled:opacity-50 transition"
            disabled={busy === `${l.id}-${flipTo}`}
            onClick={() => onDecide(flipTo)}
          >
            {busy === `${l.id}-${flipTo}` ? '…' : flipLabel}
          </button>
          <button
            className="px-2.5 py-1 rounded-md bg-white border border-[var(--m-border)] hover:bg-[var(--m-bg-soft)] text-[var(--m-ink-2)] text-[11.5px] font-medium disabled:opacity-50 transition"
            disabled={busy === `${l.id}-reopen`}
            onClick={() => onDecide('reopen')}
            title="Set back to pending — clears the decision"
          >
            {busy === `${l.id}-reopen` ? '…' : 'Reopen'}
          </button>
          <button
            onClick={() => setOpen(false)}
            className="text-[11px] text-[var(--m-ink-4)] hover:text-[var(--m-ink-2)] px-1"
            aria-label="Close decision actions"
          >
            ×
          </button>
        </>
      )}
    </div>
  )
}

function fmtDateRange(start: string, end: string): string {
  const s = new Date(start + 'T00:00:00')
  const e = new Date(end + 'T00:00:00')
  const sameMonth = s.getMonth() === e.getMonth() && s.getFullYear() === e.getFullYear()
  const fmt = (d: Date, withMonth: boolean) =>
    d.toLocaleDateString(undefined, withMonth ? { day: 'numeric', month: 'short' } : { day: 'numeric' })
  const days = Math.round((e.getTime() - s.getTime()) / (24 * 60 * 60 * 1000)) + 1
  const label = start === end ? fmt(s, true) : `${fmt(s, !sameMonth)} – ${fmt(e, true)}`
  return `${label} · ${days} day${days === 1 ? '' : 's'}`
}

function timeAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime()
  const m = Math.floor(ms / 60000)
  if (m < 1) return 'just now'
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  const d = Math.floor(h / 24)
  return `${d}d ago`
}
