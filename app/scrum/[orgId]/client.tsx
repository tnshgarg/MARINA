'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { CharacterAvatar } from '@/components/character-avatar'
import { TutorialHint } from '@/components/tutorial-hint'

type Member = {
  membershipId: number
  userId: number
  login: string
  name: string | null
  characterKey: string | null
  role: string
}

type Discipline =
  | 'engineering' | 'design' | 'product' | 'sales' | 'support'
  | 'marketing' | 'ops' | 'hr' | 'finance' | 'exec' | 'other'

const DISCIPLINE_LABEL: Record<Discipline, string> = {
  engineering: 'Engineering',
  design: 'Design',
  product: 'Product',
  sales: 'Sales',
  support: 'Support',
  marketing: 'Marketing',
  ops: 'Operations',
  hr: 'People',
  finance: 'Finance',
  exec: 'Leadership',
  other: 'Team',
}

const DISCIPLINE_DELIVERABLE_LABEL: Record<Discipline, string> = {
  engineering: 'deliverables',
  design: 'designs shipped',
  product: 'docs shipped',
  sales: 'deals worked',
  support: 'tickets closed',
  marketing: 'campaigns shipped',
  ops: 'tasks done',
  hr: 'cases handled',
  finance: 'reports filed',
  exec: 'decisions logged',
  other: 'deliverables',
}

type Brief = {
  discipline: Discipline
  jobTitle: string | null
  hasGithub: boolean
  yesterdayCommits: number
  yesterdayPrsOpened: number
  yesterdayReviews: number
  yesterdayIssuesClosed: number
  yesterdayDeliverableTotal: number
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
  trend: Array<{ date: string; total: number; focusMin: number }>
  todayMeetings: Array<{ id: number; title: string; startAt: string; endAt: string; conferenceUrl: string | null; rsvpStatus: string | null }>
  topRepos: Array<{ repo: string; events: number }>
  risks: Array<{ kind: string; severity: 'low' | 'medium' | 'high'; label: string }>
  weekShifts: Array<{ id: number; punchedInAt: string; totalMin: number }>
  productiveMin: number
  weekAvgProductiveMin: number
  weekMeetingsCount: number
}

const TYPE_LABEL: Record<string, string> = {
  commit: 'commit',
  pr_opened: 'opened PR',
  pr_reviewed: 'reviewed',
  issue_closed: 'closed issue',
}

const TYPE_DOT: Record<string, string> = {
  commit: 'var(--m-good)',
  pr_opened: 'var(--m-clay)',
  pr_reviewed: 'var(--m-info)',
  issue_closed: 'var(--m-warn)',
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
  const [nowTick, setNowTick] = useState(Date.now())

  const active = members[activeIdx]

  // Tick every 30s so the top clock + meeting "Live" pill stay current.
  useEffect(() => {
    const id = setInterval(() => setNowTick(Date.now()), 30_000)
    return () => clearInterval(id)
  }, [])

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
        // First-time load failure leaves the set empty.
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [members.length, active, loadBrief])

  function toggleCovered(userId: number) {
    const wasCovered = covered.has(userId)
    const nextCovered = !wasCovered
    setCovered((prev) => {
      const next = new Set(prev)
      if (wasCovered) next.delete(userId)
      else next.add(userId)
      return next
    })
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
        setCovered((prev) => {
          const next = new Set(prev)
          if (wasCovered) next.add(userId)
          else next.delete(userId)
          return next
        })
      }
    })()
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
    if (!confirm("Reset today's coverage for everyone? This cannot be undone.")) return
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
  const todayLabel = new Date(nowTick).toLocaleDateString(undefined, {
    weekday: 'long',
    day: 'numeric',
    month: 'short',
  })

  return (
    <div className="h-screen bg-[var(--m-bg)] flex flex-col">
      {/* Top bar */}
      <header className="shrink-0 border-b border-[var(--m-border)] bg-white px-5 py-2.5 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3 min-w-0">
          <Link
            href={`/org/${orgId}`}
            className="text-[12.5px] text-[var(--m-ink-3)] hover:text-[var(--m-ink)] transition"
          >
            ← Exit
          </Link>
          <div className="h-4 w-px bg-[var(--m-border)]" />
          <p className="text-[11px] uppercase tracking-[0.18em] font-semibold text-[var(--m-accent)]">
            Standup Mode
          </p>
          <span className="text-[13px] font-medium text-[var(--m-ink)] truncate">{orgName}</span>
          <span className="text-[12px] text-[var(--m-ink-4)] hidden md:inline">· {todayLabel}</span>
        </div>
        <div className="flex items-center gap-4 text-[12.5px] text-[var(--m-ink-2)]">
          <div className="hidden lg:flex items-center gap-3">
            <Hint k="↑↓" l="navigate" />
            <Hint k="Space" l="mark covered" />
            <Hint k="R" l="refresh" />
          </div>
          <div className="flex items-center gap-2.5 px-2.5 py-1 rounded-md bg-[var(--m-accent-soft)] border border-[var(--m-accent)]/15">
            <span className="text-[11px] uppercase tracking-wider font-semibold text-[var(--m-accent-2)]">
              Coverage
            </span>
            <span className="text-[13px] font-semibold tabular-nums text-[var(--m-ink)]">
              {progress}
            </span>
          </div>
          {covered.size > 0 && (
            <button
              type="button"
              onClick={resetCoverage}
              className="text-[11.5px] text-[var(--m-ink-3)] hover:text-[var(--m-ink)] underline-offset-2 hover:underline transition"
              title="Clear today's coverage for everyone"
            >
              Reset
            </button>
          )}
        </div>
      </header>

      <div className="flex-1 grid grid-cols-12 min-h-0">
        {/* Roster rail */}
        <aside className="col-span-3 border-r border-[var(--m-border)] overflow-y-auto bg-white">
          {members.length === 0 ? (
            <p className="px-4 py-6 text-[12.5px] text-[var(--m-ink-3)]">No members yet.</p>
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
                      className={`w-full flex items-center gap-3 px-4 py-2.5 text-left transition border-l-4 ${
                        isActive
                          ? 'bg-[var(--m-accent-soft)] border-[var(--m-accent)] text-[var(--m-ink)]'
                          : isCovered
                          ? 'border-transparent hover:bg-[var(--m-bg-soft)] text-[var(--m-ink-3)]'
                          : 'border-transparent hover:bg-[var(--m-bg-soft)] text-[var(--m-ink)]'
                      }`}
                    >
                      <CharacterAvatar characterKey={m.characterKey} name={m.name} login={m.login} size={28} ring={isActive} />
                      <div className="flex-1 min-w-0">
                        <p
                          className={`text-[13px] truncate ${
                            isActive ? 'font-semibold' : 'font-medium'
                          } ${isCovered ? 'line-through opacity-70' : ''}`}
                        >
                          {m.name ?? `@${m.login}`}
                        </p>
                        <p className="text-[10.5px] text-[var(--m-ink-4)] truncate uppercase tracking-wider">
                          {m.role}
                        </p>
                      </div>
                      {isCovered && (
                        <span className="text-[var(--m-good)]">
                          <svg
                            width={14}
                            height={14}
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth={2.5}
                          >
                            <path
                              d="M5 13l4 4 10-10"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            />
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

        {/* Brief */}
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
              nowTick={nowTick}
              position={activeIdx + 1}
              total={members.length}
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
  nowTick,
  position,
  total,
}: {
  member: Member
  brief: Brief | null
  loading: boolean
  err: string | null
  covered: boolean
  onToggleCovered: () => void
  onRefresh: () => void
  nowTick: number
  position: number
  total: number
}) {
  return (
    <div className="px-8 lg:px-10 py-7 max-w-6xl mx-auto">
      {/* First-time keyboard cheatsheet. Auto-hides after the user dismisses
          it on this browser; we don't want it cluttering returning sessions. */}
      <div className="mb-5">
        <TutorialHint id="scrum-mode-keyboard" title="Drive this with your keyboard">
          Press <kbd className="px-1 py-0.5 rounded bg-white border border-[var(--m-border)] font-mono text-[10.5px]">↑</kbd>{' '}
          <kbd className="px-1 py-0.5 rounded bg-white border border-[var(--m-border)] font-mono text-[10.5px]">↓</kbd>{' '}
          to move between teammates,{' '}
          <kbd className="px-1 py-0.5 rounded bg-white border border-[var(--m-border)] font-mono text-[10.5px]">Space</kbd>{' '}
          to mark covered, and{' '}
          <kbd className="px-1 py-0.5 rounded bg-white border border-[var(--m-border)] font-mono text-[10.5px]">R</kbd>{' '}
          to refresh the brief. Your coverage state is saved per-day so you can pause and resume.
        </TutorialHint>
      </div>

      {/* Person header */}
      <div className="flex items-center gap-5 mb-6">
        <CharacterAvatar characterKey={member.characterKey} name={member.name} login={member.login} size={68} ring />
        <div className="flex-1 min-w-0">
          <p className="text-[11px] uppercase tracking-[0.18em] text-[var(--m-ink-4)] font-semibold">
            Next up · {position} of {total}
          </p>
          <h1 className="mt-0.5 text-[32px] font-semibold text-[var(--m-ink)] tracking-tight">
            {member.name ?? `@${member.login}`}
          </h1>
          <p className="text-[13.5px] text-[var(--m-ink-3)] capitalize">
            {member.role} · @{member.login}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onRefresh}
            className="px-3 py-1.5 rounded-md bg-white border border-[var(--m-border)] hover:bg-[var(--m-bg-soft)] text-[var(--m-ink-2)] text-[12.5px] font-medium transition"
          >
            Refresh
          </button>
          <button
            type="button"
            onClick={onToggleCovered}
            className={`px-3.5 py-1.5 rounded-md text-[12.5px] font-medium transition ${
              covered
                ? 'bg-[var(--m-good-soft)] border border-[var(--m-good)]/30 text-[var(--m-good)]'
                : 'bg-[var(--m-ink)] hover:bg-[var(--m-ink-2)] text-white'
            }`}
          >
            {covered ? '✓ Covered' : 'Mark covered'}
          </button>
        </div>
      </div>

      {err && (
        <p className="text-[13px] text-[var(--m-bad)] mb-6">Could not load: {err}</p>
      )}
      {loading && !brief && (
        <p className="text-[13px] text-[var(--m-ink-3)] mb-6">Loading…</p>
      )}

      {brief && (
        <>
          {/* Risk + blocker callouts — top priority, never hidden */}
          {brief.activeBlocker && (
            <section className="mb-5 rounded-xl border border-[var(--m-bad)]/25 bg-[var(--m-bad-soft)]/70 px-5 py-4">
              <p className="text-[11px] uppercase tracking-[0.18em] text-[var(--m-bad)] font-semibold flex items-center gap-2">
                <span className="relative inline-flex">
                  <span className="absolute inset-0 rounded-full bg-[var(--m-bad)]/40 animate-ping" />
                  <span className="relative inline-block w-1.5 h-1.5 rounded-full bg-[var(--m-bad)]" />
                </span>
                Active blocker
              </p>
              <p className="mt-1.5 text-[18px] text-[var(--m-ink)]">
                Waiting on <span className="font-semibold">{brief.activeBlocker.waitingOn}</span>
                <span className="text-[var(--m-bad)] text-[13.5px] ml-2 tabular-nums">
                  for {humanDurationMs(nowTick - new Date(brief.activeBlocker.startedAt).getTime())}
                </span>
              </p>
              {brief.activeBlocker.reason && (
                <p className="mt-1.5 text-[13.5px] text-[var(--m-ink-2)]">
                  {brief.activeBlocker.reason}
                </p>
              )}
            </section>
          )}

          {brief.risks.length > 0 && (
            <section className="mb-5 flex flex-wrap gap-1.5">
              {brief.risks.map((r, i) => (
                <RiskChip key={i} severity={r.severity} label={r.label} />
              ))}
            </section>
          )}

          {/* Yesterday stats — discipline-aware so non-engineering roles
              don't see four zeroed-out PR/commit tiles */}
          {brief.discipline === 'engineering' && brief.hasGithub ? (
            <section className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
              <BigStat n={brief.yesterdayCommits} label="commits" />
              <BigStat n={brief.yesterdayPrsOpened} label="PRs opened" />
              <BigStat n={brief.yesterdayReviews} label="reviews" />
              <BigStat n={brief.yesterdayIssuesClosed} label="issues closed" />
            </section>
          ) : (
            <section className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
              <BigStat
                n={brief.productiveMin}
                label="min focused yesterday"
                fmt={(n) => (n < 60 ? `${n}m` : `${Math.floor(n / 60)}h ${n % 60 ? `${n % 60}m` : ''}`)}
              />
              <BigStat
                n={brief.weekMeetingsCount}
                label="meetings this week"
              />
              <BigStat
                n={brief.yesterdayDeliverableTotal}
                label={DISCIPLINE_DELIVERABLE_LABEL[brief.discipline]}
              />
              <BigStat
                n={brief.weekShifts.length}
                label="shifts logged"
              />
            </section>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
            {/* Yesterday — what shipped (GitHub) OR universal recap */}
            {brief.hasGithub && brief.discipline === 'engineering' ? (
              <section className="lg:col-span-2 rounded-xl border border-[var(--m-border)] bg-white p-5">
                <SectionHeader title="Yesterday — what shipped" />
                {brief.events.length === 0 ? (
                  <p className="mt-2 text-[13.5px] text-[var(--m-ink-3)]">
                    No GitHub events in the last 24 hours.
                    {brief.lastSyncedAt && (
                      <span className="text-[var(--m-ink-4)]">
                        {' '}· last sync {timeAgo(brief.lastSyncedAt)}
                      </span>
                    )}
                  </p>
                ) : (
                  <ul className="mt-2.5 space-y-1.5 max-h-72 overflow-y-auto pr-1">
                    {brief.events.map((e) => (
                      <li
                        key={e.id}
                        className="flex items-baseline gap-2.5 text-[13.5px] leading-snug"
                      >
                        <span
                          className="shrink-0 inline-block w-1.5 h-1.5 rounded-full mt-1"
                          style={{ background: TYPE_DOT[e.type] ?? 'var(--m-ink-5)' }}
                        />
                        <span className="shrink-0 w-20 text-[var(--m-ink-3)] text-[12px]">
                          {TYPE_LABEL[e.type] ?? e.type}
                        </span>
                        <a
                          href={e.url}
                          target="_blank"
                          rel="noreferrer"
                          className="text-[var(--m-ink)] hover:text-[var(--m-accent)] truncate flex-1"
                        >
                          {e.title}
                        </a>
                        <span className="ml-auto shrink-0 text-[11px] text-[var(--m-ink-4)] truncate max-w-[140px]">
                          {e.repo}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            ) : (
              <section className="lg:col-span-2 rounded-xl border border-[var(--m-border)] bg-white p-5">
                <SectionHeader title="Yesterday in their words" />
                {brief.storyNarrative ? (
                  <p className="mt-2 text-[13.5px] text-[var(--m-ink-2)] leading-relaxed whitespace-pre-line">
                    {brief.storyNarrative}
                  </p>
                ) : brief.shiftSummary ? (
                  <p className="mt-2 text-[13.5px] text-[var(--m-ink-2)] leading-relaxed whitespace-pre-line">
                    {brief.shiftSummary}
                  </p>
                ) : (
                  <p className="mt-2 text-[13px] text-[var(--m-ink-3)]">
                    No story captured yet. The agent generates one once they punch out.
                  </p>
                )}
              </section>
            )}

            {/* 7-day trend + focus */}
            <section className="lg:col-span-1 rounded-xl border border-[var(--m-border)] bg-white p-5">
              <SectionHeader title="7-day output trend" />
              <TrendStrip trend={brief.trend} />
              <p className="mt-3 text-[11.5px] text-[var(--m-ink-3)]">
                Productive today{' '}
                <span className="font-semibold text-[var(--m-ink)] tabular-nums">
                  {humanDurationMin(brief.productiveMin)}
                </span>
                {brief.weekAvgProductiveMin > 0 && (
                  <span className="text-[var(--m-ink-4)]">
                    {' '}
                    · avg {humanDurationMin(brief.weekAvgProductiveMin)}
                  </span>
                )}
              </p>
            </section>

            {/* Today's meetings */}
            {brief.todayMeetings.length > 0 && (
              <section className="lg:col-span-2 rounded-xl border border-[var(--m-border)] bg-white p-5">
                <SectionHeader title="Today's calendar" hint={`${brief.todayMeetings.length} meetings`} />
                <ul className="mt-2.5 space-y-1.5">
                  {brief.todayMeetings.slice(0, 5).map((m) => {
                    const start = new Date(m.startAt).getTime()
                    const end = new Date(m.endAt).getTime()
                    const isLive = nowTick >= start && nowTick <= end
                    const isPast = nowTick > end
                    return (
                      <li
                        key={m.id}
                        className={`flex items-center gap-3 text-[13px] ${
                          isPast ? 'opacity-50' : ''
                        }`}
                      >
                        <span className="shrink-0 w-16 text-[var(--m-ink-3)] tabular-nums text-[12px]">
                          {fmtClock(m.startAt)}
                        </span>
                        <span className="text-[var(--m-ink)] truncate flex-1">{m.title}</span>
                        {isLive && (
                          <span className="shrink-0 text-[10px] uppercase tracking-wider font-semibold text-[var(--m-good)]">
                            Live
                          </span>
                        )}
                        {m.rsvpStatus && m.rsvpStatus !== 'accepted' && !isLive && (
                          <span className="shrink-0 text-[10px] uppercase tracking-wider text-[var(--m-ink-4)]">
                            {m.rsvpStatus}
                          </span>
                        )}
                      </li>
                    )
                  })}
                </ul>
              </section>
            )}

            {/* Top repos — only meaningful for engineers with GitHub linked */}
            {brief.hasGithub && brief.topRepos.length > 0 && (
              <section className="lg:col-span-1 rounded-xl border border-[var(--m-border)] bg-white p-5">
                <SectionHeader title="Working in" />
                <ul className="mt-2.5 space-y-1.5">
                  {brief.topRepos.slice(0, 4).map((r) => (
                    <li
                      key={r.repo}
                      className="flex items-center justify-between gap-2 text-[12.5px]"
                    >
                      <span className="text-[var(--m-ink)] truncate font-medium">{r.repo}</span>
                      <span className="shrink-0 text-[11px] text-[var(--m-ink-3)] tabular-nums">
                        {r.events}
                      </span>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {/* Talking points — auto-generated questions */}
            <section className="lg:col-span-2 rounded-xl border border-[var(--m-accent)]/20 bg-gradient-to-br from-[var(--m-accent-soft)]/40 to-white p-5">
              <SectionHeader title="Questions to ask" hint="auto-generated" />
              <ul className="mt-2.5 space-y-1.5 text-[13.5px] text-[var(--m-ink)]">
                {buildTalkingPoints(brief, member).map((q, i) => (
                  <li key={i} className="flex items-start gap-2">
                    <span className="text-[var(--m-accent)] mt-0.5">·</span>
                    <span>{q}</span>
                  </li>
                ))}
              </ul>
            </section>

            {/* Latest shift summary */}
            <section className="lg:col-span-1 rounded-xl border border-[var(--m-border)] bg-white p-5">
              <SectionHeader title="Latest shift" />
              {brief.shiftSummary ? (
                <p className="mt-2 text-[13px] text-[var(--m-ink-2)] leading-snug whitespace-pre-line">
                  {brief.shiftSummary}
                </p>
              ) : (
                <p className="mt-2 text-[12.5px] text-[var(--m-ink-3)] italic">
                  No summary captured yet.
                </p>
              )}
              {brief.shiftStatus && (
                <p className="mt-2 text-[11px] uppercase tracking-wider text-[var(--m-ink-4)]">
                  Verification · {brief.shiftStatus}
                </p>
              )}
            </section>

            {/* Story narrative */}
            {brief.storyNarrative && (
              <section className="lg:col-span-3 rounded-xl border border-[var(--m-border)] bg-white p-5">
                <SectionHeader title="Today's brief" />
                <p className="mt-2 text-[13.5px] text-[var(--m-ink-2)] leading-relaxed whitespace-pre-line">
                  {brief.storyNarrative}
                </p>
              </section>
            )}
          </div>
        </>
      )}
    </div>
  )
}

function BigStat({
  n,
  label,
  fmt,
}: {
  n: number
  label: string
  fmt?: (n: number) => string
}) {
  const dim = n === 0
  const display = fmt ? fmt(n) : String(n)
  return (
    <div className="rounded-xl border border-[var(--m-border)] bg-white px-5 py-3.5">
      <p
        className={`text-[34px] font-semibold tabular-nums tracking-tight ${
          dim ? 'text-[var(--m-ink-5)]' : 'text-[var(--m-ink)]'
        }`}
      >
        {display}
      </p>
      <p className="text-[11.5px] text-[var(--m-ink-3)] mt-0.5">{label}</p>
    </div>
  )
}

function RiskChip({ severity, label }: { severity: 'low' | 'medium' | 'high'; label: string }) {
  const c =
    severity === 'high'
      ? { bg: 'bg-[var(--m-bad-soft)]', fg: 'text-[var(--m-bad)]', dot: 'var(--m-bad)' }
      : severity === 'medium'
      ? { bg: 'bg-[var(--m-warn-soft)]', fg: 'text-[var(--m-warn)]', dot: 'var(--m-warn)' }
      : { bg: 'bg-[var(--m-bg-soft)]', fg: 'text-[var(--m-ink-2)]', dot: 'var(--m-ink-5)' }
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-[11.5px] ${c.bg} ${c.fg}`}
    >
      <span className="inline-block w-1.5 h-1.5 rounded-full" style={{ background: c.dot }} />
      {label}
    </span>
  )
}

function TrendStrip({ trend }: { trend: Brief['trend'] }) {
  const max = Math.max(1, ...trend.map((d) => d.total))
  return (
    <div className="grid grid-cols-7 gap-1 mt-2">
      {trend.map((d) => {
        const h = Math.round((d.total / max) * 48)
        const dayNum = Number(d.date.slice(-2))
        const dow = new Date(d.date + 'T00:00:00').toLocaleDateString(undefined, { weekday: 'short' })
        return (
          <div
            key={d.date}
            className="flex flex-col items-center gap-1"
            title={`${dow} · ${d.total} events · ${humanDurationMin(d.focusMin)} focus`}
          >
            <div className="h-12 flex items-end">
              <span
                className="w-3 rounded-sm bg-[var(--m-accent)]"
                style={{ height: `${Math.max(2, h)}px` }}
              />
            </div>
            <span className="text-[9px] uppercase tracking-wider text-[var(--m-ink-4)]">
              {dow.slice(0, 1)}
            </span>
            <span className="text-[9.5px] tabular-nums text-[var(--m-ink-3)]">{dayNum}</span>
          </div>
        )
      })}
    </div>
  )
}

function SectionHeader({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <p className="text-[10.5px] uppercase tracking-[0.18em] text-[var(--m-ink-4)] font-semibold">
        {title}
      </p>
      {hint && <span className="text-[10.5px] text-[var(--m-ink-4)]">{hint}</span>}
    </div>
  )
}

function Hint({ k, l }: { k: string; l: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <kbd className="px-1.5 py-0.5 rounded border border-[var(--m-border)] bg-[var(--m-bg-soft)] text-[10.5px] font-mono text-[var(--m-ink-3)]">
        {k}
      </kbd>
      <span className="text-[11.5px] text-[var(--m-ink-4)]">{l}</span>
    </span>
  )
}

/**
 * Auto-generate 3–5 talking-point questions for the manager based on the
 * brief. Pure heuristic — no LLM cost. The questions exist so the manager
 * never blanks at "what do I ask Priya today?"
 */
function buildTalkingPoints(brief: Brief, member: Member): string[] {
  const out: string[] = []
  const name = member.name?.split(' ')[0] ?? `@${member.login}`
  const deliverableNoun = DISCIPLINE_DELIVERABLE_LABEL[brief.discipline]

  if (brief.activeBlocker) {
    out.push(
      `What's the plan to unblock the dependency on ${brief.activeBlocker.waitingOn}?`,
    )
  }

  // Engineering-specific prompts only fire when GitHub is wired up
  if (brief.hasGithub && brief.discipline === 'engineering') {
    if (brief.yesterdayPrsOpened > 0) {
      out.push('Which PR needs eyes today, and who would be the right reviewer?')
    }
    if (brief.yesterdayCommits === 0 && brief.yesterdayReviews === 0 && brief.yesterdayPrsOpened === 0) {
      out.push(`What's keeping ${name} from shipping — is there scope or clarity missing?`)
    }
    if (brief.topRepos.length >= 1) {
      out.push(`Most of the week was in ${brief.topRepos[0]!.repo} — what's the next milestone there?`)
    }
  } else {
    // Discipline-aware prompts for non-engineering teams
    out.push(...disciplinePrompts(brief, name, deliverableNoun))
  }

  // Universal prompts (calendar, focus) — work for any role
  if (brief.todayMeetings.length >= 4) {
    out.push(
      `${name} has ${brief.todayMeetings.length} meetings today — is there focus time to protect?`,
    )
  }
  if (brief.weekAvgProductiveMin > 0 && brief.productiveMin < brief.weekAvgProductiveMin * 0.6) {
    out.push("Today's focus time is well below the weekly average — what changed?")
  }

  if (out.length < 3) {
    out.push("Anything that didn't land yesterday that's now at risk?")
    out.push('What can the team do today to make tomorrow easier for you?')
  }
  return out.slice(0, 5)
}

function disciplinePrompts(brief: Brief, name: string, _noun: string): string[] {
  switch (brief.discipline) {
    case 'design':
      return [
        `What's ${name} designing this week, and who's the reviewer?`,
        'Is there a design review on the calendar this week, or should we book one?',
      ]
    case 'product':
      return [
        `What's the most important spec ${name} is shaping right now?`,
        'Which decision is blocked waiting for input from the team?',
      ]
    case 'sales':
      return [
        `Which deal is at the highest risk this week?`,
        'How many calls / demos are booked, and which ones need prep?',
      ]
    case 'support':
      return [
        'Any escalations or repeated patterns worth flagging to product?',
        'Which ticket is taking the most time and why?',
      ]
    case 'marketing':
      return [
        `What's shipping this week — content, campaign or launch?`,
        'Where would help unblock the next release?',
      ]
    case 'ops':
      return [
        `Which task is the bottleneck for the team this week?`,
        'Any process friction worth fixing now vs later?',
      ]
    case 'hr':
      return [
        'Any people-issues to flag confidentially?',
        'Hiring funnel — what stage is the bottleneck right now?',
      ]
    case 'finance':
      return [
        'Which report is closing this week?',
        'Are there approvals stuck in the queue?',
      ]
    case 'exec':
      return [
        'What decision needs the team aligned this week?',
        'Where are you spending time that should be delegated?',
      ]
    case 'other':
    default:
      return [
        `What's the single most important thing ${name} is working on this week?`,
        'Anything blocking you that I can help unstick today?',
      ]
  }
}

function deriveBrief(detail: {
  user: { lastSyncedAt: string | null; hasGithub?: boolean }
  discipline?: Discipline
  jobTitle?: string | null
  githubEvents: Array<{
    id: number
    type: string
    title: string
    url: string
    repo: string
    occurredAt: string
  }>
  recentBreaks: Array<{
    category: string
    reason: string
    startedAt: string
    endedAt: string | null
    waitingOnExternal: string | null
    waitingOnUserId?: number | null
  }>
  latestShift: { workSummary: string | null; verificationStatus: string | null } | null
  narrative: { body: string } | null
  story: { narrative: string } | null
  last7DaysOutput?: Array<{
    date: string
    commits: number
    prs: number
    reviews: number
    issues: number
    focusMin: number
  }>
  topRepos?: Array<{ repo: string; events: number }>
  todayMeetings?: Array<{
    id: number
    title: string
    startAt: string
    endAt: string
    conferenceUrl: string | null
    rsvpStatus: string | null
  }>
  risks?: Array<{ kind: string; severity: 'low' | 'medium' | 'high'; label: string }>
  last7Shifts?: Array<{ id: number; punchedInAt: string; totalMin: number }>
  shiftTotals?: { workMin: number; breakMin: number; idleMin: number }
  weekMeetingsCount?: number
}): Brief {
  const now = Date.now()
  const last24h = now - 24 * 60 * 60 * 1000
  const recent = detail.githubEvents.filter(
    (e) => new Date(e.occurredAt).getTime() >= last24h,
  )
  const count = (t: string) => recent.filter((e) => e.type === t).length

  const activeBreak = detail.recentBreaks.find(
    (b) => !b.endedAt && b.category === 'blocked',
  )
  const activeBlocker = activeBreak
    ? {
        reason: activeBreak.reason,
        waitingOn: activeBreak.waitingOnExternal ?? 'a teammate',
        startedAt: activeBreak.startedAt,
      }
    : null

  const trend = (detail.last7DaysOutput ?? []).map((d) => ({
    date: d.date,
    total: d.commits + d.prs + d.reviews + d.issues,
    focusMin: d.focusMin,
  }))

  const weekShifts = (detail.last7Shifts ?? []).map((s) => ({
    id: s.id,
    punchedInAt: s.punchedInAt,
    totalMin: s.totalMin,
  }))
  const productiveMin = detail.shiftTotals?.workMin ?? 0
  const weekAvgProductiveMin =
    weekShifts.length > 0
      ? Math.round(
          weekShifts.reduce((a, s) => a + s.totalMin, 0) / weekShifts.length * 0.7,
        )
      : 0

  const yesterdayCommits = count('commit')
  const yesterdayPrsOpened = count('pr_opened')
  const yesterdayReviews = count('pr_reviewed')
  const yesterdayIssuesClosed = count('issue_closed')
  return {
    discipline: (detail.discipline ?? 'other') as Discipline,
    jobTitle: detail.jobTitle ?? null,
    hasGithub: !!detail.user.hasGithub,
    yesterdayCommits,
    yesterdayPrsOpened,
    yesterdayReviews,
    yesterdayIssuesClosed,
    yesterdayDeliverableTotal:
      yesterdayCommits + yesterdayPrsOpened + yesterdayReviews + yesterdayIssuesClosed,
    events: recent.slice(0, 20),
    activeBlocker,
    shiftSummary: detail.latestShift?.workSummary ?? null,
    shiftStatus: detail.latestShift?.verificationStatus ?? null,
    storyNarrative: detail.story?.narrative ?? detail.narrative?.body ?? null,
    lastSyncedAt: detail.user.lastSyncedAt,
    trend,
    topRepos: detail.topRepos ?? [],
    todayMeetings: detail.todayMeetings ?? [],
    risks: detail.risks ?? [],
    weekShifts,
    productiveMin,
    weekAvgProductiveMin,
    weekMeetingsCount: detail.weekMeetingsCount ?? 0,
  }
}

function humanDurationMs(ms: number): string {
  const m = Math.max(0, Math.floor(ms / 60_000))
  if (m < 60) return `${m}m`
  const h = Math.floor(m / 60)
  const r = m % 60
  return r === 0 ? `${h}h` : `${h}h ${r}m`
}
function humanDurationMin(min: number): string {
  if (min < 60) return `${min}m`
  const h = Math.floor(min / 60)
  const m = min % 60
  return m === 0 ? `${h}h` : `${h}h ${m}m`
}
function fmtClock(iso: string): string {
  return new Date(iso).toLocaleTimeString(undefined, {
    hour: 'numeric',
    minute: '2-digit',
  })
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
