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

export const dynamic = 'force-dynamic'

export default async function DashboardPage() {
  const session = await auth()
  if (!session?.appUserId || !session.login) redirect('/')

  const periodEnd = new Date()
  const periodStart = new Date(periodEnd.getTime() - 7 * 24 * 60 * 60 * 1000)

  const memberships = await listMembershipsForCurrentUser()
  const me = await db.query.users.findFirst({ where: eq(schema.users.id, session.appUserId) })
  if (!me?.characterKey) redirect('/pick')
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
      <header className="bg-white border-b border-slate-200">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3 min-w-0">
            <CharacterAvatar characterKey={me.characterKey} size={42} />
            <div>
              <p className="app-eyebrow">My console</p>
              <h1 className="app-h2 truncate">
                {character?.name ?? me.name ?? `@${session.login}`}
                <span className="ml-2 text-[12px] font-normal text-slate-500">
                  @{session.login}
                </span>
              </h1>
            </div>
          </div>
          <nav className="flex items-center gap-3 text-[13px]">
            {canSeeTeam && primaryOrgId && (
              <Link href={`/org/${primaryOrgId}`} className="text-slate-600 hover:text-indigo-600 transition-colors">
                Team
              </Link>
            )}
            <Link href="/settings" className="text-slate-600 hover:text-indigo-600 transition-colors">
              Settings
            </Link>
            <form
              action={async () => {
                'use server'
                await signOut({ redirectTo: '/' })
              }}
            >
              <button type="submit" className="text-slate-600 hover:text-rose-600">
                Sign out
              </button>
            </form>
          </nav>
        </div>
      </header>

      <DashboardClient
        orgId={primaryOrgId}
        userName={friendlyName}
        hasAnyShift={hasAnyShift}
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
