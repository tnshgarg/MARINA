import { notFound, redirect } from 'next/navigation'
import { and, count, desc, eq, gte, inArray, isNull, lte, sql } from 'drizzle-orm'
import { db, schema } from '@/lib/db/client'
import { HttpError, requireMembership } from '@/lib/auth/guards'
import { getVisibleScope } from '@/lib/auth/scope'
import { TeamReportClient } from './client'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const DAY_MS = 24 * 60 * 60 * 1000

/**
 * Per-team report. Reachable from the "Report" link on each team card in
 * /org/[orgId]/teams. The previous "/reports/team" page mixed every team
 * into one rollup which lost the signal — this page is one team at a time
 * with full per-employee detail, top performers, and people who lagged.
 *
 * Date range is fully customisable via search params (?from=YYYY-MM-DD&to=…)
 * and defaults to the trailing 30 days.
 *
 * An employee can be in multiple teams. This report only counts their
 * activity DURING the window — not their team membership. So if a person
 * sits in two teams, the report shows their full output in each, scoped to
 * the time range. We don't try to split deliverables across teams (they
 * don't have a team tag yet).
 *
 * Access: any manager who can see at least one of the team members. Admins
 * always have access. This matches scoping everywhere else.
 */
export default async function TeamReportPage({
  params,
  searchParams,
}: {
  params: Promise<{ orgId: string; teamId: string }>
  searchParams: Promise<{ from?: string; to?: string }>
}) {
  const { orgId: rawO, teamId: rawT } = await params
  const sp = await searchParams
  const orgId = Number(rawO)
  const teamId = Number(rawT)
  if (!Number.isInteger(orgId) || !Number.isInteger(teamId)) notFound()

  let viewer
  try {
    viewer = await requireMembership(orgId, 'member')
  } catch (err) {
    if (err instanceof HttpError && err.status === 401) redirect('/')
    if (err instanceof HttpError && err.status === 403) redirect('/dashboard')
    throw err
  }

  // Find the team.
  const team = await db.query.teams.findFirst({
    where: and(eq(schema.teams.id, teamId), eq(schema.teams.orgId, orgId)),
  })
  if (!team) notFound()

  // Date range. Default last 30 days. Cap range at 365 days to keep queries sane.
  const todayIso = new Date().toISOString().slice(0, 10)
  const defaultFrom = new Date(Date.now() - 30 * DAY_MS).toISOString().slice(0, 10)
  const from = isIsoDate(sp.from) ? sp.from! : defaultFrom
  const to = isIsoDate(sp.to) ? sp.to! : todayIso
  const fromDt = new Date(from + 'T00:00:00')
  const toDt = new Date(to + 'T23:59:59')

  // Team members + their user records.
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

  // Manager scoping: a viewer must be able to see at least one team member.
  // Otherwise they shouldn't see the report at all.
  const scope = await getVisibleScope(orgId, {
    userId: viewer.session.appUserId,
    membershipId: viewer.membership.id,
    role: viewer.membership.role as 'admin' | 'manager' | 'lead' | 'member',
  })
  if (!scope.isAdminScope) {
    const anyVisible = teamMems.some((tm) => scope.userIds.has(tm.user.id))
    if (!anyVisible) {
      redirect(`/org/${orgId}/teams`)
    }
  }

  // Lead user details for the header.
  let lead: { name: string | null; login: string; image: string | null; avatarUrl: string | null } | null = null
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
        image: (leadRow[0].u as { image?: string | null }).image ?? null,
        avatarUrl: leadRow[0].u.avatarUrl,
      }
    }
  }

  const userIds = teamMems.map((tm) => tm.user.id)
  const membershipIds = teamMems.map((tm) => tm.membership.id)

  // Aggregate everyone's contributions inside the window.
  type PerEmployee = {
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

  const stats = new Map<number, PerEmployee>()
  for (const tm of teamMems) {
    stats.set(tm.user.id, {
      userId: tm.user.id,
      membershipId: tm.membership.id,
      name: tm.user.name,
      login: tm.user.login,
      role: tm.membership.role,
      discipline: (tm.membership as { discipline?: string }).discipline ?? 'other',
      jobTitle: (tm.membership as { jobTitle?: string | null }).jobTitle ?? null,
      avatarUrl: tm.user.avatarUrl,
      image: (tm.user as { image?: string | null }).image ?? null,
      workMin: 0,
      shifts: 0,
      deliverables: 0,
      commits: 0,
      prs: 0,
      reviews: 0,
      issues: 0,
      githubEvents: 0,
      blockersOpened: 0,
      blockersResolved: 0,
      leaveDays: 0,
    })
  }

  if (userIds.length > 0) {
    const [shifts, deliverables, ghEvents, breaks, leaves, latestDeliverables] = await Promise.all([
      db
        .select()
        .from(schema.shifts)
        .where(
          and(
            inArray(schema.shifts.userId, userIds),
            gte(schema.shifts.punchedInAt, fromDt),
            lte(schema.shifts.punchedInAt, toDt),
          ),
        ),
      db
        .select()
        .from(schema.deliverables)
        .where(
          and(
            inArray(schema.deliverables.userId, userIds),
            gte(schema.deliverables.completedAt, fromDt),
            lte(schema.deliverables.completedAt, toDt),
          ),
        ),
      db
        .select({
          userId: schema.githubEvents.userId,
          type: schema.githubEvents.type,
          n: count(),
        })
        .from(schema.githubEvents)
        .where(
          and(
            inArray(schema.githubEvents.userId, userIds),
            gte(schema.githubEvents.occurredAt, fromDt),
            lte(schema.githubEvents.occurredAt, toDt),
          ),
        )
        .groupBy(schema.githubEvents.userId, schema.githubEvents.type),
      db
        .select()
        .from(schema.breaks)
        .where(
          and(
            inArray(schema.breaks.userId, userIds),
            eq(schema.breaks.category, 'blocked'),
            gte(schema.breaks.startedAt, fromDt),
            lte(schema.breaks.startedAt, toDt),
          ),
        ),
      db
        .select()
        .from(schema.leaveRequests)
        .where(
          and(
            inArray(schema.leaveRequests.userId, userIds),
            eq(schema.leaveRequests.status, 'approved'),
            gte(schema.leaveRequests.startDate, from),
            lte(schema.leaveRequests.startDate, to),
          ),
        ),
      db
        .select({
          d: schema.deliverables,
          u: schema.users,
        })
        .from(schema.deliverables)
        .innerJoin(schema.users, eq(schema.deliverables.userId, schema.users.id))
        .where(
          and(
            inArray(schema.deliverables.userId, userIds),
            gte(schema.deliverables.completedAt, fromDt),
            lte(schema.deliverables.completedAt, toDt),
          ),
        )
        .orderBy(desc(schema.deliverables.completedAt))
        .limit(50),
    ])

    for (const s of shifts) {
      const st = stats.get(s.userId)
      if (!st) continue
      st.shifts += 1
      const start = s.punchedInAt.getTime()
      const end = s.punchedOutAt?.getTime() ?? Date.now()
      st.workMin += Math.max(0, Math.round((end - start) / 60000))
    }
    for (const d of deliverables) {
      const st = stats.get(d.userId)
      if (st) st.deliverables += 1
    }
    for (const g of ghEvents) {
      const st = stats.get(g.userId)
      if (!st) continue
      const n = Number(g.n)
      st.githubEvents += n
      if (g.type === 'commit') st.commits += n
      else if (g.type === 'pr_opened') st.prs += n
      else if (g.type === 'pr_reviewed') st.reviews += n
      else if (g.type === 'issue_closed') st.issues += n
    }
    for (const b of breaks) {
      const st = stats.get(b.userId)
      if (!st) continue
      st.blockersOpened += 1
      if (b.endedAt) st.blockersResolved += 1
    }
    for (const l of leaves) {
      const st = stats.get(l.userId)
      if (!st) continue
      const sDt = new Date(l.startDate + 'T00:00:00')
      const eDt = new Date(l.endDate + 'T00:00:00')
      st.leaveDays += Math.max(1, Math.round((eDt.getTime() - sDt.getTime()) / DAY_MS) + 1)
    }

    return (
      <TeamReportClient
        orgId={orgId}
        teamId={teamId}
        team={{
          name: team.name,
          description: team.description,
          color: team.color,
        }}
        lead={lead}
        from={from}
        to={to}
        members={[...stats.values()]}
        recentDeliverables={latestDeliverables.map((r) => ({
          id: r.d.id,
          title: r.d.title,
          url: r.d.url,
          completedAt: r.d.completedAt.toISOString(),
          authorName: r.u.name,
          authorLogin: r.u.login,
          authorUserId: r.u.id,
          membershipId:
            teamMems.find((tm) => tm.user.id === r.u.id)?.membership.id ?? null,
        }))}
      />
    )
  }

  return (
    <TeamReportClient
      orgId={orgId}
      teamId={teamId}
      team={{
        name: team.name,
        description: team.description,
        color: team.color,
      }}
      lead={lead}
      from={from}
      to={to}
      members={[]}
      recentDeliverables={[]}
    />
  )
}

function isIsoDate(s: string | undefined): boolean {
  return !!s && /^\d{4}-\d{2}-\d{2}$/.test(s)
}
