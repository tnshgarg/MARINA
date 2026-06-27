import { notFound, redirect } from 'next/navigation'
import { and, count, desc, eq, gte, inArray, isNull } from 'drizzle-orm'
import { db, schema } from '@/lib/db/client'
import { HttpError, requireScope } from '@/lib/auth/guards'
import { todayIso, standupsForOrgDay } from '@/lib/standups/save'
import { TeamPageClient } from './client'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const DAY_MS = 24 * 60 * 60 * 1000

/**
 * Individual team page — the manager's command center for ONE team.
 *
 * Distinct from the team *report* (a date-ranged rollup): this is the live,
 * "what is my team doing right now" view. For every member it shows hours this
 * week, today's daily state + efficiency, GitHub activity over the last 7 days,
 * and whether they've posted today's standup. Plus team-level rollups: today's
 * standup updates, who's on a break right now, and average efficiency / total
 * hours across the team.
 *
 * Access: manager scope. The team must belong to the org AND be in the viewer's
 * visible scope (the viewer leads it OR can see at least one member) — admins
 * see everything.
 */
export default async function TeamPage({
  params,
}: {
  params: Promise<{ orgId: string; teamId: string }>
}) {
  const { orgId: rawO, teamId: rawT } = await params
  const orgId = Number(rawO)
  const teamId = Number(rawT)
  if (!Number.isInteger(orgId) || !Number.isInteger(teamId)) notFound()

  let viewer
  try {
    viewer = await requireScope(orgId, 'manager')
  } catch (err) {
    if (err instanceof HttpError && err.status === 401) redirect('/')
    if (err instanceof HttpError && err.status === 403) redirect('/dashboard')
    throw err
  }
  const { scope } = viewer

  // The team must exist inside this org.
  const team = await db.query.teams.findFirst({
    where: and(eq(schema.teams.id, teamId), eq(schema.teams.orgId, orgId)),
  })
  if (!team) notFound()

  // Team members + their user + membership rows.
  const teamMems = await db
    .select({
      teamMember: schema.teamMembers,
      membership: schema.memberships,
      user: schema.users,
    })
    .from(schema.teamMembers)
    .innerJoin(schema.memberships, eq(schema.teamMembers.membershipId, schema.memberships.id))
    .innerJoin(schema.users, eq(schema.memberships.userId, schema.users.id))
    .where(and(eq(schema.teamMembers.teamId, teamId), isNull(schema.memberships.endedAt)))

  // Scope gate: a non-admin manager must be able to see the team lead OR at
  // least one member. Otherwise this team isn't theirs to look at.
  const leadInScope =
    team.managerMembershipId != null && scope.membershipIds.has(team.managerMembershipId)
  if (!scope.isAdminScope) {
    const anyVisible = leadInScope || teamMems.some((tm) => scope.userIds.has(tm.user.id))
    if (!anyVisible) redirect(`/org/${orgId}/teams`)
  }

  // Lead's user record for the header chip.
  let lead:
    | {
        name: string | null
        login: string
        avatarUrl: string | null
        characterKey: string | null
        membershipId: number
      }
    | null = null
  if (team.managerMembershipId) {
    const leadRow = await db
      .select({ u: schema.users })
      .from(schema.memberships)
      .innerJoin(schema.users, eq(schema.memberships.userId, schema.users.id))
      .where(eq(schema.memberships.id, team.managerMembershipId))
      .limit(1)
    if (leadRow[0]) {
      lead = {
        name: leadRow[0].u.name,
        login: leadRow[0].u.login,
        avatarUrl: leadRow[0].u.avatarUrl,
        characterKey: leadRow[0].u.characterKey,
        membershipId: team.managerMembershipId,
      }
    }
  }

  const userIds = teamMems.map((tm) => tm.user.id)
  const day = todayIso()

  // "This week" = trailing 7 days for hours (simple, timezone-agnostic). The
  // daily-state efficiency is today's snapshot.
  const weekStart = new Date(Date.now() - 7 * DAY_MS)
  const ghSince = new Date(Date.now() - 7 * DAY_MS)

  // Empty-team fast path — nothing to aggregate.
  if (userIds.length === 0) {
    return (
      <TeamPageClient
        orgId={orgId}
        teamId={teamId}
        team={{ name: team.name, description: team.description, color: team.color }}
        lead={lead}
        members={[]}
        meetingMembers={[]}
        todayStandups={[]}
        activeBreaks={[]}
        totals={{ totalHours: 0, avgEfficiency: null, standupCount: 0, memberCount: 0 }}
        day={day}
      />
    )
  }

  const [shiftRows, dailyRows, ghRows, breakRows, orgStandups] = await Promise.all([
    // Hours this week — every shift that started in the trailing 7d.
    db
      .select()
      .from(schema.shifts)
      .where(and(inArray(schema.shifts.userId, userIds), gte(schema.shifts.punchedInAt, weekStart))),
    // Today's daily state per member (state + efficiency / focus ratio).
    db
      .select()
      .from(schema.dailyStates)
      .where(and(inArray(schema.dailyStates.userId, userIds), eq(schema.dailyStates.day, day))),
    // GitHub activity counts over the last 7 days, grouped by user + type.
    db
      .select({ userId: schema.githubEvents.userId, type: schema.githubEvents.type, n: count() })
      .from(schema.githubEvents)
      .where(and(inArray(schema.githubEvents.userId, userIds), gte(schema.githubEvents.occurredAt, ghSince)))
      .groupBy(schema.githubEvents.userId, schema.githubEvents.type),
    // Breaks the team is currently/recently taking (last 24h or still open).
    db
      .select()
      .from(schema.breaks)
      .where(
        and(
          inArray(schema.breaks.userId, userIds),
          gte(schema.breaks.startedAt, new Date(Date.now() - DAY_MS)),
        ),
      )
      .orderBy(desc(schema.breaks.startedAt)),
    // Today's standups across the org — we filter to the team below.
    standupsForOrgDay(orgId, day),
  ])

  // ── Per-member rollup ──
  const hoursByUser = new Map<number, number>()
  for (const s of shiftRows) {
    const start = s.punchedInAt.getTime()
    const end = s.punchedOutAt?.getTime() ?? Date.now()
    hoursByUser.set(s.userId, (hoursByUser.get(s.userId) ?? 0) + Math.max(0, end - start))
  }

  const dailyByUser = new Map<number, (typeof dailyRows)[number]>()
  for (const d of dailyRows) dailyByUser.set(d.userId, d)

  type Gh = { commits: number; prs: number; reviews: number; issues: number; total: number }
  const ghByUser = new Map<number, Gh>()
  for (const g of ghRows) {
    const cur = ghByUser.get(g.userId) ?? { commits: 0, prs: 0, reviews: 0, issues: 0, total: 0 }
    const n = Number(g.n)
    cur.total += n
    if (g.type === 'commit') cur.commits += n
    else if (g.type === 'pr_opened') cur.prs += n
    else if (g.type === 'pr_reviewed') cur.reviews += n
    else if (g.type === 'issue_closed') cur.issues += n
    ghByUser.set(g.userId, cur)
  }

  const standupUserIds = new Set(orgStandups.map((s) => s.userId))
  const teamUserIdSet = new Set(userIds)

  const members = teamMems.map((tm) => {
    const gh = ghByUser.get(tm.user.id) ?? { commits: 0, prs: 0, reviews: 0, issues: 0, total: 0 }
    const ds = dailyByUser.get(tm.user.id)
    const ms = hoursByUser.get(tm.user.id) ?? 0
    return {
      userId: tm.user.id,
      membershipId: tm.membership.id,
      name: tm.user.name,
      login: tm.user.login,
      avatarUrl: tm.user.avatarUrl,
      characterKey: tm.user.characterKey,
      role: tm.membership.role,
      discipline: tm.membership.discipline,
      jobTitle: tm.membership.jobTitle ?? null,
      isLead: team.managerMembershipId === tm.membership.id,
      weekHours: Math.round((ms / 3_600_000) * 10) / 10,
      dailyState: ds?.state ?? null,
      efficiency: ds ? ds.focusWorkRatio : null,
      github: gh,
      postedStandup: standupUserIds.has(tm.user.id),
    }
  })

  // ── Team-level totals ──
  const totalHours =
    Math.round(([...hoursByUser.values()].reduce((a, b) => a + b, 0) / 3_600_000) * 10) / 10
  const effVals = dailyRows.map((d) => d.focusWorkRatio)
  const avgEfficiency = effVals.length
    ? Math.round(effVals.reduce((a, b) => a + b, 0) / effVals.length)
    : null
  const teamStandupCount = orgStandups.filter((s) => teamUserIdSet.has(s.userId)).length

  // Today's standup updates for this team (with author info).
  const userById = new Map(teamMems.map((tm) => [tm.user.id, tm]))
  const todayStandups = orgStandups
    .filter((s) => teamUserIdSet.has(s.userId))
    .map((s) => {
      const tm = userById.get(s.userId)
      return {
        userId: s.userId,
        membershipId: tm?.membership.id ?? null,
        name: tm?.user.name ?? null,
        login: tm?.user.login ?? '',
        avatarUrl: tm?.user.avatarUrl ?? null,
        characterKey: tm?.user.characterKey ?? null,
        yesterday: s.yesterday,
        today: s.today,
        blockers: s.blockers,
      }
    })

  // Currently/recently-on-break members.
  const activeBreaks = breakRows.map((b) => {
    const tm = userById.get(b.userId)
    return {
      id: b.id,
      userId: b.userId,
      membershipId: tm?.membership.id ?? null,
      name: tm?.user.name ?? null,
      login: tm?.user.login ?? '',
      avatarUrl: tm?.user.avatarUrl ?? null,
      characterKey: tm?.user.characterKey ?? null,
      category: b.category,
      reason: b.reason,
      startedAt: b.startedAt.toISOString(),
      endedAt: b.endedAt ? b.endedAt.toISOString() : null,
      active: !b.endedAt,
    }
  })

  return (
    <TeamPageClient
      orgId={orgId}
      teamId={teamId}
      team={{ name: team.name, description: team.description, color: team.color }}
      lead={lead}
      members={members}
      meetingMembers={teamMems.map((tm) => ({
        userId: tm.user.id,
        name: tm.user.name,
        login: tm.user.login,
      }))}
      todayStandups={todayStandups}
      activeBreaks={activeBreaks}
      totals={{
        totalHours,
        avgEfficiency,
        standupCount: teamStandupCount,
        memberCount: members.length,
      }}
      day={day}
    />
  )
}
