'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { CharacterAvatar } from '@/components/character-avatar'
import { useToast } from '@/components/toast'

type Cycle = {
  id: number
  name: string
  periodStart: string
  periodEnd: string
  status: 'open' | 'closed'
}

type Member = {
  membershipId: number
  userId: number
  login: string
  name: string | null
  avatarUrl: string | null
  characterKey: string | null
  role: string
  jobTitle: string | null
  reviewed: boolean
  lastOneOnOneAt: string | null
  daysSinceOneOnOne: number | null
  cadenceOverdue: boolean
}

const ROLE_PILL: Record<string, string> = {
  admin: 'pill-violet',
  manager: 'pill-info',
  lead: 'pill-info',
  member: 'pill-slate',
}

function fmtDate(iso: string): string {
  // iso is YYYY-MM-DD — render in a calm, locale-aware short form.
  const d = new Date(`${iso}T00:00:00`)
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
}

function cadenceLabel(m: Member): string {
  if (m.daysSinceOneOnOne === null) return 'No 1:1 on record'
  if (m.daysSinceOneOnOne === 0) return 'Last 1:1: today'
  if (m.daysSinceOneOnOne === 1) return 'Last 1:1: 1 day ago'
  return `Last 1:1: ${m.daysSinceOneOnOne} days ago`
}

export default function ReviewsClient({
  orgId,
  isHr,
  cadenceFlagDays,
  cycles,
  selectedCycleId,
  members,
}: {
  orgId: number
  isHr: boolean
  cadenceFlagDays: number
  cycles: Cycle[]
  selectedCycleId: number | null
  members: Member[]
}) {
  const router = useRouter()
  const toast = useToast()

  const selected = useMemo(
    () => cycles.find((c) => c.id === selectedCycleId) ?? null,
    [cycles, selectedCycleId],
  )

  // KPIs over the in-scope roster for the focused cycle.
  const total = members.length
  const reviewedCount = members.filter((m) => m.reviewed).length
  const reviewedPct = total === 0 ? 0 : Math.round((reviewedCount / total) * 100)
  const overdueCount = members.filter((m) => m.cadenceOverdue).length

  // ---- Open-a-cycle form (HR only) ----
  const [name, setName] = useState('')
  const [start, setStart] = useState('')
  const [end, setEnd] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function createCycle(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      const res = await fetch(`/api/orgs/${orgId}/reviews`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), periodStart: start, periodEnd: end }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data?.error || data?.message || `HTTP ${res.status}`)
      setName('')
      setStart('')
      setEnd('')
      toast.push({ kind: 'success', title: 'Review cycle opened' })
      // Focus the new cycle immediately.
      if (data?.cycle?.id) router.push(`/org/${orgId}/reviews?cycle=${data.cycle.id}`)
      router.refresh()
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      setError(msg)
      toast.push({ kind: 'error', title: 'Could not open cycle', body: msg })
    } finally {
      setBusy(false)
    }
  }

  async function setStatus(cycle: Cycle, status: 'open' | 'closed') {
    setBusy(true)
    try {
      const res = await fetch(`/api/orgs/${orgId}/reviews/${cycle.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data?.error || data?.message || `HTTP ${res.status}`)
      toast.push({ kind: 'success', title: status === 'closed' ? 'Cycle closed' : 'Cycle reopened' })
      router.refresh()
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      toast.push({ kind: 'error', title: 'Update failed', body: msg })
    } finally {
      setBusy(false)
    }
  }

  async function deleteCycle(cycle: Cycle) {
    if (!confirm(`Delete "${cycle.name}"? This only removes the cycle window — reviews and 1:1s are kept.`)) {
      return
    }
    setBusy(true)
    try {
      const res = await fetch(`/api/orgs/${orgId}/reviews/${cycle.id}`, { method: 'DELETE' })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data?.error || data?.message || `HTTP ${res.status}`)
      toast.push({ kind: 'success', title: 'Cycle deleted' })
      router.push(`/org/${orgId}/reviews`)
      router.refresh()
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      toast.push({ kind: 'error', title: 'Delete failed', body: msg })
    } finally {
      setBusy(false)
    }
  }

  const formValid = name.trim().length > 0 && name.trim().length <= 120 && !!start && !!end && start <= end

  return (
    <div className="space-y-5">
      <div className="mb-1">
        <h1 className="app-h1">Reviews &amp; 1:1 cadence</h1>
        <p className="mt-1.5 text-[13px] text-[color:var(--m-ink-3)]">
          Open a review cycle, then track who has a review on file and whose 1:1 rhythm has slipped.
        </p>
      </div>

      {/* KPI header — calm stat cards, mirrors the rest of the console. */}
      <div className="grid gap-3 sm:grid-cols-3 items-stretch">
        <div className="app-card app-card-tight h-full">
          <div className="stat-num tabular-nums">{selected ? `${reviewedPct}%` : '—'}</div>
          <div className="stat-label">Reviewed</div>
          <div className="stat-sub">
            {selected ? `${reviewedCount} of ${total} in scope` : 'No cycle selected'}
          </div>
        </div>
        <div className="app-card app-card-tight h-full">
          <div className="stat-num tabular-nums">{selected ? overdueCount : '—'}</div>
          <div className="stat-label">Overdue 1:1s</div>
          <div className="stat-sub">No 1:1 in {cadenceFlagDays}+ days</div>
        </div>
        <div className="app-card app-card-tight h-full">
          <div className="stat-num tabular-nums">{total}</div>
          <div className="stat-label">People in scope</div>
          <div className="stat-sub">{selected ? selected.name : 'Whole roster'}</div>
        </div>
      </div>

      {/* Open-a-cycle form — HR/admin only. */}
      {isHr && (
        <section className="app-card app-card-lg">
          <h2 className="text-[14px] font-semibold text-[color:var(--m-ink)]">Open a review cycle</h2>
          <p className="text-[12px] text-[color:var(--m-ink-4)] mt-0.5">
            Name the period and set its window — e.g. &ldquo;H1 2026&rdquo; from Jan 1 to Jun 30.
          </p>
          <form onSubmit={createCycle} className="mt-3 space-y-2">
            <div className="grid sm:grid-cols-2 gap-2">
              <input
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Cycle name — e.g. H1 2026"
                maxLength={120}
                className="input"
                disabled={busy}
                aria-label="Cycle name"
              />
              <div className="grid grid-cols-2 gap-2">
                <input
                  type="date"
                  required
                  value={start}
                  max={end || undefined}
                  onChange={(e) => setStart(e.target.value)}
                  className="input"
                  disabled={busy}
                  aria-label="Period start"
                />
                <input
                  type="date"
                  required
                  value={end}
                  min={start || undefined}
                  onChange={(e) => setEnd(e.target.value)}
                  className="input"
                  disabled={busy}
                  aria-label="Period end"
                />
              </div>
            </div>
            <div className="flex items-center justify-between gap-3">
              <span className="text-[11.5px] text-[color:var(--m-ink-4)]">
                {start && end && start > end ? 'Start must be on or before end.' : ' '}
              </span>
              <button type="submit" disabled={busy || !formValid} className="btn-primary disabled:opacity-50">
                {busy ? 'Opening…' : 'Open cycle'}
              </button>
            </div>
          </form>
          {error && <p className="mt-2 text-[12px] text-[color:var(--m-bad)]">{error}</p>}
        </section>
      )}

      {/* Cycle list — newest first; click to focus. */}
      <section className="app-card overflow-hidden !p-0">
        <div className="px-4 py-3 border-b border-[color:var(--m-border)] flex items-baseline justify-between">
          <h2 className="text-[13px] font-semibold text-[color:var(--m-ink)]">
            Cycles
            <span className="ml-1.5 text-[color:var(--m-ink-4)] tabular-nums">{cycles.length}</span>
          </h2>
        </div>
        {cycles.length === 0 ? (
          <p className="px-4 py-5 text-[12.5px] text-[color:var(--m-ink-3)]">
            No review cycles yet.{isHr ? ' Open one above to get started.' : ' Ask HR to open one.'}
          </p>
        ) : (
          <ul className="divide-y divide-[color:var(--m-border)]">
            {cycles.map((c) => {
              const isSel = c.id === selectedCycleId
              return (
                <li
                  key={c.id}
                  className={`px-4 py-2.5 flex items-center justify-between gap-3 flex-wrap transition-colors ${
                    isSel ? 'bg-[color:var(--m-accent-soft)]' : 'hover:bg-[color:var(--m-bg-soft)]'
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => router.push(`/org/${orgId}/reviews?cycle=${c.id}`)}
                    className="min-w-0 text-left"
                  >
                    <p className="text-[12.5px] font-medium text-[color:var(--m-ink)] truncate">
                      {c.name}
                      {isSel && <span className="ml-2 text-[10.5px] text-[color:var(--m-accent-2)]">· viewing</span>}
                    </p>
                    <p className="text-[11px] text-[color:var(--m-ink-4)]">
                      {fmtDate(c.periodStart)} → {fmtDate(c.periodEnd)}
                    </p>
                  </button>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className={`pill ${c.status === 'open' ? 'pill-good' : 'pill-slate'}`}>
                      {c.status === 'open' ? 'Open' : 'Closed'}
                    </span>
                    {isHr && (
                      <>
                        <button
                          type="button"
                          onClick={() => setStatus(c, c.status === 'open' ? 'closed' : 'open')}
                          disabled={busy}
                          className="px-2.5 py-1 rounded-md bg-white border border-[color:var(--m-border)] hover:bg-[color:var(--m-bg-soft)] text-[11.5px] font-medium text-[color:var(--m-ink-2)] disabled:opacity-50 transition"
                        >
                          {c.status === 'open' ? 'Close' : 'Reopen'}
                        </button>
                        <button
                          type="button"
                          onClick={() => deleteCycle(c)}
                          disabled={busy}
                          className="px-2.5 py-1 rounded-md bg-white border border-[color:var(--m-bad-soft)] hover:bg-[color:var(--m-bad-soft)] text-[11.5px] font-medium text-[color:var(--m-bad)] disabled:opacity-50 transition"
                        >
                          Delete
                        </button>
                      </>
                    )}
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </section>

      {/* In-scope member status for the focused cycle. */}
      <section className="app-card overflow-hidden !p-0">
        <div className="px-4 py-3 border-b border-[color:var(--m-border)] flex items-baseline justify-between gap-3 flex-wrap">
          <h2 className="text-[13px] font-semibold text-[color:var(--m-ink)]">
            {selected ? (
              <>
                Review status · <span className="text-[color:var(--m-ink-2)]">{selected.name}</span>
              </>
            ) : (
              'Review status'
            )}
          </h2>
          {selected && (
            <span className="text-[11px] text-[color:var(--m-ink-4)]">
              {fmtDate(selected.periodStart)} → {fmtDate(selected.periodEnd)}
            </span>
          )}
        </div>

        {!selected ? (
          <p className="px-4 py-10 text-center text-[13px] text-[color:var(--m-ink-3)]">
            Select or open a cycle to see who has a review on file.
          </p>
        ) : members.length === 0 ? (
          <p className="px-4 py-10 text-center text-[13px] text-[color:var(--m-ink-3)]">
            No people in your scope.
          </p>
        ) : (
          <>
            {/* Header row — shares the grid template with each row below. */}
            <div className="hidden md:grid grid-cols-[44px_minmax(0,1.6fr)_minmax(0,150px)_minmax(0,1fr)] gap-3 items-center px-4 py-2.5 border-b border-[color:var(--m-border)] text-[11px] uppercase tracking-wider text-[color:var(--m-ink-4)] font-medium">
              <span aria-hidden></span>
              <span>Member</span>
              <span>Review on file</span>
              <span>1:1 cadence</span>
            </div>
            <ul className="divide-y divide-[color:var(--m-border)]">
              {members.map((m) => {
                const roleClass = ROLE_PILL[m.role] ?? 'pill-slate'
                return (
                  <li
                    key={m.membershipId}
                    className="grid grid-cols-[44px_minmax(0,1fr)] md:grid-cols-[44px_minmax(0,1.6fr)_minmax(0,150px)_minmax(0,1fr)] gap-3 items-center px-4 py-3 hover:bg-[color:var(--m-bg-soft)] transition-colors"
                  >
                    <CharacterAvatar
                      characterKey={m.characterKey}
                      name={m.name}
                      login={m.login}
                      imageUrl={m.avatarUrl}
                      size={32}
                    />

                    <a
                      href={`/org/${orgId}/people/${m.membershipId}`}
                      className="min-w-0 block hover:text-[color:var(--m-accent)] transition-colors"
                    >
                      <p className="text-[13px] font-medium text-[color:var(--m-ink)] truncate">
                        {m.name ?? `@${m.login}`}
                      </p>
                      <p className="text-[11.5px] text-[color:var(--m-ink-4)] truncate">
                        {m.jobTitle ?? `@${m.login}`}
                      </p>
                      {/* Mobile-only meta: role + the two status pills stacked. */}
                      <div className="md:hidden mt-1.5 flex items-center gap-1.5 flex-wrap">
                        <span className={`pill ${roleClass}`}>{m.role}</span>
                        <span className={`pill ${m.reviewed ? 'pill-good' : 'pill-warn'}`}>
                          {m.reviewed ? 'Review ✓' : 'No review ✗'}
                        </span>
                        <span className={`pill ${m.cadenceOverdue ? 'pill-warn' : 'pill-slate'}`}>
                          {cadenceLabel(m)}
                        </span>
                      </div>
                    </a>

                    {/* Review on file — desktop column. */}
                    <div className="hidden md:block">
                      <span className={`pill ${m.reviewed ? 'pill-good' : 'pill-warn'}`}>
                        {m.reviewed ? '✓ On file' : '✗ Missing'}
                      </span>
                    </div>

                    {/* 1:1 cadence — desktop column, amber when stale/never. */}
                    <div className="hidden md:flex items-center gap-1.5 min-w-0">
                      <span className={`text-[12.5px] truncate ${m.cadenceOverdue ? 'text-[color:var(--m-warn)] font-medium' : 'text-[color:var(--m-ink-2)]'}`}>
                        {cadenceLabel(m)}
                      </span>
                      {m.cadenceOverdue && (
                        <span className="pill pill-warn shrink-0" title={`No 1:1 in ${cadenceFlagDays}+ days`}>
                          ⚑
                        </span>
                      )}
                    </div>
                  </li>
                )
              })}
            </ul>
          </>
        )}
      </section>
    </div>
  )
}
