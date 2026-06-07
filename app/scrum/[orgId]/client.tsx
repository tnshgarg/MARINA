'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { CharacterAvatar } from '@/components/character-avatar'

type Member = {
  membershipId: number
  userId: number
  login: string
  name: string | null
  characterKey: string | null
  role: string
}

type Brief = {
  yesterdayCommits: number
  yesterdayPrsOpened: number
  yesterdayReviews: number
  yesterdayIssuesClosed: number
  events: Array<{ id: number; type: string; title: string; url: string; repo: string; occurredAt: string }>
  activeBlocker: {
    reason: string
    waitingOn: string
    startedAt: string
  } | null
  shiftSummary: string | null
  shiftStatus: string | null
  storyNarrative: string | null
  lastSyncedAt: string | null
}

const TYPE_LABEL: Record<string, string> = {
  commit: 'commit',
  pr_opened: 'opened PR',
  pr_reviewed: 'reviewed',
  issue_closed: 'closed issue',
}

export default function ScrumClient({
  orgId,
  orgName,
  members,
}: {
  orgId: number
  orgName: string
  members: Member[]
}) {
  const [activeIdx, setActiveIdx] = useState(0)
  const [covered, setCovered] = useState<Set<number>>(new Set())
  const [brief, setBrief] = useState<Brief | null>(null)
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const active = members[activeIdx]

  // Load today's persisted coverage once on mount.
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const res = await fetch(`/api/orgs/${orgId}/scrum/coverage`)
        const data = await res.json()
        if (!cancelled && res.ok) {
          setCovered(new Set<number>(data.coveredUserIds ?? []))
        }
      } catch {
        // No-op — first-time load failure leaves the set empty; user can still toggle.
      }
    })()
    return () => {
      cancelled = true
    }
  }, [orgId])

  const loadBrief = useCallback(
    async (membershipId: number) => {
      setLoading(true)
      setErr(null)
      setBrief(null)
      try {
        const res = await fetch(`/api/orgs/${orgId}/members/${membershipId}/detail`)
        const data = await res.json()
        if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`)
        setBrief(deriveBrief(data))
      } catch (e) {
        setErr(e instanceof Error ? e.message : String(e))
      } finally {
        setLoading(false)
      }
    },
    [orgId],
  )

  useEffect(() => {
    if (active) loadBrief(active.membershipId)
  }, [active, loadBrief])

  // Keyboard nav: ↑/↓ to walk roster, Space to mark covered, R to refresh
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') return
      if (e.key === 'ArrowDown' || e.key === 'j') {
        e.preventDefault()
        setActiveIdx((i) => Math.min(members.length - 1, i + 1))
      } else if (e.key === 'ArrowUp' || e.key === 'k') {
        e.preventDefault()
        setActiveIdx((i) => Math.max(0, i - 1))
      } else if (e.key === ' ' && active) {
        e.preventDefault()
        toggleCovered(active.userId)
      } else if (e.key === 'r' && active) {
        e.preventDefault()
        loadBrief(active.membershipId)
      } else if (e.key === 'Escape') {
        if (window.opener) window.close()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [members.length, active, loadBrief])

  function toggleCovered(userId: number) {
    const wasCovered = covered.has(userId)
    const nextCovered = !wasCovered

    // Optimistic update so the spacebar feels instant.
    setCovered((prev) => {
      const next = new Set(prev)
      if (wasCovered) next.delete(userId)
      else next.add(userId)
      return next
    })

    // Persist
    ;(async () => {
      try {
        const res = await fetch(`/api/orgs/${orgId}/scrum/coverage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userId, covered: nextCovered }),
        })
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
      } catch (e) {
        console.error('[scrum] coverage save failed', e)
        // Roll back
        setCovered((prev) => {
          const next = new Set(prev)
          if (wasCovered) next.add(userId)
          else next.delete(userId)
          return next
        })
      }
    })()

    // Auto-advance to next uncovered when we just marked one done.
    if (nextCovered) {
      setTimeout(() => {
        const nextUncovered = members.findIndex(
          (m, i) => i > activeIdx && !covered.has(m.userId) && m.userId !== userId,
        )
        if (nextUncovered !== -1) setActiveIdx(nextUncovered)
      }, 50)
    }
  }

  async function resetCoverage() {
    if (!confirm('Reset today\'s coverage for everyone? This cannot be undone.')) return
    const previous = covered
    setCovered(new Set())
    try {
      const res = await fetch(`/api/orgs/${orgId}/scrum/coverage`, { method: 'DELETE' })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
    } catch (e) {
      console.error('[scrum] reset failed', e)
      setCovered(previous)
    }
  }

  const progress = `${covered.size} / ${members.length}`

  return (
    <div className="h-screen bg-white flex flex-col">
      {/* Top bar */}
      <header className="shrink-0 border-b border-slate-200 px-5 py-3 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Link href={`/org/${orgId}`} className="text-[12.5px] text-slate-500 hover:text-slate-900">
            ← Exit
          </Link>
          <div className="h-4 w-px bg-slate-200" />
          <p className="text-[12px] uppercase tracking-widest font-semibold text-slate-500">Scrum Mode</p>
          <span className="text-[13px] text-slate-700">{orgName}</span>
        </div>
        <div className="flex items-center gap-4 text-[12.5px] text-slate-600">
          <Hint k="↑↓" l="navigate" />
          <Hint k="Space" l="mark covered" />
          <Hint k="R" l="refresh" />
          <span className="text-slate-500">·</span>
          <span className="tabular-nums">
            Covered <span className="text-slate-900 font-semibold">{progress}</span>
          </span>
          {covered.size > 0 && (
            <button
              type="button"
              onClick={resetCoverage}
              className="text-[11.5px] text-slate-500 hover:text-slate-900 underline-offset-2 hover:underline transition"
              title="Clear today's coverage for everyone"
            >
              Reset
            </button>
          )}
        </div>
      </header>

      <div className="flex-1 grid grid-cols-12 min-h-0">
        {/* Roster rail */}
        <aside className="col-span-3 border-r border-slate-200 overflow-y-auto">
          {members.length === 0 ? (
            <p className="px-4 py-6 text-[12.5px] text-slate-500">No members yet.</p>
          ) : (
            <ul>
              {members.map((m, i) => {
                const isActive = i === activeIdx
                const isCovered = covered.has(m.userId)
                return (
                  <li key={m.userId}>
                    <button
                      type="button"
                      onClick={() => setActiveIdx(i)}
                      className={`w-full flex items-center gap-3 px-4 py-3 text-left transition border-l-4 ${
                        isActive
                          ? 'bg-indigo-50/70 border-indigo-500 text-slate-900'
                          : 'border-transparent hover:bg-slate-50 text-slate-700'
                      }`}
                    >
                      <CharacterAvatar characterKey={m.characterKey} size={32} ring={isActive} />
                      <div className="flex-1 min-w-0">
                        <p className={`text-[13px] truncate ${isActive ? 'font-semibold' : 'font-medium'}`}>
                          {m.name ?? `@${m.login}`}
                        </p>
                        <p className="text-[11px] text-slate-500 truncate">
                          {m.role}
                          {isCovered && <span className="ml-2 text-emerald-700">· covered</span>}
                        </p>
                      </div>
                      {isCovered && (
                        <span className="text-emerald-600">
                          <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
                            <path d="M5 13l4 4 10-10" strokeLinecap="round" strokeLinejoin="round" />
                          </svg>
                        </span>
                      )}
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
        </aside>

        {/* Brief — projection-friendly */}
        <main className="col-span-9 overflow-y-auto">
          {active && (
            <BriefPane
              member={active}
              brief={brief}
              loading={loading}
              err={err}
              covered={covered.has(active.userId)}
              onToggleCovered={() => toggleCovered(active.userId)}
              onRefresh={() => loadBrief(active.membershipId)}
            />
          )}
        </main>
      </div>
    </div>
  )
}

function BriefPane({
  member,
  brief,
  loading,
  err,
  covered,
  onToggleCovered,
  onRefresh,
}: {
  member: Member
  brief: Brief | null
  loading: boolean
  err: string | null
  covered: boolean
  onToggleCovered: () => void
  onRefresh: () => void
}) {
  return (
    <div className="px-10 py-8 max-w-5xl mx-auto">
      <div className="flex items-center gap-5 mb-7">
        <CharacterAvatar characterKey={member.characterKey} size={72} ring />
        <div className="flex-1 min-w-0">
          <p className="text-[12px] uppercase tracking-widest text-slate-500 font-semibold">Next up</p>
          <h1 className="mt-0.5 text-[34px] font-semibold text-slate-900 tracking-tight">
            {member.name ?? `@${member.login}`}
          </h1>
          <p className="text-[14px] text-slate-500 capitalize">{member.role}{' · '}@{member.login}</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onRefresh}
            className="px-3 py-1.5 rounded-md bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 text-[12.5px] font-medium transition"
          >
            Refresh
          </button>
          <button
            type="button"
            onClick={onToggleCovered}
            className={`px-3 py-1.5 rounded-md text-[12.5px] font-medium transition ${
              covered
                ? 'bg-emerald-50 border border-emerald-200 text-emerald-800'
                : 'bg-slate-900 hover:bg-slate-700 text-white'
            }`}
          >
            {covered ? '✓ Covered' : 'Mark covered'}
          </button>
        </div>
      </div>

      {err && (
        <p className="text-[13px] text-rose-600 mb-6">Could not load: {err}</p>
      )}
      {loading && !brief && (
        <p className="text-[13px] text-slate-500 mb-6">Loading…</p>
      )}

      {brief && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Yesterday stats — big numbers, scannable from across the room */}
          <section className="lg:col-span-3 grid grid-cols-2 md:grid-cols-4 gap-3">
            <BigStat n={brief.yesterdayCommits} label="commits" />
            <BigStat n={brief.yesterdayPrsOpened} label="PRs opened" />
            <BigStat n={brief.yesterdayReviews} label="reviews" />
            <BigStat n={brief.yesterdayIssuesClosed} label="issues closed" />
          </section>

          {/* Active blocker badge */}
          {brief.activeBlocker && (
            <section className="lg:col-span-3 rounded-xl border border-rose-200 bg-rose-50/60 px-5 py-4">
              <p className="text-[11px] uppercase tracking-widest text-rose-700 font-semibold">Blocker right now</p>
              <p className="mt-1 text-[17px] text-slate-900">
                Waiting on <span className="font-semibold">{brief.activeBlocker.waitingOn}</span>
                <span className="text-rose-600 text-[13px] ml-2">
                  · {humanDuration(Date.now() - new Date(brief.activeBlocker.startedAt).getTime())}
                </span>
              </p>
              {brief.activeBlocker.reason && (
                <p className="mt-1.5 text-[13.5px] text-slate-700">{brief.activeBlocker.reason}</p>
              )}
            </section>
          )}

          {/* Yesterday timeline / events */}
          <section className="lg:col-span-2 rounded-xl border border-slate-200 bg-white p-5">
            <p className="text-[11px] uppercase tracking-widest text-slate-500 font-semibold">Yesterday — what shipped</p>
            {brief.events.length === 0 ? (
              <p className="mt-2 text-[13.5px] text-slate-500">
                No GitHub events in the last 24 hours.
                {brief.lastSyncedAt && (
                  <span className="text-slate-400"> · last sync {timeAgo(brief.lastSyncedAt)}</span>
                )}
              </p>
            ) : (
              <ul className="mt-2 space-y-1.5 max-h-72 overflow-y-auto pr-1">
                {brief.events.map((e) => (
                  <li key={e.id} className="flex items-baseline gap-2 text-[13.5px]">
                    <span className="shrink-0 w-24 text-slate-500">{TYPE_LABEL[e.type] ?? e.type}</span>
                    <a
                      href={e.url}
                      target="_blank"
                      rel="noreferrer"
                      className="text-slate-900 hover:text-indigo-600 truncate"
                    >
                      {e.title}
                    </a>
                    <span className="ml-auto shrink-0 text-[11.5px] text-slate-400">{e.repo}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* Latest shift / today’s plan */}
          <section className="lg:col-span-1 rounded-xl border border-slate-200 bg-white p-5">
            <p className="text-[11px] uppercase tracking-widest text-slate-500 font-semibold">Latest shift summary</p>
            {brief.shiftSummary ? (
              <p className="mt-2 text-[13.5px] text-slate-700 leading-snug whitespace-pre-line">
                {brief.shiftSummary}
              </p>
            ) : (
              <p className="mt-2 text-[13px] text-slate-500">No summary captured yet.</p>
            )}
            {brief.shiftStatus && (
              <p className="mt-2 text-[11.5px] text-slate-500 capitalize">Status · {brief.shiftStatus}</p>
            )}
          </section>

          {brief.storyNarrative && (
            <section className="lg:col-span-3 rounded-xl border border-slate-200 bg-white p-5">
              <p className="text-[11px] uppercase tracking-widest text-slate-500 font-semibold">Latest brief</p>
              <p className="mt-2 text-[13.5px] text-slate-700 leading-relaxed whitespace-pre-line">
                {brief.storyNarrative}
              </p>
            </section>
          )}
        </div>
      )}
    </div>
  )
}

function BigStat({ n, label }: { n: number; label: string }) {
  const dim = n === 0
  return (
    <div className="rounded-xl border border-slate-200 bg-white px-5 py-4">
      <p className={`text-[36px] font-semibold tabular-nums tracking-tight ${dim ? 'text-slate-300' : 'text-slate-900'}`}>
        {n}
      </p>
      <p className="text-[12px] text-slate-500 mt-0.5">{label}</p>
    </div>
  )
}

function Hint({ k, l }: { k: string; l: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <kbd className="px-1.5 py-0.5 rounded border border-slate-200 bg-slate-50 text-[10.5px] font-mono text-slate-600">
        {k}
      </kbd>
      <span className="text-[11.5px] text-slate-500">{l}</span>
    </span>
  )
}

/**
 * Reshape the /detail payload into the scrum brief: yesterday-only counts,
 * trim to the last 24h of events, surface the active blocker if any.
 */
function deriveBrief(detail: {
  user: { lastSyncedAt: string | null }
  githubEvents: Array<{ id: number; type: string; title: string; url: string; repo: string; occurredAt: string }>
  recentBreaks: Array<{ category: string; reason: string; startedAt: string; endedAt: string | null; waitingOnExternal: string | null; waitingOnUserId?: number | null }>
  latestShift: { workSummary: string | null; verificationStatus: string | null } | null
  narrative: { body: string } | null
  story: { narrative: string } | null
}): Brief {
  const now = Date.now()
  const last24h = now - 24 * 60 * 60 * 1000
  const recent = detail.githubEvents.filter((e) => new Date(e.occurredAt).getTime() >= last24h)
  const count = (t: string) => recent.filter((e) => e.type === t).length

  const activeBreak = detail.recentBreaks.find((b) => !b.endedAt && b.category === 'blocked')
  const activeBlocker = activeBreak
    ? {
        reason: activeBreak.reason,
        waitingOn: activeBreak.waitingOnExternal ?? 'a teammate',
        startedAt: activeBreak.startedAt,
      }
    : null

  return {
    yesterdayCommits: count('commit'),
    yesterdayPrsOpened: count('pr_opened'),
    yesterdayReviews: count('pr_reviewed'),
    yesterdayIssuesClosed: count('issue_closed'),
    events: recent.slice(0, 20),
    activeBlocker,
    shiftSummary: detail.latestShift?.workSummary ?? null,
    shiftStatus: detail.latestShift?.verificationStatus ?? null,
    storyNarrative: detail.story?.narrative ?? detail.narrative?.body ?? null,
    lastSyncedAt: detail.user.lastSyncedAt,
  }
}

function humanDuration(ms: number): string {
  const m = Math.max(0, Math.floor(ms / 60000))
  if (m < 60) return `${m}m`
  const h = Math.floor(m / 60)
  const r = m % 60
  return r === 0 ? `${h}h` : `${h}h ${r}m`
}
function timeAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime()
  const m = Math.floor(ms / 60000)
  if (m < 1) return 'just now'
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  return `${Math.floor(h / 24)}d ago`
}
