import Link from 'next/link'
import { redirect } from 'next/navigation'
import { and, desc, eq, gte, isNull, like, not } from 'drizzle-orm'
import { auth, signOut } from '@/auth'
import { db, schema } from '@/lib/db/client'
import { listMembershipsForCurrentUser, roleAtLeast } from '@/lib/auth/guards'
import { getDailySummary } from '@/lib/activity/aggregate'
import { CharacterAvatar } from '@/components/character-avatar'
import { getCharacter } from '@/lib/characters/data'
import DashboardClient from './client'
import { AnnouncementBanner } from '@/components/announcement-banner'
import { computeSignalsForUser, type PersonSignals } from '@/lib/people/risk'

export const dynamic = 'force-dynamic'

export default async function DashboardPage() {
  const session = await auth()
  if (!session?.appUserId || !session.login) redirect('/')

  const periodEnd = new Date()
  const periodStart = new Date(periodEnd.getTime() - 7 * 24 * 60 * 60 * 1000)

  const memberships = await listMembershipsForCurrentUser()
  const me = await db.query.users.findFirst({ where: eq(schema.users.id, session.appUserId) })
  if (!me) redirect('/')
  const character = getCharacter(me.characterKey)

  const [events, latestNarrative, today, userSettings, activeBreak, recentBreaks, myLeaves] =
    await Promise.all([
      db
        .select()
        .from(schema.githubEvents)
        .where(
          and(
            eq(schema.githubEvents.userId, session.appUserId),
            gte(schema.githubEvents.occurredAt, periodStart),
            not(like(schema.githubEvents.externalId, 'seed-%')),
          )
        )
        .orderBy(desc(schema.githubEvents.occurredAt))
        .limit(80),
      db
        .select()
        .from(schema.narratives)
        .where(eq(schema.narratives.userId, session.appUserId))
        .orderBy(desc(schema.narratives.createdAt))
        .limit(1)
        .then((rows) => rows[0]),
      getDailySummary(session.appUserId),
      db.query.userSettings.findFirst({
        where: eq(schema.userSettings.userId, session.appUserId),
      }),
      db.query.breaks.findFirst({
        where: and(eq(schema.breaks.userId, session.appUserId), isNull(schema.breaks.endedAt)),
      }),
      db
        .select()
        .from(schema.breaks)
        .where(eq(schema.breaks.userId, session.appUserId))
        .orderBy(desc(schema.breaks.startedAt))
        .limit(5),
      db
        .select()
        .from(schema.leaveRequests)
        .where(eq(schema.leaveRequests.userId, session.appUserId))
        .orderBy(desc(schema.leaveRequests.createdAt))
        .limit(10),
    ])

  const primaryOrg = memberships[0] ?? null
  const primaryOrgId = primaryOrg?.orgId ?? null
  const canSeeTeam = primaryOrg ? roleAtLeast(primaryOrg.role, 'manager') : false

  // Self-wellbeing snapshot (server-computed, rendered as a compact nudge above
  // the console). Leave balance is intentionally NOT shown here — see below.
  let wellbeing: PersonSignals | null = null
  if (primaryOrgId) {
    wellbeing = await computeSignalsForUser(primaryOrgId, session.appUserId)
  }

  // For the welcome tour we need to know if this user has *ever* punched in.
  const anyShift = await db
    .select({ id: schema.shifts.id })
    .from(schema.shifts)
    .where(eq(schema.shifts.userId, session.appUserId))
    .limit(1)
  const hasAnyShift = anyShift.length > 0

  const friendlyName = me.name ?? character?.name ?? me.login ?? session.login

  return (
    <main className="min-h-screen bg-[var(--m-bg)]">
      <AnnouncementBanner viewerRole="member" />
      <header className="bg-white border-b border-slate-200 sticky top-0 z-20">
        <div className="max-w-6xl mx-auto px-3 sm:px-6 py-2.5 sm:py-4 flex items-center justify-between gap-2 sm:gap-4">
          <div className="flex items-center gap-2 sm:gap-3 min-w-0 flex-1">
            <CharacterAvatar characterKey={me.characterKey} name={me.name} login={me.login} size={36} />
            <div className="min-w-0">
              <p className="app-eyebrow hidden sm:block">My console</p>
              <h1 className="app-h2 truncate flex items-baseline gap-2 text-[15px] sm:text-[20px]">
                <span className="truncate">
                  {character?.name ?? me.name ?? `@${session.login}`}
                </span>
                <span className="text-[11px] sm:text-[12px] font-normal text-slate-500 truncate hidden xs:inline">
                  @{session.login}
                </span>
              </h1>
            </div>
          </div>
          <nav className="flex items-center gap-2 sm:gap-4 text-[12px] sm:text-[13px] shrink-0">
            {canSeeTeam && primaryOrgId && (
              <Link
                href={`/org/${primaryOrgId}`}
                className="text-slate-600 hover:text-[var(--m-accent)] transition-colors px-1"
              >
                Team
              </Link>
            )}
            <Link
              href="/me/regularizations"
              className="text-slate-600 hover:text-[var(--m-accent)] transition-colors px-1 hidden md:inline"
            >
              Attendance
            </Link>
            <Link
              href="/me/data"
              className="text-slate-600 hover:text-[var(--m-accent)] transition-colors px-1 hidden sm:inline"
            >
              My data
            </Link>
            <Link
              href="/settings"
              className="text-slate-600 hover:text-[var(--m-accent)] transition-colors px-1"
            >
              Settings
            </Link>
            <form
              action={async () => {
                'use server'
                await signOut({ redirectTo: '/' })
              }}
            >
              <button type="submit" className="text-slate-600 hover:text-rose-600 px-1">
                <span className="hidden sm:inline">Sign out</span>
                <span className="sm:hidden" aria-label="Sign out">
                  <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                    <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4" strokeLinecap="round" />
                    <path d="M10 17l-5-5 5-5M5 12h12" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </span>
              </button>
            </form>
          </nav>
        </div>
      </header>

      {wellbeing && wellbeing.flags.length > 0 && wellbeing.level !== 'ok' ? (
        <div className="max-w-6xl mx-auto px-3 sm:px-6 pt-3 sm:pt-4 space-y-3">
          {wellbeing.flags.length > 0 && (
            <div
              className={`rounded-xl border px-4 py-3 flex items-start gap-3 ${
                wellbeing.level === 'high'
                  ? 'border-[var(--m-clay)]/40 bg-[var(--m-clay-soft)]/50'
                  : 'border-[var(--m-gold)]/40 bg-[var(--m-gold-soft)]/40'
              }`}
            >
              <span className="text-[18px] leading-none mt-0.5">🌱</span>
              <div className="min-w-0">
                <p className="text-[13px] font-semibold text-[var(--m-ink)]">
                  A gentle wellbeing check-in
                </p>
                <p className="text-[12.5px] text-[var(--m-ink-2)] leading-snug mt-0.5">
                  {wellbeing.weekHours >= 45
                    ? `You've logged ${wellbeing.weekHours}h this week — it's okay to wrap up earlier. `
                    : ''}
                  {wellbeing.flags.join(' · ')}. Your wellbeing matters more than your hours.
                </p>
                <Link href="/me/data" className="text-[12px] text-[var(--m-accent-2)] underline underline-offset-2 mt-1 inline-block">
                  See your data &amp; trends →
                </Link>
              </div>
            </div>
          )}
          {/* Leave-balance card removed from the dashboard on purpose: showing
              "you have 12 days left" every day nudges people to spend them.
              The balance now appears only inside the leave-request flow. */}
        </div>
      ) : null}

      <DashboardClient
        orgId={primaryOrgId}
        userName={friendlyName}
        hasAnyShift={hasAnyShift}
        githubLinked={me.githubId != null}
        initialEvents={events.map(serializeEvent)}
        initialNarrative={latestNarrative ? serializeNarrative(latestNarrative) : null}
        periodStart={periodStart.toISOString()}
        periodEnd={periodEnd.toISOString()}
        today={today}
        paused={!!userSettings?.trackingPausedAt}
        activeBreak={
          activeBreak
            ? {
                id: activeBreak.id,
                startedAt: activeBreak.startedAt.toISOString(),
                reason: activeBreak.reason,
                category: activeBreak.category,
              }
            : null
        }
        recentBreaks={recentBreaks.map((b) => ({
          id: b.id,
          startedAt: b.startedAt.toISOString(),
          endedAt: b.endedAt?.toISOString() ?? null,
          reason: b.reason,
        }))}
        myLeaves={myLeaves.map((l) => ({
          id: l.id,
          startDate: l.startDate,
          endDate: l.endDate,
          reason: l.reason,
          status: l.status,
          decidedAt: l.decidedAt?.toISOString() ?? null,
          decidedNote: l.decidedNote,
          createdAt: l.createdAt.toISOString(),
        }))}
      />
    </main>
  )
}

function serializeEvent(e: typeof schema.githubEvents.$inferSelect) {
  return {
    id: e.id,
    type: e.type,
    repo: e.repo,
    title: e.title,
    url: e.url,
    occurredAt: e.occurredAt.toISOString(),
  }
}

function serializeNarrative(n: typeof schema.narratives.$inferSelect) {
  return {
    id: n.id,
    body: n.body,
    signal: n.signal,
    blockers: n.blockers,
    provider: n.provider,
    model: n.model,
    periodStart: n.periodStart.toISOString(),
    periodEnd: n.periodEnd.toISOString(),
    createdAt: n.createdAt.toISOString(),
  }
}
