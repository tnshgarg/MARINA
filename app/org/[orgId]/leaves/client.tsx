'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { CharacterAvatar } from '@/components/character-avatar'

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
  const [filter, setFilter] = useState<Leave['status'] | 'all'>('all')
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const filtered = useMemo(() => {
    if (filter === 'all') return leaves
    return leaves.filter((l) => l.status === filter)
  }, [leaves, filter])

  async function decide(id: number, decision: 'approve' | 'deny') {
    setBusy(`${id}-${decision}`)
    setError(null)
    try {
      const res = await fetch(`/api/orgs/${orgId}/leaves/${id}/decide`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ decision }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data?.error || 'failed')
      router.refresh()
    } catch (e) {
      setError(String(e))
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
    <div className="app-card">
      <div className="px-5 py-4 border-b border-slate-100 flex items-center gap-2 flex-wrap">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setFilter(t.id)}
            className={`px-3 py-1.5 rounded-lg text-[13px] font-medium ${
              filter === t.id ? 'bg-indigo-50 text-indigo-700' : 'text-slate-600 hover:bg-slate-50'
            }`}
          >
            {t.label} <span className="text-slate-400">({t.count})</span>
          </button>
        ))}
      </div>
      {error && <p className="px-5 py-2 text-[12px] text-rose-600">{error}</p>}
      <ul className="divide-y divide-slate-100">
        {filtered.length === 0 && (
          <li className="px-5 py-10 text-center text-slate-500">No requests in this view.</li>
        )}
        {filtered.map((l) => (
          <li key={l.id} className="px-5 py-4 flex items-start gap-4 flex-wrap">
            <CharacterAvatar characterKey={l.user.characterKey} size={42} />
            <div className="flex-1 min-w-[200px]">
              <div className="flex items-center gap-2 flex-wrap">
                <p className="text-[14px] font-medium text-slate-900">
                  {l.user.name ?? `@${l.user.login}`}
                </p>
                <span className={`pill ${STATUS_PILL[l.status]}`}>{l.status}</span>
              </div>
              <p className="text-[12px] text-slate-500 mt-0.5">
                {fmtDateRange(l.startDate, l.endDate)} · submitted {timeAgo(l.createdAt)}
              </p>
              <p className="mt-2 text-[13px] text-slate-700 leading-snug">{l.reason}</p>
              {l.decidedNote && (
                <p className="mt-1 text-[12px] text-slate-500">Manager note: {l.decidedNote}</p>
              )}
            </div>
            {isManager && l.status === 'pending' && (
              <div className="flex gap-2 self-center">
                <button
                  className="btn-good"
                  disabled={busy === `${l.id}-approve`}
                  onClick={() => decide(l.id, 'approve')}
                >
                  {busy === `${l.id}-approve` ? '…' : 'Approve'}
                </button>
                <button
                  className="btn-bad"
                  disabled={busy === `${l.id}-deny`}
                  onClick={() => decide(l.id, 'deny')}
                >
                  {busy === `${l.id}-deny` ? '…' : 'Deny'}
                </button>
              </div>
            )}
          </li>
        ))}
      </ul>
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
