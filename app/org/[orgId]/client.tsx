'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { CharacterAvatar } from '@/components/character-avatar'
import { getCharacter } from '@/lib/characters/data'

type Signal = 'High' | 'Steady' | 'Low' | 'Blocked'
type DailyState = 'High' | 'Steady' | 'Blocked' | 'Disengaged' | 'PossiblyDummying' | 'NoData'

type MemberCard = {
  membershipId: number
  userId: number
  login: string
  name: string | null
  avatarUrl: string | null
  characterKey: string | null
  role: string
  hasGithub: boolean
  activity: {
    activeSeconds: number
    idleSeconds: number
    topApp: string | null
    paused: boolean
  }
  onLeaveToday: boolean
  ongoingBreak: { id: number; reason: string; startedAt: string } | null
  activeShift: { id: number; punchedInAt: string } | null
  dailyState: {
    state: DailyState
    reason: string
    outputCount: number
    focusWorkRatio: number
    staticIdleRuns: number
  } | null
  narrative: {
    body: string
    signal: Signal
    createdAt: string
  } | null
}

type PendingLeave = {
  id: number
  startDate: string
  endDate: string
  reason: string
  createdAt: string
  user: { id: number; login: string; name: string | null; characterKey: string | null }
}

type RecentBreak = {
  id: number
  startedAt: string
  endedAt: string | null
  reason: string
  user: { id: number; login: string; name: string | null; characterKey: string | null }
}

type Snapshot = {
  followupCount: number
  onLeaveCount: number
  activeCount: number
  waitingOnReview: number
  totalMembers: number
}

const STATUS: Record<
  DailyState,
  { label: string; pill: string; current: string }
> = {
  High: { label: 'Productive', pill: 'pill-good', current: 'On track' },
  Steady: { label: 'Productive', pill: 'pill-good', current: 'On track' },
  Blocked: { label: 'Needs help', pill: 'pill-warn', current: 'Blocked' },
  Disengaged: { label: 'Inactive', pill: 'pill-bad', current: 'Inactive' },
  PossiblyDummying: { label: 'Decoy detected', pill: 'pill-pink', current: 'Decoy' },
  NoData: { label: 'No data', pill: 'pill-slate', current: 'Unknown' },
}

export default function TeamDashboardClient({
  orgId,
  isManager,
  greeting,
  snapshot,
  members,
  pendingLeaves,
  recentBreaks,
}: {
  orgId: number
  isManager: boolean
  greeting: string
  snapshot: Snapshot
  members: MemberCard[]
  pendingLeaves: PendingLeave[]
  recentBreaks: RecentBreak[]
}) {
  const router = useRouter()
  const [query, setQuery] = useState('')
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return members
    return members.filter((m) =>
      (m.name ?? '').toLowerCase().includes(q) ||
      m.login.toLowerCase().includes(q) ||
      (m.activity.topApp ?? '').toLowerCase().includes(q)
    )
  }, [members, query])

  async function decideLeave(leaveId: number, decision: 'approve' | 'deny') {
    setBusy(`leave-${leaveId}-${decision}`)
    setError(null)
    try {
      const res = await fetch(`/api/orgs/${orgId}/leaves/${leaveId}/decide`, {
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

  // "Things worth reviewing today" — up to 3 picks
  const reviewing = useMemo(() => {
    const picks: Array<{
      kind: 'leave' | 'block' | 'inactive'
      member: MemberCard | null
      leave?: PendingLeave
      label: string
      detail: string
    }> = []

    // First pick a pending leave (if any) — render alongside
    if (pendingLeaves[0]) {
      const lv = pendingLeaves[0]
      const member = members.find((m) => m.userId === lv.user.id) ?? null
      picks.push({
        kind: 'leave',
        member,
        leave: lv,
        label: 'Leave request',
        detail: lv.reason,
      })
    }

    // Picks for blocked / inactive members
    for (const m of members) {
      if (picks.length >= 3) break
      if (!m.dailyState) continue
      if (m.dailyState.state === 'Blocked' && !picks.find((p) => p.member?.userId === m.userId)) {
        picks.push({
          kind: 'block',
          member: m,
          label: 'Waiting on review',
          detail: m.dailyState.reason,
        })
      } else if (
        (m.dailyState.state === 'Disengaged' || m.dailyState.state === 'PossiblyDummying') &&
        !picks.find((p) => p.member?.userId === m.userId)
      ) {
        picks.push({
          kind: 'inactive',
          member: m,
          label: 'Inactive',
          detail: m.dailyState.reason,
        })
      }
    }
    return picks.slice(0, 3)
  }, [members, pendingLeaves])

  return (
    <>
      <div className="flex items-start justify-between gap-4 flex-wrap mb-6">
        <div>
          <h1 className="app-h1">{greeting}</h1>
          <p className="mt-1 app-sub">Here&apos;s what&apos;s happening with your team today.</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="btn-secondary text-slate-600">
            <CalIcon /> Today, {new Date().toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}
          </span>
          <button onClick={() => router.refresh()} className="btn-secondary">
            <RefreshIcon /> Refresh
          </button>
        </div>
      </div>

      <div className="grid grid-cols-12 gap-6">
        {/* Main column */}
        <div className="col-span-12 xl:col-span-9 space-y-6">
          {/* Snapshot */}
          <section className="app-card app-card-lg hover-lift rise-in">
            <div className="flex items-start justify-between gap-4 flex-wrap">
              <div>
                <h2 className="app-h2">Today&apos;s Team Snapshot</h2>
                <p className="app-sub mt-1">A quick overview of your team&apos;s day.</p>
              </div>
            </div>
            <div className="mt-4 grid grid-cols-2 md:grid-cols-4 gap-3">
              <div className="rise-in stagger-1">
                <StatTile
                  count={snapshot.followupCount}
                  label="Need follow-up"
                  sub="See details →"
                  bg="#ede9fe"
                  color="#7c3aed"
                  icon={<FollowUpIcon />}
                />
              </div>
              <div className="rise-in stagger-2">
                <StatTile
                  count={snapshot.onLeaveCount}
                  label="Leave requests"
                  sub={`${pendingLeaves.length} pending`}
                  bg="#fef3c7"
                  color="#b45309"
                  icon={<LeaveIcon />}
                />
              </div>
              <div className="rise-in stagger-3">
                <StatTile
                  count={snapshot.activeCount}
                  label="Actively working"
                  sub="On track"
                  bg="#dcfce7"
                  color="#15803d"
                  icon={<SmileIcon />}
                />
              </div>
              <div className="rise-in stagger-4">
                <StatTile
                  count={snapshot.waitingOnReview}
                  label="Waiting on review"
                  sub="From others"
                  bg="#dbeafe"
                  color="#1d4ed8"
                  icon={<ClockIcon />}
                />
              </div>
            </div>
          </section>

          {/* Things worth reviewing */}
          <section className="app-card app-card-lg hover-lift rise-in stagger-2">
            <div className="section-title-row">
              <div>
                <h2 className="app-h2">Things worth reviewing today</h2>
                <p className="app-sub mt-1">A little attention can make a big difference.</p>
              </div>
              <Link href={`/org/${orgId}/leaves`} className="text-[13px] text-indigo-600 hover:text-indigo-700 font-medium transition-colors">
                View all ({pendingLeaves.length})
              </Link>
            </div>
            <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-3">
              {reviewing.length === 0 && (
                <p className="app-sub col-span-3 py-8 text-center">
                  Nothing urgent. Your team&apos;s in good shape today.
                </p>
              )}
              {reviewing.map((r, idx) => (
                <ReviewCard
                  key={idx}
                  pick={r}
                  isManager={isManager}
                  busy={busy}
                  onDecide={decideLeave}
                />
              ))}
            </div>
            {error && <p className="mt-3 text-[12px] text-rose-600">{error}</p>}
          </section>

          {/* Team Members table */}
          <section className="app-card app-card-lg hover-lift rise-in stagger-3">
            <div className="section-title-row flex-wrap gap-3">
              <div className="flex items-baseline gap-3">
                <h2 className="app-h2">Team Members</h2>
                <span className="text-[12px] text-slate-500 tabular">{members.length} members</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="relative">
                  <SearchIcon className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type="search"
                    placeholder="Search members..."
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    className="input pl-8 w-[220px]"
                  />
                </div>
              </div>
            </div>
            <div className="mt-3 overflow-x-auto -mx-5">
              <table className="app-table">
                <thead>
                  <tr>
                    <th>Member</th>
                    <th>Current Focus</th>
                    <th>Status</th>
                    <th>Last Update</th>
                    <th>Today&apos;s Summary</th>
                    <th className="w-8"></th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.length === 0 && (
                    <tr>
                      <td colSpan={6} className="py-10 text-center text-slate-500">
                        No matching members.
                      </td>
                    </tr>
                  )}
                  {filtered.map((m) => (
                    <MemberRow key={m.membershipId} member={m} />
                  ))}
                </tbody>
              </table>
            </div>
            <div className="text-center mt-3">
              <Link
                href={`/org/${orgId}/members`}
                className="text-[13px] text-indigo-600 hover:text-indigo-700 font-medium"
              >
                View all members →
              </Link>
            </div>
          </section>
        </div>

        {/* Right rail */}
        <aside className="col-span-12 xl:col-span-3 space-y-6">
          <div className="rise-in stagger-2 hover-lift">
            <LeavePanel
              orgId={orgId}
              isManager={isManager}
              leaves={pendingLeaves}
              busy={busy}
              onDecide={decideLeave}
            />
          </div>
          <div className="rise-in stagger-3 hover-lift">
            <BreakPanel breaks={recentBreaks} orgId={orgId} />
          </div>
          <div className="rise-in stagger-4 hover-lift">
            <InsightsPanel
              followup={snapshot.followupCount}
              onLeave={snapshot.onLeaveCount}
              active={snapshot.activeCount}
              total={snapshot.totalMembers}
            />
          </div>
        </aside>
      </div>
    </>
  )
}

/* ---------- Sub-components ---------- */

function StatTile({
  count,
  label,
  sub,
  bg,
  color,
  icon,
}: {
  count: number
  label: string
  sub: string
  bg: string
  color: string
  icon: React.ReactNode
}) {
  return (
    <div className="stat-tile">
      <span className="stat-icon" style={{ background: bg, color }}>
        {icon}
      </span>
      <div className="min-w-0">
        <div className="stat-num">{count}</div>
        <div className="stat-label">{label}</div>
        <div className="stat-sub">{sub}</div>
      </div>
    </div>
  )
}

function ReviewCard({
  pick,
  isManager,
  busy,
  onDecide,
}: {
  pick: {
    kind: 'leave' | 'block' | 'inactive'
    member: MemberCard | null
    leave?: PendingLeave
    label: string
    detail: string
  }
  isManager: boolean
  busy: string | null
  onDecide: (id: number, decision: 'approve' | 'deny') => void
}) {
  const m = pick.member
  const lv = pick.leave
  const character = getCharacter(m?.characterKey ?? lv?.user.characterKey ?? null)

  const tone =
    pick.kind === 'leave'
      ? 'pill-warn'
      : pick.kind === 'block'
        ? 'pill-sky'
        : 'pill-bad'

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <div className="flex items-center gap-3">
        <CharacterAvatar
          characterKey={m?.characterKey ?? lv?.user.characterKey ?? null}
          size={40}
        />
        <div className="min-w-0 flex-1">
          <p className="text-[14px] font-medium text-slate-900 truncate">
            {m?.name ?? lv?.user.name ?? `@${m?.login ?? lv?.user.login}`}
          </p>
          <p className="text-[11px] text-slate-500 truncate">
            {character?.name ?? `@${m?.login ?? lv?.user.login}`}
          </p>
        </div>
        <span className={`pill ${tone}`}>{pick.label}</span>
      </div>
      <p className="mt-2 text-[13px] text-slate-700 leading-snug">
        {pick.detail}
      </p>

      {lv && (
        <div className="mt-3 rounded-lg bg-amber-50 border border-amber-100 px-3 py-2 text-[12px] text-amber-900">
          <CalSmallIcon />{' '}
          <span className="font-medium">
            {fmtDateRange(lv.startDate, lv.endDate)}
          </span>{' '}
          <span className="text-amber-700">· Submitted {timeAgo(lv.createdAt)}</span>
        </div>
      )}

      <div className="mt-3 flex items-center justify-between gap-2">
        {lv && isManager ? (
          <>
            <button
              className="btn-good flex-1 justify-center"
              disabled={busy === `leave-${lv.id}-approve`}
              onClick={() => onDecide(lv.id, 'approve')}
            >
              {busy === `leave-${lv.id}-approve` ? '…' : 'Approve'}
            </button>
            <button
              className="btn-bad flex-1 justify-center"
              disabled={busy === `leave-${lv.id}-deny`}
              onClick={() => onDecide(lv.id, 'deny')}
            >
              {busy === `leave-${lv.id}-deny` ? '…' : 'Deny'}
            </button>
          </>
        ) : pick.kind === 'block' ? (
          <span className="text-[12px] text-rose-600 inline-flex items-center gap-1">
            <DotRed /> Blocked {timeSinceLabel(m?.activity)}
          </span>
        ) : pick.kind === 'inactive' ? (
          <span className="text-[12px] text-slate-500">
            Last active {timeSinceLabel(m?.activity)}
          </span>
        ) : null}

        {pick.kind !== 'leave' && (
          <button className="btn-secondary text-[12px]" disabled>
            {pick.kind === 'block' ? 'View details' : 'Check in'}
          </button>
        )}
      </div>
    </div>
  )
}

function MemberRow({ member: m }: { member: MemberCard }) {
  const character = getCharacter(m.characterKey)
  const status = m.dailyState ? STATUS[m.dailyState.state] : STATUS.NoData

  const displayStatus = m.onLeaveToday
    ? { label: 'On leave', pill: 'pill-warn' as const, current: 'On leave' }
    : m.ongoingBreak
      ? { label: 'On break', pill: 'pill-slate' as const, current: 'On break' }
      : !m.activeShift
        ? { label: 'Off-clock', pill: 'pill-slate' as const, current: 'Off-clock' }
        : status

  return (
    <tr>
      <td style={{ minWidth: 200 }}>
        <div className="flex items-center gap-3">
          <CharacterAvatar characterKey={m.characterKey} size={36} />
          <div className="min-w-0">
            <p className="text-[14px] font-medium text-slate-900 leading-tight truncate">
              {m.name ?? `@${m.login}`}
            </p>
            <p className="text-[11px] text-slate-500 leading-tight truncate mt-0.5">
              {character ? `${character.name} · ${m.role}` : m.role}
            </p>
          </div>
        </div>
      </td>
      <td style={{ minWidth: 200 }}>
        <div className="flex items-center gap-2">
          <AppDot color={appColor(m.activity.topApp)} />
          <div className="min-w-0">
            <p className="text-[13px] text-slate-900 truncate">
              {m.activity.topApp ?? '—'}
            </p>
            <p className="text-[11px] text-slate-500 truncate">
              {m.ongoingBreak
                ? `Break: ${m.ongoingBreak.reason}`
                : m.dailyState?.reason
                  ? truncate(m.dailyState.reason, 36)
                  : 'No focus tracked'}
            </p>
          </div>
        </div>
      </td>
      <td>
        <span className={`pill ${displayStatus.pill}`}>{displayStatus.label}</span>
      </td>
      <td className="text-[12px] text-slate-500 whitespace-nowrap">
        {m.narrative ? timeAgo(m.narrative.createdAt) : '—'}
      </td>
      <td>
        <p className="text-[13px] text-slate-700 leading-snug max-w-[280px]">
          {m.narrative?.body ? truncate(m.narrative.body, 90) : 'No summary yet.'}
        </p>
      </td>
      <td>
        <button className="btn-ghost" aria-label="more">
          <MoreIcon />
        </button>
      </td>
    </tr>
  )
}

function LeavePanel({
  orgId,
  isManager,
  leaves,
  busy,
  onDecide,
}: {
  orgId: number
  isManager: boolean
  leaves: PendingLeave[]
  busy: string | null
  onDecide: (id: number, decision: 'approve' | 'deny') => void
}) {
  return (
    <div className="app-card app-card-lg">
      <div className="section-title-row">
        <h3 className="app-h2">Leave Requests</h3>
        <Link href={`/org/${orgId}/leaves`} className="text-[13px] text-indigo-600 font-medium">
          View all
        </Link>
      </div>
      {leaves.length === 0 ? (
        <p className="app-sub mt-3">No pending requests.</p>
      ) : (
        <ul className="mt-3 space-y-4">
          {leaves.slice(0, 3).map((lv) => (
            <li key={lv.id} className="space-y-2">
              <div className="flex items-center gap-3">
                <CharacterAvatar characterKey={lv.user.characterKey} size={36} />
                <div className="min-w-0 flex-1">
                  <p className="text-[13px] font-medium text-slate-900 truncate">
                    {lv.user.name ?? `@${lv.user.login}`}
                  </p>
                  <p className="text-[11px] text-slate-500 truncate">
                    {fmtDateRange(lv.startDate, lv.endDate)}
                  </p>
                </div>
              </div>
              <p className="text-[12px] text-slate-600 leading-snug">Reason: {truncate(lv.reason, 80)}</p>
              {isManager && (
                <div className="flex gap-2">
                  <button
                    className="btn-good flex-1 justify-center"
                    disabled={busy === `leave-${lv.id}-approve`}
                    onClick={() => onDecide(lv.id, 'approve')}
                  >
                    Approve
                  </button>
                  <button
                    className="btn-bad flex-1 justify-center"
                    disabled={busy === `leave-${lv.id}-deny`}
                    onClick={() => onDecide(lv.id, 'deny')}
                  >
                    Deny
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function BreakPanel({ breaks, orgId }: { breaks: RecentBreak[]; orgId: number }) {
  return (
    <div className="app-card app-card-lg">
      <div className="section-title-row">
        <h3 className="app-h2">Recent Breaks & Updates</h3>
        <Link href={`/org/${orgId}/breaks`} className="text-[13px] text-indigo-600 font-medium">
          View all
        </Link>
      </div>
      {breaks.length === 0 ? (
        <p className="app-sub mt-3">No recent breaks.</p>
      ) : (
        <ul className="mt-3 space-y-3">
          {breaks.slice(0, 4).map((b) => (
            <li key={b.id} className="flex items-start gap-3">
              <CharacterAvatar characterKey={b.user.characterKey} size={32} />
              <div className="min-w-0 flex-1">
                <p className="text-[13px] font-medium text-slate-900 truncate">
                  {b.user.name ?? `@${b.user.login}`}
                </p>
                <p className="text-[11px] text-slate-500">
                  {b.endedAt ? 'Break' : 'On break'} · {new Date(b.startedAt).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}
                </p>
                <div className="mt-1 rounded-lg bg-slate-50 border border-slate-100 px-2.5 py-1.5 text-[12px] text-slate-700">
                  {truncate(b.reason, 80)}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function InsightsPanel({
  followup,
  onLeave,
  active,
  total,
}: {
  followup: number
  onLeave: number
  active: number
  total: number
}) {
  const lines: string[] = []
  if (followup > 0) {
    lines.push(`${followup} ${followup === 1 ? 'teammate is' : 'teammates are'} blocked or inactive — worth a quick check-in.`)
  }
  if (onLeave > 0) {
    lines.push(`${onLeave} on leave today.`)
  }
  if (active > 0 && total > 0) {
    lines.push(`${Math.round((active / total) * 100)}% of the team is making measurable progress.`)
  }
  if (lines.length === 0) {
    lines.push('Quiet day. Use it to plan, mentor, or write that doc.')
  }
  return (
    <div className="app-card app-card-lg">
      <div className="section-title-row">
        <h3 className="app-h2">MARINA Insights ✨</h3>
      </div>
      <ul className="mt-3 space-y-2">
        {lines.map((l, i) => (
          <li key={i} className="flex gap-2 text-[13px] text-slate-700 leading-snug">
            <span className="text-indigo-500 mt-0.5">•</span>
            <span>{l}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

/* ---------- helpers ---------- */

function truncate(s: string, n: number): string {
  if (!s) return ''
  return s.length > n ? s.slice(0, n - 1).trimEnd() + '…' : s
}

function fmtDateRange(start: string, end: string): string {
  const s = new Date(start + 'T00:00:00')
  const e = new Date(end + 'T00:00:00')
  const sameMonth = s.getMonth() === e.getMonth() && s.getFullYear() === e.getFullYear()
  const fmt = (d: Date, withMonth: boolean) =>
    d.toLocaleDateString(undefined, withMonth ? { day: 'numeric', month: 'short' } : { day: 'numeric' })
  const days = Math.round((e.getTime() - s.getTime()) / (24 * 60 * 60 * 1000)) + 1
  const label = start === end ? fmt(s, true) : `${fmt(s, !sameMonth)} – ${fmt(e, true)}`
  return `${label} (${days} day${days === 1 ? '' : 's'})`
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

function timeSinceLabel(activity: MemberCard['activity'] | undefined): string {
  if (!activity) return ''
  const seconds = activity.activeSeconds + activity.idleSeconds
  if (seconds === 0) return 'today'
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  if (h > 0) return `${h}h ${m}m`
  return `${m}m`
}

function appColor(app: string | null): string {
  if (!app) return '#cbd5e1'
  const palette = ['#6366f1', '#10b981', '#f59e0b', '#ec4899', '#0ea5e9', '#8b5cf6', '#84cc16', '#f97316']
  let h = 0
  for (let i = 0; i < app.length; i++) h = (h * 31 + app.charCodeAt(i)) >>> 0
  return palette[h % palette.length]
}

/* ---------- inline icons ---------- */

function CalIcon() {
  return (
    <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <rect x={3} y={4} width={18} height={17} rx={2} />
      <path d="M3 9h18M8 2v4M16 2v4" />
    </svg>
  )
}
function RefreshIcon() {
  return (
    <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <path d="M3 12a9 9 0 0 1 15-6.7L21 7" strokeLinecap="round" />
      <path d="M21 3v4h-4" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M21 12a9 9 0 0 1-15 6.7L3 17" strokeLinecap="round" />
      <path d="M3 21v-4h4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}
function FollowUpIcon() {
  return (
    <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <circle cx={9} cy={9} r={3} />
      <path d="M3 21c0-3 3-5 6-5s6 2 6 5" />
      <circle cx={17} cy={11} r={2} />
      <path d="M14 21c.4-2 2-3 3-3 1.5 0 2.6 1 3 3" />
    </svg>
  )
}
function LeaveIcon() {
  return (
    <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <path d="M4 21c5-3 9-7 12-13" />
      <path d="M16 8c2.5-1.5 5-1 5-1s-.5 2.5-2 5" />
      <path d="M14 11l-3-3M11 14l-2-2" />
    </svg>
  )
}
function SmileIcon() {
  return (
    <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <circle cx={12} cy={12} r={9} />
      <path d="M8 14a5 5 0 0 0 8 0" strokeLinecap="round" />
      <circle cx={9} cy={10} r={0.6} fill="currentColor" />
      <circle cx={15} cy={10} r={0.6} fill="currentColor" />
    </svg>
  )
}
function ClockIcon() {
  return (
    <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <circle cx={12} cy={12} r={9} />
      <path d="M12 7v5l3 2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}
function MoreIcon() {
  return (
    <svg width={16} height={16} viewBox="0 0 24 24" fill="currentColor">
      <circle cx={5} cy={12} r={1.6} />
      <circle cx={12} cy={12} r={1.6} />
      <circle cx={19} cy={12} r={1.6} />
    </svg>
  )
}
function CalSmallIcon() {
  return (
    <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.3} className="inline-block align-[-2px] mr-1">
      <rect x={3} y={4} width={18} height={17} rx={2} />
      <path d="M3 9h18M8 2v4M16 2v4" />
    </svg>
  )
}
function SearchIcon({ className }: { className?: string }) {
  return (
    <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className={className}>
      <circle cx={11} cy={11} r={7} />
      <path d="M21 21l-4.3-4.3" strokeLinecap="round" />
    </svg>
  )
}
function DotRed() {
  return <span className="inline-block w-1.5 h-1.5 rounded-full bg-rose-500 mr-1" />
}
function AppDot({ color }: { color: string }) {
  return (
    <span
      className="inline-block w-5 h-5 rounded-md flex-shrink-0 flex items-center justify-center"
      style={{ background: `${color}22` }}
    >
      <span className="block w-2 h-2 rounded-full" style={{ background: color }} />
    </span>
  )
}
