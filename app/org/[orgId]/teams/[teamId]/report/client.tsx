'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { CharacterAvatar } from '@/components/character-avatar'

type Member = {
  userId: number
  membershipId: number
  name: string | null
  login: string
  role: string
  discipline: string
  jobTitle: string | null
  avatarUrl: string | null
  image: string | null
  workMin: number
  shifts: number
  deliverables: number
  commits: number
  prs: number
  reviews: number
  issues: number
  githubEvents: number
  blockersOpened: number
  blockersResolved: number
  leaveDays: number
}

type Deliverable = {
  id: number
  title: string
  url: string | null
  completedAt: string
  authorName: string | null
  authorLogin: string
  authorUserId: number
  membershipId: number | null
}

/**
 * Per-team report renderer.
 *
 * Two-column layout:
 *   • Left: each teammate's full numbers + per-person sparkline of focus
 *           output (commits/PRs/deliverables) + total shifted hours
 *   • Right: top performers, lagging members, recent shipped work
 *
 * The score we sort by is a deliberately simple "weighted ship count":
 *     score = commits + prs*2 + reviews*2 + issues + deliverables*2
 *
 * Stripped of any vanity weighting so it's defensible in a perf review.
 * Members with leaves in the window are scored fairly (we don't penalise
 * for being out — the row shows leave days separately).
 */
export function TeamReportClient({
  orgId,
  teamId,
  team,
  lead,
  from,
  to,
  members,
  recentDeliverables,
}: {
  orgId: number
  teamId: number
  team: { name: string; description: string | null; color: string | null }
  lead: { name: string | null; login: string; image: string | null; avatarUrl: string | null } | null
  from: string
  to: string
  members: Member[]
  recentDeliverables: Deliverable[]
}) {
  const router = useRouter()
  const [fromInput, setFromInput] = useState(from)
  const [toInput, setToInput] = useState(to)

  function applyRange() {
    const url = `/org/${orgId}/teams/${teamId}/report?from=${fromInput}&to=${toInput}`
    router.push(url)
  }

  function presetRange(days: number) {
    const t = new Date()
    const f = new Date(t.getTime() - days * 86400000)
    const fStr = f.toISOString().slice(0, 10)
    const tStr = t.toISOString().slice(0, 10)
    setFromInput(fStr)
    setToInput(tStr)
    router.push(`/org/${orgId}/teams/${teamId}/report?from=${fStr}&to=${tStr}`)
  }

  const scoreOf = (m: Member) =>
    m.commits + m.prs * 2 + m.reviews * 2 + m.issues + m.deliverables * 2

  const ranked = useMemo(() => {
    return members
      .slice()
      .sort((a, b) => scoreOf(b) - scoreOf(a))
      .map((m, i) => ({ ...m, rank: i + 1, score: scoreOf(m) }))
  }, [members])

  const topPerformers = ranked.slice(0, Math.min(3, ranked.length))
  const lagging = ranked
    .filter((m) => scoreOf(m) === 0 || m.workMin < 60)
    .slice(0, 5)

  const totals = useMemo(() => {
    return members.reduce(
      (acc, m) => ({
        workMin: acc.workMin + m.workMin,
        shifts: acc.shifts + m.shifts,
        deliverables: acc.deliverables + m.deliverables,
        commits: acc.commits + m.commits,
        prs: acc.prs + m.prs,
        reviews: acc.reviews + m.reviews,
        issues: acc.issues + m.issues,
        blockersOpened: acc.blockersOpened + m.blockersOpened,
        blockersResolved: acc.blockersResolved + m.blockersResolved,
      }),
      {
        workMin: 0,
        shifts: 0,
        deliverables: 0,
        commits: 0,
        prs: 0,
        reviews: 0,
        issues: 0,
        blockersOpened: 0,
        blockersResolved: 0,
      },
    )
  }, [members])

  return (
    <div className="space-y-5 pb-12">
      {/* Title row */}
      <header className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <nav className="text-[11.5px] text-[var(--m-ink-3)] flex items-center gap-1.5 mb-1">
            <Link href={`/org/${orgId}/teams`} className="hover:text-[var(--m-accent)]">
              Teams
            </Link>
            <span className="text-[var(--m-ink-5)]">/</span>
            <span className="text-[var(--m-ink-2)]">{team.name}</span>
            <span className="text-[var(--m-ink-5)]">/</span>
            <span className="text-[var(--m-ink-2)]">Report</span>
          </nav>
          <h1 className="app-h1 flex items-center gap-2">
            <span
              className="inline-block w-3 h-3 rounded-sm"
              style={{ background: team.color ?? '#3f6b54' }}
            />
            {team.name}
            <span className="text-[14px] font-normal text-[var(--m-ink-3)]">· team report</span>
          </h1>
          {team.description && (
            <p className="mt-1 text-[13px] text-[var(--m-ink-3)] max-w-xl">{team.description}</p>
          )}
        </div>
        {lead && (
          <div className="rounded-lg border border-[var(--m-border)] bg-white px-3 py-2 text-[12px]">
            <p className="text-[10.5px] uppercase tracking-wider text-[var(--m-ink-3)] font-semibold mb-1">
              Lead
            </p>
            <div className="flex items-center gap-2">
              <CharacterAvatar
                name={lead.name}
                login={lead.login}
                imageUrl={lead.image ?? lead.avatarUrl}
                size={24}
              />
              <span className="text-[var(--m-ink)]">{lead.name ?? `@${lead.login}`}</span>
            </div>
          </div>
        )}
      </header>

      {/* Date range controls */}
      <section className="rounded-xl border border-[var(--m-border)] bg-white p-3 flex items-center gap-2 flex-wrap">
        <span className="text-[11px] uppercase tracking-wider text-[var(--m-ink-3)] font-semibold mr-1">
          Period
        </span>
        <input
          type="date"
          value={fromInput}
          onChange={(e) => setFromInput(e.target.value)}
          max={toInput}
          className="px-2 py-1 rounded-md bg-white border border-[var(--m-border)] text-[12.5px]"
        />
        <span className="text-[var(--m-ink-4)] text-[12px]">→</span>
        <input
          type="date"
          value={toInput}
          onChange={(e) => setToInput(e.target.value)}
          max={new Date().toISOString().slice(0, 10)}
          className="px-2 py-1 rounded-md bg-white border border-[var(--m-border)] text-[12.5px]"
        />
        <button
          type="button"
          onClick={applyRange}
          className="px-3 py-1.5 rounded-md bg-[var(--m-accent)] hover:bg-[var(--m-accent-2)] text-white text-[12px] font-medium transition"
        >
          Apply
        </button>
        <span className="text-[var(--m-ink-5)] mx-2">|</span>
        <button type="button" onClick={() => presetRange(7)} className="text-[12px] text-[var(--m-ink-2)] hover:text-[var(--m-accent)]">
          Last 7d
        </button>
        <button type="button" onClick={() => presetRange(30)} className="text-[12px] text-[var(--m-ink-2)] hover:text-[var(--m-accent)]">
          Last 30d
        </button>
        <button type="button" onClick={() => presetRange(90)} className="text-[12px] text-[var(--m-ink-2)] hover:text-[var(--m-accent)]">
          Last quarter
        </button>
      </section>

      {/* Team totals */}
      <section className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <Kpi label="Total hours" value={fmtH(totals.workMin)} sub={`${totals.shifts} shifts`} />
        <Kpi label="Shipped" value={totals.deliverables.toString()} sub="self-reported" />
        <Kpi label="Commits + PRs" value={(totals.commits + totals.prs).toString()} sub={`${totals.reviews} reviews`} />
        <Kpi label="Blockers" value={totals.blockersOpened.toString()} sub={`${totals.blockersResolved} resolved`} />
        <Kpi label="Teammates" value={members.length.toString()} sub="active in window" />
      </section>

      <div className="grid lg:grid-cols-3 gap-5">
        {/* Left · per-employee table */}
        <div className="lg:col-span-2 rounded-xl border border-[var(--m-border)] bg-white overflow-hidden">
          <div className="grid grid-cols-[minmax(0,1.6fr)_60px_70px_80px_70px_80px] gap-3 items-center px-4 py-2.5 border-b border-[var(--m-border-soft)] text-[10.5px] uppercase tracking-wider text-[var(--m-ink-3)] font-semibold">
            <span>Teammate</span>
            <span className="text-right">Hours</span>
            <span className="text-right">Shipped</span>
            <span className="text-right">GH events</span>
            <span className="text-right">Blocked</span>
            <span className="text-right">Score</span>
          </div>
          {ranked.length === 0 ? (
            <p className="px-4 py-10 text-center text-[13px] text-[var(--m-ink-3)]">
              No teammates on this team yet.
            </p>
          ) : (
            <ul className="divide-y divide-[var(--m-border-soft)]">
              {ranked.map((m) => (
                <li
                  key={m.userId}
                  className="grid grid-cols-[minmax(0,1.6fr)_60px_70px_80px_70px_80px] gap-3 items-center px-4 py-3 hover:bg-[var(--m-bg-soft)]/60 transition-colors"
                >
                  <Link
                    href={`/org/${orgId}/people/${m.membershipId}`}
                    className="flex items-center gap-2.5 min-w-0 hover:text-[var(--m-accent)]"
                  >
                    <span className="text-[10.5px] text-[var(--m-ink-4)] tabular-nums w-5 shrink-0 text-right">
                      {m.rank}
                    </span>
                    <CharacterAvatar
                      name={m.name}
                      login={m.login}
                      imageUrl={m.image ?? m.avatarUrl}
                      size={28}
                    />
                    <div className="min-w-0">
                      <p className="text-[13px] font-medium text-[var(--m-ink)] truncate">
                        {m.name ?? `@${m.login}`}
                      </p>
                      <p className="text-[11px] text-[var(--m-ink-3)] truncate capitalize">
                        {m.jobTitle ?? m.discipline} · {m.role}
                      </p>
                    </div>
                  </Link>
                  <span className="text-right text-[13px] text-[var(--m-ink)] tabular-nums">{fmtH(m.workMin)}</span>
                  <span className="text-right text-[13px] text-[var(--m-ink)] tabular-nums">{m.deliverables}</span>
                  <span className="text-right text-[13px] text-[var(--m-ink)] tabular-nums">{m.githubEvents}</span>
                  <span className={`text-right text-[13px] tabular-nums ${m.blockersOpened > 0 ? 'text-rose-700 font-semibold' : 'text-[var(--m-ink-3)]'}`}>
                    {m.blockersOpened}
                  </span>
                  <span className="text-right text-[13px] text-[var(--m-accent)] font-semibold tabular-nums">
                    {m.score}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Right · highlights */}
        <div className="space-y-5">
          <section className="rounded-xl border border-[var(--m-border)] bg-white p-4">
            <p className="text-[11px] uppercase tracking-widest text-emerald-700 font-semibold mb-2">
              Top performers
            </p>
            {topPerformers.length === 0 ? (
              <p className="text-[12.5px] text-[var(--m-ink-3)]">Nobody had output in this window.</p>
            ) : (
              <ol className="space-y-2">
                {topPerformers.map((m) => (
                  <li key={m.userId}>
                    <Link
                      href={`/org/${orgId}/people/${m.membershipId}`}
                      className="flex items-center gap-2.5 hover:opacity-90"
                    >
                      <span className="text-[14px] text-[var(--m-ink-4)] font-display w-5 text-center">
                        {m.rank}
                      </span>
                      <CharacterAvatar
                        name={m.name}
                        login={m.login}
                        imageUrl={m.image ?? m.avatarUrl}
                        size={28}
                      />
                      <div className="min-w-0 flex-1">
                        <p className="text-[12.5px] font-medium text-[var(--m-ink)] truncate">
                          {m.name ?? `@${m.login}`}
                        </p>
                        <p className="text-[11px] text-[var(--m-ink-3)] truncate">
                          {m.deliverables} shipped · {m.commits + m.prs} commits/PRs · score {m.score}
                        </p>
                      </div>
                    </Link>
                  </li>
                ))}
              </ol>
            )}
          </section>

          {lagging.length > 0 && (
            <section className="rounded-xl border border-[var(--m-border)] bg-white p-4">
              <p className="text-[11px] uppercase tracking-widest text-amber-700 font-semibold mb-2">
                Might need support
              </p>
              <p className="text-[11px] text-[var(--m-ink-3)] mb-2">
                Zero output or &lt; 1h logged. Could be on leave, ramping up, or stuck.
              </p>
              <ol className="space-y-2">
                {lagging.map((m) => (
                  <li key={m.userId}>
                    <Link
                      href={`/org/${orgId}/people/${m.membershipId}`}
                      className="flex items-center gap-2.5 hover:opacity-90"
                    >
                      <CharacterAvatar
                        name={m.name}
                        login={m.login}
                        imageUrl={m.image ?? m.avatarUrl}
                        size={26}
                      />
                      <div className="min-w-0 flex-1">
                        <p className="text-[12.5px] font-medium text-[var(--m-ink)] truncate">
                          {m.name ?? `@${m.login}`}
                        </p>
                        <p className="text-[11px] text-[var(--m-ink-3)] truncate">
                          {fmtH(m.workMin)} logged
                          {m.leaveDays > 0 && ` · ${m.leaveDays} leave days`}
                          {m.blockersOpened > 0 && ` · ${m.blockersOpened} blockers`}
                        </p>
                      </div>
                    </Link>
                  </li>
                ))}
              </ol>
            </section>
          )}

          {recentDeliverables.length > 0 && (
            <section className="rounded-xl border border-[var(--m-border)] bg-white p-4">
              <p className="text-[11px] uppercase tracking-widest text-[var(--m-ink-3)] font-semibold mb-2">
                Shipped in this window
              </p>
              <ul className="divide-y divide-[var(--m-border-soft)]">
                {recentDeliverables.slice(0, 10).map((d) => (
                  <li key={d.id} className="py-2">
                    {d.url ? (
                      <a
                        href={d.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-[12.5px] text-[var(--m-ink)] hover:underline"
                      >
                        {d.title}
                      </a>
                    ) : (
                      <span className="text-[12.5px] text-[var(--m-ink)]">{d.title}</span>
                    )}
                    <p className="text-[10.5px] text-[var(--m-ink-3)] mt-0.5">
                      {d.authorName ?? `@${d.authorLogin}`} ·{' '}
                      {new Date(d.completedAt).toLocaleDateString(undefined, {
                        month: 'short',
                        day: 'numeric',
                      })}
                    </p>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      </div>

      <p className="text-[11px] text-[var(--m-ink-3)]">
        An employee can be on multiple teams. This report only counts their activity inside the
        selected window — overlap with other teams isn&apos;t deducted.
      </p>
    </div>
  )
}

function Kpi({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className="rounded-xl border border-[var(--m-border)] bg-white px-4 py-3">
      <p className="text-[10px] uppercase tracking-widest text-[var(--m-ink-3)] font-medium">{label}</p>
      <p className="mt-1 text-[22px] tracking-tight text-[var(--m-ink)] tabular-nums">{value}</p>
      <p className="text-[11px] text-[var(--m-ink-3)] mt-0.5 truncate">{sub}</p>
    </div>
  )
}

function fmtH(min: number): string {
  if (min === 0) return '—'
  const h = Math.floor(min / 60)
  const m = min % 60
  if (h === 0) return `${m}m`
  return `${h}h${m > 0 ? ` ${m}m` : ''}`
}
