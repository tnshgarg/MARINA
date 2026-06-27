import { redirect } from 'next/navigation'
import { and, desc, eq, gte } from 'drizzle-orm'
import { hideSeedRows } from '@/lib/dev-state'
import { auth } from '@/auth'
import { db, schema } from '@/lib/db/client'
import { listMembershipsForCurrentUser } from '@/lib/auth/guards'
import { buildUserWork } from '@/lib/people/work'
import { recentStandupsForUser } from '@/lib/standups/save'
import { getCharacter } from '@/lib/characters/data'

export const dynamic = 'force-dynamic'

const DAY_MS = 24 * 60 * 60 * 1000

/**
 * The employee's own work report — the read a manager gets, but for yourself.
 * GitHub activity (7 & 30 days, by type), standup history, shifts/hours, and
 * logged deliverables. Solo (no-org) users have no report surface; bounce home.
 */
export default async function MyReportPage() {
  const session = await auth()
  if (!session?.appUserId || !session.login) redirect('/')
  const memberships = await listMembershipsForCurrentUser()
  if (!memberships[0]) redirect('/dashboard')

  const meId = session.appUserId
  const me = await db.query.users.findFirst({ where: eq(schema.users.id, meId) })
  if (!me) redirect('/')
  const character = getCharacter(me.characterKey)
  const friendlyName = me.name ?? character?.name ?? me.login ?? session.login

  const now = new Date()
  const since7 = new Date(now.getTime() - 7 * DAY_MS)
  const since30 = new Date(now.getTime() - 30 * DAY_MS)

  const [work, ev7, ev30, standups, shifts30, deliverables] = await Promise.all([
    buildUserWork(meId, 30),
    db
      .select({ type: schema.githubEvents.type })
      .from(schema.githubEvents)
      .where(and(eq(schema.githubEvents.userId, meId), gte(schema.githubEvents.occurredAt, since7), hideSeedRows(schema.githubEvents.externalId))),
    db
      .select({ type: schema.githubEvents.type })
      .from(schema.githubEvents)
      .where(and(eq(schema.githubEvents.userId, meId), gte(schema.githubEvents.occurredAt, since30), hideSeedRows(schema.githubEvents.externalId))),
    recentStandupsForUser(meId, 14),
    db
      .select({ punchedInAt: schema.shifts.punchedInAt, punchedOutAt: schema.shifts.punchedOutAt })
      .from(schema.shifts)
      .where(and(eq(schema.shifts.userId, meId), gte(schema.shifts.punchedInAt, since30)))
      .orderBy(desc(schema.shifts.punchedInAt)),
    db
      .select()
      .from(schema.deliverables)
      .where(and(eq(schema.deliverables.userId, meId), gte(schema.deliverables.completedAt, since30)))
      .orderBy(desc(schema.deliverables.completedAt))
      .limit(20),
  ])

  const counts7 = tallyTypes(ev7)
  const counts30 = tallyTypes(ev30)

  // Hours: sum closed shifts in the last 7 & 30 days (skip open shifts — no end).
  const minutes7 = sumShiftMinutes(shifts30.filter((s) => s.punchedInAt >= since7))
  const minutes30 = sumShiftMinutes(shifts30)
  const shiftDays30 = new Set(shifts30.map((s) => s.punchedInAt.toISOString().slice(0, 10))).size

  return (
    <div className="px-4 pt-4 pb-10 sm:px-8 sm:pt-7 max-w-[1000px] mx-auto fade-in">
      <div className="mb-5">
        <h1 className="app-h1 text-[22px] sm:text-[26px]">My report</h1>
        <p className="mt-1 text-[13px] text-[var(--m-ink-2)]">
          The same read your manager gets — your work over the last 30 days, {friendlyName.split(' ')[0]}.
        </p>
      </div>

      {/* Headline stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        <Stat label="Hours (7d)" value={fmtHours(minutes7)} hint="closed shifts" />
        <Stat label="Hours (30d)" value={fmtHours(minutes30)} hint={`${shiftDays30} day${shiftDays30 === 1 ? '' : 's'} worked`} />
        <Stat label="PRs (30d)" value={String(work.prs.length)} hint={`${work.prCounts.merged} merged`} />
        <Stat label="Commits (30d)" value={String(work.commitCount)} hint={`${work.commitRepos.length} repo${work.commitRepos.length === 1 ? '' : 's'}`} />
      </div>

      {/* Blocked banner from the work read */}
      {work.blocked && (
        <div className="mb-6 rounded-xl border px-4 py-3" style={{ background: 'rgba(179, 77, 77, 0.06)', borderColor: 'rgba(179, 77, 77, 0.3)' }}>
          <p className="app-eyebrow" style={{ color: 'var(--m-bad)' }}>{work.blocked.title}</p>
          <p className="text-[13px] text-[var(--m-ink-2)] mt-1">{work.blocked.detail}</p>
        </div>
      )}

      {/* GitHub activity */}
      <section className="app-card app-card-lg mb-5">
        <h2 className="app-h2">GitHub activity</h2>
        {!work.hasGithub ? (
          <p className="app-sub mt-2">
            GitHub isn&apos;t connected — link it on the{' '}
            <a href="/dashboard/connections" className="underline hover:text-[var(--m-accent)]">Connections</a> page so your
            commits, PRs and reviews roll into this report.
          </p>
        ) : (
          <>
            <div className="mt-3 overflow-x-auto">
              <table className="w-full text-[13px]">
                <thead>
                  <tr className="text-[var(--m-ink-3)] text-left">
                    <th className="font-medium py-1.5 pr-4">Type</th>
                    <th className="font-medium py-1.5 pr-4 text-right tabular-nums">Last 7 days</th>
                    <th className="font-medium py-1.5 text-right tabular-nums">Last 30 days</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--m-border-soft)]">
                  <TypeRow label="Commits" a={counts7.commit} b={counts30.commit} />
                  <TypeRow label="PRs opened" a={counts7.pr_opened} b={counts30.pr_opened} />
                  <TypeRow label="Reviews given" a={counts7.pr_reviewed} b={counts30.pr_reviewed} />
                  <TypeRow label="Issues closed" a={counts7.issue_closed} b={counts30.issue_closed} />
                </tbody>
              </table>
            </div>

            {work.prs.length > 0 && (
              <div className="mt-4">
                <p className="app-eyebrow mb-1.5">Open & recent PRs</p>
                <ul className="space-y-1.5">
                  {work.prs.slice(0, 8).map((p, i) => (
                    <li key={i} className="flex items-baseline gap-2 text-[12.5px]">
                      <span className="pill pill-violet text-[10px]">{p.status.replace('_', ' ')}</span>
                      <a href={p.url} target="_blank" rel="noreferrer" className="text-[var(--m-ink)] hover:text-[var(--m-accent)] truncate">
                        {p.title}
                      </a>
                      <span className="ml-auto shrink-0 text-[10.5px] text-[var(--m-ink-4)]">{p.repo}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {work.recentCommitTitles.length > 0 && (
              <div className="mt-4">
                <p className="app-eyebrow mb-1.5">Recent commit themes</p>
                <ul className="space-y-1 text-[12.5px] text-[var(--m-ink-2)]">
                  {work.recentCommitTitles.map((t, i) => (
                    <li key={i} className="truncate">• {t}</li>
                  ))}
                </ul>
              </div>
            )}
          </>
        )}
      </section>

      {/* Standup history */}
      <section className="app-card app-card-lg mb-5">
        <div className="section-title-row">
          <h2 className="app-h2">Standup history</h2>
          <span className="text-[12px] text-[var(--m-ink-3)]">last {standups.length}</span>
        </div>
        {standups.length === 0 ? (
          <p className="app-sub mt-3">No standups posted yet.</p>
        ) : (
          <ul className="mt-3 space-y-3">
            {standups.map((s) => (
              <li key={s.id} className="rounded-xl border border-[var(--m-border-soft)] p-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-[12.5px] font-semibold text-[var(--m-ink)]">{fmtDay(s.day)}</p>
                  <span className="text-[10.5px] text-[var(--m-ink-4)]">{s.source}</span>
                </div>
                {s.today && (
                  <p className="text-[12.5px] text-[var(--m-ink-2)] mt-1.5">
                    <span className="text-[var(--m-ink-4)]">Today:</span> {s.today}
                  </p>
                )}
                {s.yesterday && (
                  <p className="text-[12.5px] text-[var(--m-ink-3)] mt-1">
                    <span className="text-[var(--m-ink-4)]">Yesterday:</span> {s.yesterday}
                  </p>
                )}
                {s.blockers && (
                  <p className="text-[12.5px] mt-1" style={{ color: 'var(--m-bad)' }}>
                    <span className="text-[var(--m-ink-4)]">Blockers:</span> {s.blockers}
                  </p>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Deliverables */}
      <section className="app-card app-card-lg">
        <div className="section-title-row">
          <h2 className="app-h2">Deliverables</h2>
          <span className="text-[12px] text-[var(--m-ink-3)]">last 30 days</span>
        </div>
        {deliverables.length === 0 ? (
          <p className="app-sub mt-3">No deliverables logged in the last 30 days.</p>
        ) : (
          <ul className="mt-3 space-y-2">
            {deliverables.map((d) => (
              <li key={d.id} className="flex items-baseline gap-2 text-[13px]">
                {d.kind && <span className="pill pill-info text-[10px]">{d.kind}</span>}
                {d.url ? (
                  <a href={d.url} target="_blank" rel="noreferrer" className="text-[var(--m-ink)] hover:text-[var(--m-accent)] truncate">
                    {d.title}
                  </a>
                ) : (
                  <span className="text-[var(--m-ink)] truncate">{d.title}</span>
                )}
                <span className="ml-auto shrink-0 text-[10.5px] text-[var(--m-ink-4)]">
                  {d.completedAt.toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}

type TypeTally = { commit: number; pr_opened: number; pr_reviewed: number; issue_closed: number }

function tallyTypes(rows: { type: string }[]): TypeTally {
  const out: TypeTally = { commit: 0, pr_opened: 0, pr_reviewed: 0, issue_closed: 0 }
  for (const r of rows) {
    if (r.type === 'commit') out.commit++
    else if (r.type === 'pr_opened') out.pr_opened++
    else if (r.type === 'pr_reviewed') out.pr_reviewed++
    else if (r.type === 'issue_closed') out.issue_closed++
  }
  return out
}

function sumShiftMinutes(rows: { punchedInAt: Date; punchedOutAt: Date | null }[]): number {
  let total = 0
  for (const s of rows) {
    if (!s.punchedOutAt) continue
    total += Math.max(0, Math.round((s.punchedOutAt.getTime() - s.punchedInAt.getTime()) / 60000))
  }
  return total
}

function fmtHours(minutes: number): string {
  if (minutes <= 0) return '—'
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return m === 0 ? `${h}h` : `${h}h ${m}m`
}

function fmtDay(day: string): string {
  const d = new Date(day + 'T00:00:00')
  return d.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })
}

function Stat({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <div className="app-card p-3.5">
      <p className="app-eyebrow">{label}</p>
      <p className="text-[22px] font-semibold mt-0.5 tabular-nums text-[var(--m-ink)]">{value}</p>
      <p className="text-[11.5px] text-[var(--m-ink-4)]">{hint}</p>
    </div>
  )
}

function TypeRow({ label, a, b }: { label: string; a: number; b: number }) {
  return (
    <tr>
      <td className="py-1.5 pr-4 text-[var(--m-ink-2)]">{label}</td>
      <td className="py-1.5 pr-4 text-right tabular-nums font-medium text-[var(--m-ink)]">{a}</td>
      <td className="py-1.5 text-right tabular-nums font-medium text-[var(--m-ink)]">{b}</td>
    </tr>
  )
}
