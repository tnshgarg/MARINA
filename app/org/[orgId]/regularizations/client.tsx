'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { CharacterAvatar } from '@/components/character-avatar'
import { useToast } from '@/components/toast'

type Status = 'pending' | 'approved' | 'denied'
type Kind = 'present' | 'leave' | 'wfh' | 'holiday'

type Reg = {
  id: number
  day: string
  requestedKind: Kind
  note: string
  status: Status
  decidedAt: string | null
  decidedNote: string | null
  createdAt: string
  user: { id: number; login: string; name: string | null; characterKey: string | null }
}

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

export default function RegularizationsQueueClient({
  orgId,
  currentUserId,
  requests,
}: {
  orgId: number
  currentUserId: number
  requests: Reg[]
}) {
  const router = useRouter()
  const toast = useToast()
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const pending = useMemo(() => requests.filter((r) => r.status === 'pending'), [requests])
  const decided = useMemo(() => requests.filter((r) => r.status !== 'pending'), [requests])

  async function decide(id: number, decision: 'approve' | 'deny') {
    setBusy(`${id}-${decision}`)
    setError(null)
    try {
      const res = await fetch(`/api/orgs/${orgId}/regularizations/${id}/decide`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ decision }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data?.error || data?.message || `HTTP ${res.status}`)
      toast.push({
        kind: 'success',
        title: decision === 'approve' ? 'Request approved' : 'Request denied',
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

  return (
    <div className="space-y-6">
      {error && <p className="text-[12px] text-rose-600">{error}</p>}

      {/* ---- Pending queue ---- */}
      <section>
        <h2 className="app-h3 mb-2">
          Pending
          <span className="ml-1.5 text-[var(--m-ink-4)] tabular-nums font-normal">
            {pending.length}
          </span>
        </h2>
        <div className="rounded-xl border border-[var(--m-border)] bg-white overflow-hidden">
          <ul className="divide-y divide-[var(--m-border-soft)]">
            {pending.length === 0 && (
              <li className="px-5 py-10 text-center text-[12.5px] text-[var(--m-ink-3)]">
                No pending requests. You’re all caught up.
              </li>
            )}
            {pending.map((r) => (
              <RegRow
                key={r.id}
                reg={r}
                busy={busy}
                isSelf={r.user.id === currentUserId}
                onDecide={(d) => decide(r.id, d)}
              />
            ))}
          </ul>
        </div>
      </section>

      {/* ---- Recently decided ---- */}
      {decided.length > 0 && (
        <section>
          <h2 className="app-h3 mb-2">Recently decided</h2>
          <div className="rounded-xl border border-[var(--m-border)] bg-white overflow-hidden">
            <ul className="divide-y divide-[var(--m-border-soft)]">
              {decided.map((r) => (
                <RegRow
                  key={r.id}
                  reg={r}
                  busy={busy}
                  isSelf={r.user.id === currentUserId}
                  onDecide={(d) => decide(r.id, d)}
                />
              ))}
            </ul>
          </div>
        </section>
      )}
    </div>
  )
}

function RegRow({
  reg: r,
  busy,
  isSelf,
  onDecide,
}: {
  reg: Reg
  busy: string | null
  isSelf: boolean
  onDecide: (d: 'approve' | 'deny') => void
}) {
  return (
    <li className="px-5 py-4 flex items-start gap-3 flex-wrap">
      <CharacterAvatar
        characterKey={r.user.characterKey}
        name={r.user.name}
        login={r.user.login}
        size={32}
      />
      <div className="flex-1 min-w-[200px]">
        <div className="flex items-center gap-2 flex-wrap">
          <p className="text-[13px] font-medium text-[var(--m-ink)]">
            {r.user.name ?? `@${r.user.login}`}
          </p>
          <span className="pill pill-slate">{KIND_LABELS[r.requestedKind]}</span>
          <span className={`pill ${STATUS_PILL[r.status]}`}>{r.status}</span>
        </div>
        <p className="text-[11.5px] text-[var(--m-ink-3)] mt-0.5">
          {fmtDay(r.day)} · submitted {timeAgo(r.createdAt)}
        </p>
        <p className="mt-1.5 text-[12.5px] text-[var(--m-ink-2)] leading-snug">{r.note}</p>
        {r.status !== 'pending' && r.decidedNote && (
          <p className="mt-1 text-[11.5px] text-[var(--m-ink-3)]">Manager note: {r.decidedNote}</p>
        )}
      </div>
      <DecisionActions reg={r} busy={busy} isSelf={isSelf} onDecide={onDecide} />
    </li>
  )
}

/**
 * Pending → primary Approve + outline Deny. Decided → a "Change decision"
 * disclosure that reveals the opposite action (re-deciding is allowed). Own
 * requests show no actions — you can't decide your own.
 */
function DecisionActions({
  reg: r,
  busy,
  isSelf,
  onDecide,
}: {
  reg: Reg
  busy: string | null
  isSelf: boolean
  onDecide: (d: 'approve' | 'deny') => void
}) {
  const [open, setOpen] = useState(false)

  if (isSelf) {
    return (
      <span className="self-center text-[11.5px] text-[var(--m-ink-4)]">Your request</span>
    )
  }

  if (r.status === 'pending') {
    return (
      <div className="flex gap-1.5 self-center">
        <button
          className="px-2.5 py-1 rounded-md bg-[var(--m-ink)] hover:bg-[var(--m-ink-2)] text-white text-[12px] font-medium disabled:opacity-50 transition"
          disabled={busy === `${r.id}-approve`}
          onClick={() => onDecide('approve')}
        >
          {busy === `${r.id}-approve` ? '…' : 'Approve'}
        </button>
        <button
          className="px-2.5 py-1 rounded-md bg-white border border-[var(--m-border)] hover:bg-[var(--m-bg-soft)] text-[var(--m-ink-2)] text-[12px] font-medium disabled:opacity-50 transition"
          disabled={busy === `${r.id}-deny`}
          onClick={() => onDecide('deny')}
        >
          {busy === `${r.id}-deny` ? '…' : 'Deny'}
        </button>
      </div>
    )
  }

  // approved or denied → reversible (re-decide)
  const flipTo: 'approve' | 'deny' = r.status === 'approved' ? 'deny' : 'approve'
  const flipLabel = flipTo === 'approve' ? 'Approve instead' : 'Deny instead'

  return (
    <div className="self-center flex items-center gap-1.5">
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
            disabled={busy === `${r.id}-${flipTo}`}
            onClick={() => onDecide(flipTo)}
          >
            {busy === `${r.id}-${flipTo}` ? '…' : flipLabel}
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
