import { notFound, redirect } from 'next/navigation'
import { and, desc, eq, gte, inArray, isNull, or } from 'drizzle-orm'
// Shifts: ongoing (no punch-out) per user.
import { auth } from '@/auth'
import { db, schema } from '@/lib/db/client'
import { requireMembership, HttpError, roleAtLeast } from '@/lib/auth/guards'
import { getCompactSummaries } from '@/lib/activity/aggregate'
import { dayBoundsUtc, upsertDailyState } from '@/lib/engine/state'
import { detectSlackers } from '@/lib/engine/slacking'
import TeamDashboardClient from './client'

export const dynamic = 'force-dynamic'

export default async function OrgPage({ params }: { params: Promise<{ orgId: string }> }) {
  const { orgId: raw } = await params
  const orgId = Number(raw)
  if (!Number.isInteger(orgId)) notFound()

  let viewer: Awaited<ReturnType<typeof requireMembership>>
  try {
    viewer = await requireMembership(orgId, 'member')
  } catch (err) {
    if (err instanceof HttpError && err.status === 401) redirect('/')
    if (err instanceof HttpError && err.status === 403) redirect('/onboarding')
    throw err
  }

  // Plain members never see the team HQ — that's a manager view. Send them to
  // their personal console which shows their own activity, leaves, and breaks.
  if (!roleAtLeast(viewer.membership.role, 'manager')) {
    redirect('/dashboard')
  }

  const session = await auth()
  if (!session?.appUserId || !session.login) redirect('/')

  const me = await db.query.users.findFirst({ where: eq(schema.users.id, session.appUserId) })
  if (!me) redirect('/')

  const org = await db.query.orgs.findFirst({ where: eq(schema.orgs.id, orgId) })
  if (!org) notFound()

  // Visibility scoping: admins see every active member; managers + leads see
  // only their reports-to chain + members of teams they manage. The helper
  // returns user-id and membership-id sets — we filter the org-wide member
  // list down to those before going any further so every downstream query
  // (narratives, breaks, shifts) gets the scoped userIds.
  const { getVisibleScope } = await import('@/lib/auth/scope')
  const scope = await getVisibleScope(orgId, {
    userId: session.appUserId,
    membershipId: viewer.membership.id,
    role: viewer.membership.role as 'admin' | 'manager' | 'lead' | 'member',
  })

  const allMembers = await db
    .select({ m: schema.memberships, u: schema.users })
    .from(schema.memberships)
    .innerJoin(schema.users, eq(schema.memberships.userId, schema.users.id))
    .where(and(eq(schema.memberships.orgId, orgId), isNull(schema.memberships.endedAt)))

  const rawMembers = scope.isAdminScope
    ? allMembers
    : allMembers.filter((r) => scope.userIds.has(r.u.id))

  const userIds = rawMembers.map((r) => r.u.id)
  const isManager = roleAtLeast(viewer.membership.role, 'manager')
  const isOwner = viewer.membership.role === 'admin'

  const [narratives, compact, settingsRows, pendingLeaves, recentBreaks, openShifts] = await Promise.all([
    userIds.length
      ? db
          .select()
          .from(schema.narratives)
          .where(inArray(schema.narratives.userId, userIds))
          .orderBy(desc(schema.narratives.createdAt))
      : Promise.resolve([] as (typeof schema.narratives.$inferSelect)[]),
    getCompactSummaries(userIds),
    userIds.length
      ? db
          .select()
          .from(schema.userSettings)
          .where(inArray(schema.userSettings.userId, userIds))
      : Promise.resolve([] as (typeof schema.userSettings.$inferSelect)[]),
    // Pending leaves for the org, joined with the requester
    db
      .select({ l: schema.leaveRequests, u: schema.users })
      .from(schema.leaveRequests)
      .innerJoin(schema.users, eq(schema.leaveRequests.userId, schema.users.id))
      .where(
        and(
          eq(schema.leaveRequests.orgId, orgId),
          eq(schema.leaveRequests.status, 'pending')
        )
      )
      .orderBy(desc(schema.leaveRequests.createdAt))
      .limit(10),
    // Ongoing breaks + breaks in the last 6 hours
    userIds.length
      ? db
          .select({ b: schema.breaks, u: schema.users })
          .from(schema.breaks)
          .innerJoin(schema.users, eq(schema.breaks.userId, schema.users.id))
          .where(
            and(
              inArray(schema.breaks.userId, userIds),
              or(
                isNull(schema.breaks.endedAt),
                gte(schema.breaks.startedAt, new Date(Date.now() - 6 * 60 * 60 * 1000))
              )!
            )
          )
          .orderBy(desc(schema.breaks.startedAt))
          .limit(10)
      : Promise.resolve([] as Array<{ b: typeof schema.breaks.$inferSelect; u: typeof schema.users.$inferSelect }>),
    // Ongoing shifts (= punched in, not out)
    userIds.length
      ? db
          .select()
          .from(schema.shifts)
          .where(and(inArray(schema.shifts.userId, userIds), isNull(schema.shifts.punchedOutAt)))
      : Promise.resolve([] as (typeof schema.shifts.$inferSelect)[]),
  ])
  const shiftByUser = new Map(openShifts.map((s) => [s.userId, s]))
  const onShiftIds = new Set(openShifts.map((s) => s.userId))

  // Detect employees showing sustained non-work content during their shift.
  // 30-min window with at least 3 analysed screenshots, ≥60% unproductive.
  const slackAlerts = await detectSlackers(userIds, onShiftIds, 30)

  const settingsByUser = new Map(settingsRows.map((s) => [s.userId, s]))

  // Resolve today's daily state for every member; lazy-compute if absent.
  const { iso: todayIso } = dayBoundsUtc(new Date())
  const existingStates = userIds.length
    ? await db
        .select()
        .from(schema.dailyStates)
        .where(
          and(
            inArray(schema.dailyStates.userId, userIds),
            eq(schema.dailyStates.day, todayIso)
          )
        )
    : []
  const stateByUser = new Map(existingStates.map((s) => [s.userId, s]))
  const missing = userIds.filter((id) => !stateByUser.has(id))
  for (const uid of missing) {
    try {
      const computed = await upsertDailyState(uid, new Date())
      stateByUser.set(uid, {
        id: 0,
        userId: uid,
        day: computed.dayIso,
        state: computed.state,
        outputCount: computed.outputCount,
        onlineSeconds: computed.onlineSeconds,
        focusWorkRatio: computed.focusWorkRatio,
        staticIdleRuns: computed.staticIdleRuns,
        reason: computed.reason,
        computedAt: new Date(),
      })
    } catch (err) {
      console.error('lazy state compute failed', uid, err)
    }
  }

  const latestByUser = new Map<number, (typeof narratives)[number]>()
  for (const n of narratives) {
    if (!latestByUser.has(n.userId)) latestByUser.set(n.userId, n)
  }

  const userIdsOnLeaveToday = new Set<number>()
  // Build approved-leave-today set
  const today = new Date()
  const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`
  const onLeaveRows = userIds.length
    ? await db
        .select()
        .from(schema.leaveRequests)
        .where(
          and(
            eq(schema.leaveRequests.orgId, orgId),
            eq(schema.leaveRequests.status, 'approved'),
          )
        )
    : []
  for (const lr of onLeaveRows) {
    if (lr.startDate <= todayStr && lr.endDate >= todayStr) {
      userIdsOnLeaveToday.add(lr.userId)
    }
  }

  const ongoingBreaksByUser = new Map<number, typeof schema.breaks.$inferSelect>()
  for (const { b } of recentBreaks) {
    if (!b.endedAt && !ongoingBreaksByUser.has(b.userId)) {
      ongoingBreaksByUser.set(b.userId, b)
    }
  }

  // Resolve names for "waiting on" user IDs so the client doesn't need a second query.
  const waitingOnUserIds = Array.from(
    new Set(
      Array.from(ongoingBreaksByUser.values())
        .map((b) => b.waitingOnUserId)
        .filter((x): x is number => typeof x === 'number'),
    ),
  )
  const waitingOnUsers = waitingOnUserIds.length
    ? await db
        .select({ id: schema.users.id, login: schema.users.login, name: schema.users.name, characterKey: schema.users.characterKey })
        .from(schema.users)
        .where(inArray(schema.users.id, waitingOnUserIds))
    : []
  const waitingOnById = new Map(waitingOnUsers.map((u) => [u.id, u]))

  const members = rawMembers.map((r) => {
    const n = latestByUser.get(r.u.id)
    const c = compact.get(r.u.id)
    const s = settingsByUser.get(r.u.id)
    const st = stateByUser.get(r.u.id)
    const ongoingBreak = ongoingBreaksByUser.get(r.u.id) ?? null
    return {
      membershipId: r.m.id,
      userId: r.u.id,
      login: r.u.login,
      name: r.u.name,
      avatarUrl: r.u.avatarUrl,
      characterKey: r.u.characterKey,
      role: r.m.role,
      hasGithub: !!r.u.accessToken,
      activity: {
        activeSeconds: c?.activeSeconds ?? 0,
        idleSeconds: c?.idleSeconds ?? 0,
        topApp: c?.topApp ?? null,
        paused: !!s?.trackingPausedAt,
      },
      onLeaveToday: userIdsOnLeaveToday.has(r.u.id),
      ongoingBreak: ongoingBreak
        ? {
            id: ongoingBreak.id,
            reason: ongoingBreak.reason,
            startedAt: ongoingBreak.startedAt.toISOString(),
            category: ongoingBreak.category,
            waitingOnUserId: ongoingBreak.waitingOnUserId,
            waitingOnExternal: ongoingBreak.waitingOnExternal,
            waitingOn:
              ongoingBreak.waitingOnUserId && waitingOnById.has(ongoingBreak.waitingOnUserId)
                ? (() => {
                    const u = waitingOnById.get(ongoingBreak.waitingOnUserId!)!
                    return { login: u.login, name: u.name, characterKey: u.characterKey }
                  })()
                : null,
            expectedEndAt: ongoingBreak.expectedEndAt?.toISOString() ?? null,
          }
        : null,
      activeShift: shiftByUser.get(r.u.id)
        ? { id: shiftByUser.get(r.u.id)!.id, punchedInAt: shiftByUser.get(r.u.id)!.punchedInAt.toISOString() }
        : null,
      dailyState: st
        ? {
            state: st.state,
            reason: st.reason,
            outputCount: st.outputCount,
            focusWorkRatio: st.focusWorkRatio,
            staticIdleRuns: st.staticIdleRuns,
          }
        : null,
      narrative: n
        ? {
            body: n.body,
            signal: n.signal,
            createdAt: n.createdAt.toISOString(),
          }
        : null,
    }
  })

  // Snapshot counters
  const onLeaveCount = members.filter((m) => m.onLeaveToday).length
  const followupCount = members.filter(
    (m) => m.dailyState && (m.dailyState.state === 'Blocked' || m.dailyState.state === 'Disengaged' || m.dailyState.state === 'PossiblyDummying')
  ).length
  const activeCount = members.filter(
    (m) => m.dailyState && (m.dailyState.state === 'High' || m.dailyState.state === 'Steady')
  ).length
  const waitingOnReview = members.filter((m) =>
    m.narrative && (m.narrative.signal === 'Blocked' || (m.narrative.body ?? '').toLowerCase().includes('review'))
  ).length

  // Org-wide productivity rollup. We sum every teammate's active + idle
  // seconds today and grade the org as a single number — this is the KPI
  // HR can pin on a wall TV. Members who haven't been on shift today
  // (zero seconds) are excluded from the denominator so a fully-asleep
  // weekend doesn't show as "0% productive".
  const totalActive = members.reduce((acc, m) => acc + (m.activity.activeSeconds ?? 0), 0)
  const totalTracked = members.reduce(
    (acc, m) => acc + (m.activity.activeSeconds ?? 0) + (m.activity.idleSeconds ?? 0),
    0,
  )
  const orgProductivity =
    totalTracked > 0 ? Math.round((totalActive / totalTracked) * 100) : 0

  const greeting = greetingFor(new Date(), me.name?.split(' ')[0] ?? session.login)

  // Active blockers — every member who's flagged "blocked" right now.
  const blockers = members
    .filter((m) => m.ongoingBreak?.category === 'blocked')
    .map((m) => {
      const b = m.ongoingBreak!
      return {
        breakId: b.id,
        startedAt: b.startedAt,
        expectedEndAt: b.expectedEndAt,
        reason: b.reason,
        blockedUser: {
          membershipId: m.membershipId,
          login: m.login,
          name: m.name,
          characterKey: m.characterKey,
        },
        waitingOnUser: b.waitingOn,
        waitingOnExternal: b.waitingOnExternal,
        waitingOnYou: b.waitingOnUserId === session.appUserId,
      }
    })
    .sort((a, b) => new Date(a.startedAt).getTime() - new Date(b.startedAt).getTime())

  return (
    <TeamDashboardClient
      orgId={orgId}
      viewerUserId={session.appUserId}
      isManager={isManager}
      isOwner={isOwner}
      greeting={greeting}
      snapshot={{
        followupCount,
        onLeaveCount,
        activeCount,
        waitingOnReview,
        totalMembers: members.length,
        blockerCount: blockers.length,
        blockedOnYouCount: blockers.filter((b) => b.waitingOnYou).length,
        orgProductivity,
      }}
      blockers={blockers}
      slackAlerts={slackAlerts.map((a) => {
        const m = members.find((mm) => mm.userId === a.userId)
        return {
          membershipId: m?.membershipId ?? 0,
          userId: a.userId,
          login: m?.login ?? '',
          name: m?.name ?? null,
          characterKey: m?.characterKey ?? null,
          minutes: a.minutes,
          unproductiveCount: a.unproductiveCount,
          totalCount: a.totalCount,
          topHint: a.topHint,
          topCategory: a.topCategory,
        }
      }).filter((a) => a.membershipId !== 0)}
      members={members}
      pendingLeaves={pendingLeaves.map((r) => ({
        id: r.l.id,
        startDate: r.l.startDate,
        endDate: r.l.endDate,
        reason: r.l.reason,
        createdAt: r.l.createdAt.toISOString(),
        user: {
          id: r.u.id,
          login: r.u.login,
          name: r.u.name,
          characterKey: r.u.characterKey,
        },
      }))}
      recentBreaks={recentBreaks.map((r) => ({
        id: r.b.id,
        startedAt: r.b.startedAt.toISOString(),
        endedAt: r.b.endedAt?.toISOString() ?? null,
        reason: r.b.reason,
        category: r.b.category,
        user: {
          id: r.u.id,
          login: r.u.login,
          name: r.u.name,
          characterKey: r.u.characterKey,
        },
      }))}
    />
  )
}

function greetingFor(now: Date, firstName: string): string {
  const h = now.getHours()
  if (h < 5) return `Working late, ${firstName}`
  if (h < 12) return `Good morning, ${firstName}`
  if (h < 17) return `Good afternoon, ${firstName}`
  return `Good evening, ${firstName}`
}
