import Link from 'next/link'
import { redirect } from 'next/navigation'
import { and, desc, eq, gte, isNull } from 'drizzle-orm'
import { hideSeedRows } from '@/lib/dev-state'
import { auth, signIn, signOut } from '@/auth'
import { db, schema } from '@/lib/db/client'
import { listMembershipsForCurrentUser } from '@/lib/auth/guards'
import { getDailySummary } from '@/lib/activity/aggregate'
import { afterResponse } from '@/lib/after'
import { syncGithubForUser, ensureOrgGithubFresh } from '@/lib/github/auto-sync'
import { CharacterAvatar } from '@/components/character-avatar'
import { getCharacter } from '@/lib/characters/data'
import { AnnouncementBanner } from '@/components/announcement-banner'
import { computeSignalsForUser, type PersonSignals } from '@/lib/people/risk'
import { EmployeeOnboarding, type OnboardingStep } from '@/components/employee-onboarding'
import { PunchGate } from '@/components/punch-gate'
import { ComingSoonAgent } from '@/components/coming-soon-agent'
import { NextMeetingBanner } from '@/components/next-meeting-banner'
import { ReviewPacket } from '@/components/review-packet'
import { nextMeetingForUser } from '@/lib/meetings/upcoming'
import { SoloDashboard } from '@/components/solo-dashboard'
import { EmployeeActions } from '@/components/employee-actions'
import { EmployeeLeaves } from '@/components/employee-leaves'
import { YourDayCard } from '@/components/your-day-card'

export const dynamic = 'force-dynamic'

export default async function DashboardPage() {
  const session = await auth()
  if (!session?.appUserId || !session.login) redirect('/')

  const me = await db.query.users.findFirst({ where: eq(schema.users.id, session.appUserId) })
  if (!me) redirect('/')
  const character = getCharacter(me.characterKey)

  const memberships = await listMembershipsForCurrentUser()
  const primaryOrg = memberships[0] ?? null
  const primaryOrgId = primaryOrg?.orgId ?? null
  const githubLinked = me.githubId != null || !!me.githubLogin
  const friendlyName = me.name ?? character?.name ?? me.login ?? session.login
  const meId = session.appUserId
  const myLogin = session.login

  async function doSignOut() {
    'use server'
    await signOut({ redirectTo: '/' })
  }
  async function githubConnectAction() {
    'use server'
    await signIn('github', { redirectTo: '/dashboard' })
  }

  // Keep GitHub fresh on every visit (debounced, non-blocking).
  afterResponse(() => syncGithubForUser(meId, myLogin, { daysBack: 7, maxAgeMins: 20 }), 'dashboard github self-sync')

  // ── Solo employee (no org): the clean, full-width standalone console. ──
  if (!primaryOrgId) {
    const periodStart = new Date()
    periodStart.setDate(periodStart.getDate() - 7)
    const events = await db
      .select()
      .from(schema.githubEvents)
      .where(
        and(
          eq(schema.githubEvents.userId, meId),
          gte(schema.githubEvents.occurredAt, periodStart),
          hideSeedRows(schema.githubEvents.externalId),
        ),
      )
      .orderBy(desc(schema.githubEvents.occurredAt))
      .limit(80)
    return (
      <SoloDashboard
        userId={meId}
        login={me.login ?? session.login}
        name={friendlyName}
        email={me.email}
        events={events.map((e) => ({
          type: e.type,
          repo: e.repo,
          title: e.title,
          url: e.url,
          occurredAt: e.occurredAt.toISOString(),
        }))}
        githubLinked={githubLinked}
        hasEvents={events.length > 0}
        signOutAction={doSignOut}
      />
    )
  }

  // ── Org member: the Overview hub (deeper features live on their own pages). ──
  afterResponse(() => ensureOrgGithubFresh(primaryOrgId, { maxAgeMins: 20 }), 'dashboard org github sync')

  const [today, anyShift, activeShiftRows, nextMeeting] = await Promise.all([
    getDailySummary(meId),
    db.select({ id: schema.shifts.id }).from(schema.shifts).where(eq(schema.shifts.userId, meId)).limit(1),
    db
      .select({ punchedInAt: schema.shifts.punchedInAt })
      .from(schema.shifts)
      .where(and(eq(schema.shifts.userId, meId), isNull(schema.shifts.punchedOutAt)))
      .orderBy(desc(schema.shifts.punchedInAt))
      .limit(1),
    nextMeetingForUser(meId),
  ])
  void today
  const hasAnyShift = anyShift.length > 0
  const activeSince = activeShiftRows[0]?.punchedInAt.toISOString() ?? null

  let wellbeing: PersonSignals | null = null
  try {
    wellbeing = await computeSignalsForUser(primaryOrgId, meId)
  } catch {
    wellbeing = null
  }

  // Upcoming birthdays & work anniversaries for the team, + whether the viewer
  // has any GitHub activity (drives the review-packet card). We also load the
  // day-controls data (active break, recent breaks, leave requests) so the
  // Overview can host them inline — the old /dashboard/work page is gone.
  const [peopleRows, recentEv, activeBreak, recentBreaks, myLeaves] = await Promise.all([
    db
      .select({ name: schema.users.name, login: schema.users.login, birthdayMmDd: schema.users.birthdayMmDd, joinedOn: schema.users.joinedOn })
      .from(schema.memberships)
      .innerJoin(schema.users, eq(schema.memberships.userId, schema.users.id))
      .where(and(eq(schema.memberships.orgId, primaryOrgId), isNull(schema.memberships.endedAt))),
    db.select({ id: schema.githubEvents.id }).from(schema.githubEvents).where(and(eq(schema.githubEvents.userId, meId), hideSeedRows(schema.githubEvents.externalId))).limit(1),
    db.query.breaks.findFirst({ where: and(eq(schema.breaks.userId, meId), isNull(schema.breaks.endedAt)) }),
    db.select().from(schema.breaks).where(eq(schema.breaks.userId, meId)).orderBy(desc(schema.breaks.startedAt)).limit(5),
    db.select().from(schema.leaveRequests).where(eq(schema.leaveRequests.userId, meId)).orderBy(desc(schema.leaveRequests.createdAt)).limit(10),
  ])
  const celebrations = upcomingCelebrations(peopleRows)
  const hasWorkEvents = recentEv.length > 0
  const weekHours = wellbeing?.weekHours ?? null

  const activeBreakDto = activeBreak
    ? { id: activeBreak.id, startedAt: activeBreak.startedAt.toISOString(), reason: activeBreak.reason, category: activeBreak.category }
    : null
  const recentBreakDtos = recentBreaks.map((b) => ({
    id: b.id,
    startedAt: b.startedAt.toISOString(),
    endedAt: b.endedAt?.toISOString() ?? null,
    reason: b.reason,
  }))
  const leaveDtos = myLeaves.map((l) => ({
    id: l.id,
    startDate: l.startDate,
    endDate: l.endDate,
    reason: l.reason,
    status: l.status,
    decidedNote: l.decidedNote,
  }))

  const onboardingSteps: OnboardingStep[] = []
  if (primaryOrg?.org?.slackBotToken) {
    onboardingSteps.push({
      key: 'slack',
      done: !!primaryOrg.slackUserId,
      title: 'Use Marina in Slack',
      body: 'Open the Marina app in Slack and run /marina status once — then punch in, log work and post standups without leaving Slack.',
      cta: 'Learn how',
      href: '/help/marina-in-slack',
    })
  }
  const disc = (primaryOrg as { discipline?: string } | null)?.discipline
  if (disc === 'engineering' && !githubLinked) {
    onboardingSteps.push({
      key: 'github',
      done: false,
      title: 'Connect GitHub',
      body: 'So Marina can attribute your commits, PRs and reviews to you automatically.',
      cta: 'Connect',
      href: '/dashboard/connections',
    })
  }
  void githubConnectAction // (connect lives on the Connections page now)

  const greetingHour = new Date().getHours()
  const greeting = greetingHour < 12 ? 'Good morning' : greetingHour < 17 ? 'Good afternoon' : 'Good evening'

  return (
    <div className="px-4 pt-4 pb-10 sm:px-8 sm:pt-7 max-w-[1100px] mx-auto fade-in">
      <PunchGate active={!!activeSince} name={friendlyName} />
      <AnnouncementBanner viewerRole="member" />

      {/* Greeting */}
      <div className="flex items-center gap-3 mb-5">
        <CharacterAvatar characterKey={me.characterKey} name={me.name} login={me.login} size={44} />
        <div className="min-w-0">
          <h1 className="app-h1 text-[22px] sm:text-[26px] leading-tight">
            {greeting}, {(me.name ?? me.login ?? '').split(' ')[0] || friendlyName}
          </h1>
          <p className="text-[13px] text-[var(--m-ink-3)]">
            {activeSince ? "You're punched in — have a focused one." : 'Punch in when you start your day.'}
          </p>
        </div>
      </div>

      {/* Next team meeting — top of the dashboard. */}
      {nextMeeting && (
        <div className="mb-4">
          <NextMeetingBanner meeting={nextMeeting} />
        </div>
      )}

      <EmployeeOnboarding steps={onboardingSteps} />

      <div className="mb-4">
        <ComingSoonAgent variant="employee" />
      </div>

      {/* Active break/blocked banner only — the action buttons now live in the
          sidebar footer (reachable from any page). */}
      {activeBreakDto && (
        <div className="mb-4">
          <EmployeeActions orgId={primaryOrgId} activeBreak={activeBreakDto} variant="banner" />
        </div>
      )}

      {/* Live "Your day" read — productivity, shipped, meetings remaining. */}
      <div className="mb-5">
        <YourDayCard />
      </div>

      {/* Your work at a glance: hours, review packet, and team celebrations. */}
      <div className="grid gap-3 lg:grid-cols-2 items-start mb-5">
        <div className="grid gap-3">
          <div className="grid grid-cols-2 gap-3">
            <StatTile label="This week" value={weekHours != null ? `${weekHours}h` : '—'} hint="logged" />
            <StatTile label="Status" value={activeSince ? 'Working' : 'Off the clock'} hint={activeSince ? 'punched in' : 'punch in to start'} good={!!activeSince} />
          </div>
          <ReviewPacket hasGithub={githubLinked && hasWorkEvents} />
        </div>

        {celebrations.length > 0 && (
          <section className="app-card app-card-lg">
            <h2 className="app-h2">Coming up</h2>
            <p className="app-sub mt-0.5 mb-2.5">Birthdays &amp; work anniversaries on your team.</p>
            <ul className="space-y-2">
              {celebrations.map((c, i) => (
                <li key={i} className="flex items-center gap-2.5">
                  <span className="text-[16px] leading-none">{c.kind === 'birthday' ? '🎂' : '🎉'}</span>
                  <span className="text-[13px] text-[var(--m-ink)] flex-1 min-w-0 truncate">
                    {c.name}
                    <span className="text-[var(--m-ink-3)]"> · {c.kind === 'birthday' ? 'birthday' : `${c.years}-yr anniversary`}</span>
                  </span>
                  <span className="text-[11.5px] text-[var(--m-ink-4)] shrink-0">{c.inDays === 0 ? 'today' : c.inDays === 1 ? 'tomorrow' : `in ${c.inDays}d`}</span>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>

      {/* Leave requests + recent breaks. */}
      <div className="grid gap-3 lg:grid-cols-2 items-start mb-5">
        <EmployeeLeaves leaves={leaveDtos} />
        <section className="app-card app-card-lg">
          <h2 className="app-h2">Recent breaks</h2>
          {recentBreakDtos.length === 0 ? (
            <p className="app-sub mt-3">No breaks logged.</p>
          ) : (
            <ul className="mt-3 space-y-2">
              {recentBreakDtos.map((b) => (
                <li key={b.id} className="text-[12px] text-[var(--m-ink-2)]">
                  <span className="text-[var(--m-ink)] font-medium">
                    {new Date(b.startedAt).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}
                  </span>{' '}
                  · {b.endedAt ? breakDuration(b.startedAt, b.endedAt) : 'ongoing'} · {b.reason.slice(0, 60)}
                  {b.reason.length > 60 ? '…' : ''}
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      {/* Quick navigation — each feature is its own page now. */}
      <h2 className="app-eyebrow mb-2">Jump to</h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        <HubCard href="/dashboard/standup" title="Daily standup" desc="Post today's update and see your team's." icon="scrum" />
        <HubCard href="/dashboard/report" title="My report" desc="Your full work report — GitHub, standups, hours." icon="pulse" />
        <HubCard href="/dashboard/meetings" title="Meetings" desc="Your upcoming and recent meetings." icon="cal" />
        <HubCard href="/dashboard/team" title="My team" desc="Who you work with and report to." icon="team" />
        <HubCard href="/dashboard/connections" title="Connections" desc="GitHub, Calendar and Slack." icon="plug" />
        <HubCard href="/dashboard/data" title="My data" desc="Your tracked time and trends." icon="chart" />
      </div>

      <p className="mt-6 text-[12px] text-[var(--m-ink-4)]">
        {hasAnyShift ? 'Tip: use the left sidebar to move between your console pages.' : 'New here? Punch in above, then explore the pages on the left.'}
      </p>
    </div>
  )
}

function breakDuration(startIso: string, endIso: string): string {
  const ms = new Date(endIso).getTime() - new Date(startIso).getTime()
  const m = Math.max(1, Math.round(ms / 60000))
  if (m < 60) return `${m}m`
  return `${Math.floor(m / 60)}h ${m % 60}m`
}

function StatTile({ label, value, hint, good }: { label: string; value: string; hint: string; good?: boolean }) {
  return (
    <div className="app-card p-3.5">
      <p className="app-eyebrow">{label}</p>
      <p className={`text-[22px] font-semibold mt-0.5 tabular-nums ${good ? 'text-[var(--m-good)]' : 'text-[var(--m-ink)]'}`}>{value}</p>
      <p className="text-[11.5px] text-[var(--m-ink-4)]">{hint}</p>
    </div>
  )
}

type Celebration = { name: string; kind: 'birthday' | 'anniversary'; inDays: number; years: number }

/** Upcoming birthdays (from MM-DD) and work anniversaries (from joinedOn). */
function upcomingCelebrations(
  rows: { name: string | null; login: string; birthdayMmDd: string | null; joinedOn: string | null }[],
  withinDays = 21,
): Celebration[] {
  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const out: Celebration[] = []
  const daysUntil = (month: number, day: number) => {
    let d = new Date(today.getFullYear(), month, day)
    if (d < today) d = new Date(today.getFullYear() + 1, month, day)
    return Math.round((d.getTime() - today.getTime()) / 86400000)
  }
  for (const r of rows) {
    const who = r.name ?? `@${r.login}`
    if (r.birthdayMmDd && /^\d{2}-\d{2}$/.test(r.birthdayMmDd)) {
      const [mm, dd] = r.birthdayMmDd.split('-').map(Number)
      const inDays = daysUntil(mm - 1, dd)
      if (inDays <= withinDays) out.push({ name: who, kind: 'birthday', inDays, years: 0 })
    }
    if (r.joinedOn) {
      const j = new Date(r.joinedOn)
      if (!Number.isNaN(j.getTime())) {
        const inDays = daysUntil(j.getMonth(), j.getDate())
        const nextYear = inDays === 0 ? today.getFullYear() : new Date(today.getFullYear(), j.getMonth(), j.getDate()) < today ? today.getFullYear() + 1 : today.getFullYear()
        const years = nextYear - j.getFullYear()
        if (inDays <= withinDays && years >= 1) out.push({ name: who, kind: 'anniversary', inDays, years })
      }
    }
  }
  return out.sort((a, b) => a.inDays - b.inDays).slice(0, 6)
}

function HubCard({ href, title, desc, icon }: { href: string; title: string; desc: string; icon: string }) {
  return (
    <Link
      href={href}
      prefetch
      className="group app-card hover:shadow-[var(--m-shadow)] hover:border-[var(--m-accent)]/40 transition-all p-4 flex items-start gap-3"
    >
      <span className="shrink-0 w-9 h-9 rounded-lg bg-[var(--m-accent-soft)] text-[var(--m-accent-2)] inline-flex items-center justify-center">
        <HubIcon name={icon} />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-[13.5px] font-semibold text-[var(--m-ink)] group-hover:text-[var(--m-accent-2)] transition-colors">{title}</p>
        <p className="text-[12px] text-[var(--m-ink-3)] mt-0.5 leading-snug">{desc}</p>
      </div>
      <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="shrink-0 text-[var(--m-ink-5)] group-hover:text-[var(--m-accent)] transition-colors mt-0.5" aria-hidden>
        <path d="M5 12h14M13 6l6 6-6 6" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </Link>
  )
}

function HubIcon({ name }: { name: string }) {
  const common = { viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2, width: 18, height: 18 } as const
  if (name === 'scrum')
    return (
      <svg {...common}>
        <path d="M4 19a8 8 0 0 1 16 0" strokeLinecap="round" />
        <circle cx={6} cy={10} r={2} />
        <circle cx={12} cy={8} r={2.4} />
        <circle cx={18} cy={10} r={2} />
      </svg>
    )
  if (name === 'pulse')
    return (
      <svg {...common}>
        <path d="M3 12h3l3-8 4 16 3-8h5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    )
  if (name === 'cal')
    return (
      <svg {...common} strokeLinecap="round">
        <rect x="3" y="4.5" width="18" height="16" rx="2" />
        <path d="M3 9h18M8 3v3M16 3v3" />
      </svg>
    )
  if (name === 'team')
    return (
      <svg {...common}>
        <circle cx={9} cy={8} r={3} />
        <circle cx={17} cy={9} r={2.5} />
        <path d="M3 20c0-3 3-5 6-5s6 2 6 5" />
        <path d="M14 20c.6-2.5 2.5-4 4-4 2 0 3 1.5 3 4" />
      </svg>
    )
  if (name === 'chart')
    return (
      <svg {...common} strokeLinecap="round">
        <path d="M4 20V4M4 20h16M8 16v-4M12 16V8M16 16v-7" />
      </svg>
    )
  return (
    <svg {...common}>
      <path d="M9 2v6M15 2v6M7 8h10v3a5 5 0 0 1-10 0V8ZM12 16v6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}
