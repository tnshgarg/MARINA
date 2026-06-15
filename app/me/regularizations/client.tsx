'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useToast } from '@/components/toast'

type Status = 'pending' | 'approved' | 'denied'
type Kind = 'present' | 'leave' | 'wfh' | 'holiday'

type Reg = {
  id: number
  orgId: number
  day: string
  requestedKind: Kind
  note: string
  status: Status
  decidedAt: string | null
  decidedNote: string | null
  createdAt: string
}

type Org = { id: number; name: string }

const STATUS_PILL: Record<Status, string> = {
  pending: 'pill-warn',
  approved: 'pill-good',
  denied: 'pill-bad',
}

const KIND_LABELS: Record<Kind, string> = {
  present: 'Present',
  leave: 'On leave',
  wfh: 'Work from home',
  holiday: 'Holiday',
}

const KIND_OPTIONS: Array<{ value: Kind; label: string }> = [
  { value: 'present', label: 'I was present (worked but didn’t punch)' },
  { value: 'wfh', label: 'I was working from home' },
  { value: 'leave', label: 'I was on approved leave' },
  { value: 'holiday', label: 'It was a holiday' },
]

function todayStr(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export default function RegularizationsClient({
  orgs,
  requests,
}: {
  orgs: Org[]
  requests: Reg[]
}) {
  const router = useRouter()
  const toast = useToast()

  const [orgId, setOrgId] = useState<number | null>(orgs[0]?.id ?? null)
  const [day, setDay] = useState('')
  const [kind, setKind] = useState<Kind>('present')
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)

    if (orgId == null) {
      setError('You need to belong to an organization to file a request.')
      return
    }
    if (!day) {
      setError('Pick the day you want to correct.')
      return
    }
    if (note.trim().length === 0) {
      setError('Add a short note explaining what happened.')
      return
    }

    setBusy(true)
    try {
      const res = await fetch('/api/me/regularizations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orgId, day, requestedKind: kind, note: note.trim() }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data?.error || data?.message || `HTTP ${res.status}`)
      toast.push({ kind: 'success', title: 'Regularization submitted' })
      setDay('')
      setKind('present')
      setNote('')
      router.refresh()
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      setError(msg)
      toast.push({ kind: 'error', title: 'Could not submit', body: msg })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-6">
      {/* ---- Submit form ---- */}
      <form onSubmit={submit} className="app-card app-card-lg">
        <h2 className="app-h3 mb-3">New request</h2>

        {orgs.length === 0 ? (
          <p className="text-[13px] text-[var(--m-ink-3)]">
            You’re not a member of any organization yet, so there’s nothing to
            regularize.
          </p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {orgs.length > 1 && (
              <label className="block sm:col-span-2">
                <span className="block text-[12px] font-medium text-[var(--m-ink-2)] mb-1">
                  Organization
                </span>
                <select
                  className="select"
                  value={orgId ?? ''}
                  onChange={(e) => setOrgId(Number(e.target.value))}
                >
                  {orgs.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.name}
                    </option>
                  ))}
                </select>
              </label>
            )}

            <label className="block">
              <span className="block text-[12px] font-medium text-[var(--m-ink-2)] mb-1">
                Day
              </span>
              <input
                type="date"
                className="input"
                value={day}
                max={todayStr()}
                onChange={(e) => setDay(e.target.value)}
              />
            </label>

            <label className="block">
              <span className="block text-[12px] font-medium text-[var(--m-ink-2)] mb-1">
                What it should be
              </span>
              <select
                className="select"
                value={kind}
                onChange={(e) => setKind(e.target.value as Kind)}
              >
                {KIND_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="block sm:col-span-2">
              <span className="block text-[12px] font-medium text-[var(--m-ink-2)] mb-1">
                Note <span className="text-[var(--m-ink-4)] font-normal">(required)</span>
              </span>
              <textarea
                className="textarea"
                placeholder="e.g. I was on client travel and couldn’t punch in."
                value={note}
                maxLength={500}
                onChange={(e) => setNote(e.target.value)}
              />
              <span className="mt-1 block text-[11px] text-[var(--m-ink-4)] text-right tabular-nums">
                {note.length}/500
              </span>
            </label>
          </div>
        )}

        {error && <p className="mt-2 text-[12px] text-[var(--m-bad)]">{error}</p>}

        {orgs.length > 0 && (
          <div className="mt-4">
            <button type="submit" className="btn-primary" disabled={busy}>
              {busy ? 'Submitting…' : 'Submit request'}
            </button>
          </div>
        )}
      </form>

      {/* ---- My requests ---- */}
      <div>
        <h2 className="app-h3 mb-2">Your requests</h2>
        <div className="app-card overflow-hidden">
          <ul className="divide-y divide-[var(--m-border-soft)]">
            {requests.length === 0 && (
              <li className="px-5 py-10 text-center text-[12.5px] text-[var(--m-ink-4)]">
                You haven’t submitted any regularization requests yet.
              </li>
            )}
            {requests.map((r) => (
              <li key={r.id} className="px-5 py-4">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="text-[13px] font-medium text-[var(--m-ink)]">
                    {fmtDay(r.day)}
                  </p>
                  <span className="pill pill-slate">{KIND_LABELS[r.requestedKind]}</span>
                  <span className={`pill ${STATUS_PILL[r.status]}`}>{r.status}</span>
                </div>
                <p className="mt-0.5 text-[11.5px] text-[var(--m-ink-4)]">
                  Submitted {timeAgo(r.createdAt)}
                </p>
                <p className="mt-1.5 text-[12.5px] text-[var(--m-ink-2)] leading-snug">
                  {r.note}
                </p>
                {r.status !== 'pending' && r.decidedNote && (
                  <p className="mt-1 text-[11.5px] text-[var(--m-ink-3)]">
                    Manager note: {r.decidedNote}
                  </p>
                )}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  )
}

function fmtDay(day: string): string {
  const d = new Date(day + 'T00:00:00')
  if (Number.isNaN(d.getTime())) return day
  return d.toLocaleDateString(undefined, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
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
