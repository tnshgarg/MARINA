import { notFound, redirect } from 'next/navigation'
import { and, desc, eq, gte, inArray, isNull, lte, or } from 'drizzle-orm'
import { auth } from '@/auth'
import { db, schema } from '@/lib/db/client'
import { HttpError, requireScope } from '@/lib/auth/guards'
import { capabilitiesFor } from '@/lib/auth/capabilities'
import type { Role } from '@/lib/db/schema'
import ReviewsClient from './client'

export const dynamic = 'force-dynamic'

/** A 1:1 older than this many days gets an amber "overdue" flag. */
const CADENCE_FLAG_DAYS = 45

/**
 * Performance review cycles + 1:1 cadence — an HR/admin cockpit.
 *
 * Manager+ guard. A scoped manager sees review/cadence status for their reports
 * only; admins (and anyone granted `view_all_data`) see the whole org and can
 * open / close / delete cycles. The page picks a cycle (newest open by default,
 * overridable via ?cycle=<id>) and, for every in-scope member, shows whether a
 * performance narrative landed inside the window and how stale their last 1:1 is.
 */
export default async function ReviewsPage({
  params,
  searchParams,
}: {
  params: Promise<{ orgId: string }>
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}) {
  const { orgId: raw } = await params
  const orgId = Number(raw)
  if (!Number.isInteger(orgId)) notFound()

  let scope
  let membership
  try {
    ;({ scope, membership } = await requireScope(orgId, 'manager'))
  } catch (err) {
    if (err instanceof HttpError && err.status === 401) redirect('/')
    if (err instanceof HttpError && err.status === 403) redirect('/dashboard')
    throw err
  }

  const session = await auth()
  if (!session?.appUserId) redirect('/')

  // HR-grade: who may open/close/delete cycles. Admins hold every cap
  // implicitly; non-admins must have `view_all_data` granted on their
  // membership. This mirrors the API gate exactly.
  const isHr =
    membership.role === 'admin' ||
    capabilitiesFor(
      membership.role as Role,
      (membership as { extraCaps?: string[] }).extraCaps ?? [],
    ).has('view_all_data')

  // All cycles, newest first.
  const cycles = await db
    .select()
    .from(schema.reviewCycles)
    .where(eq(schema.reviewCycles.orgId, orgId))
    .orderBy(desc(schema.reviewCycles.createdAt))
    .limit(200)

  // Which cycle is in focus? ?cycle=<id> wins (when it's a real cycle of this
  // org); otherwise the newest OPEN cycle; otherwise the newest cycle overall.
  const rawSel = (await searchParams).cycle
  const selParam = Number(Array.isArray(rawSel) ? rawSel[0] : rawSel)
  const selected =
    cycles.find((c) => c.id === selParam) ??
    cycles.find((c) => c.status === 'open') ??
    cycles[0] ??
    null

  // In-scope members: pull the org's active roster once, filter by scope in
  // memory — identical shape to the members / risk pages.
  const allMemberRows = await db
    .select({ m: schema.memberships, u: schema.users })
    .from(schema.memberships)
    .innerJoin(schema.users, eq(schema.memberships.userId, schema.users.id))
    .where(and(eq(schema.memberships.orgId, orgId), isNull(schema.memberships.endedAt)))

  const memberRows = scope.isAdminScope
    ? allMemberRows
    : allMemberRows.filter((r) => scope.userIds.has(r.u.id))

  const scopedUserIds = memberRows.map((r) => r.u.id)

  // Per-member review + cadence facts, computed only when a cycle is in focus.
  const reviewedUserIds = new Set<number>()
  /** userId -> most recent past 1:1 startAt (ms). */
  const lastOneOnOne = new Map<number, number>()

  if (selected && scopedUserIds.length > 0) {
    // "Review on file" = a narrative whose createdAt falls inside the cycle
    // window. The window is a [start, end] of date-only columns; widen end to
    // the end of that day so a review written any time on periodEnd counts.
    const windowStart = new Date(`${selected.periodStart}T00:00:00.000Z`)
    const windowEnd = new Date(`${selected.periodEnd}T23:59:59.999Z`)

    const narrativeRows = await db
      .select({ userId: schema.narratives.userId })
      .from(schema.narratives)
      .where(
        and(
          inArray(schema.narratives.userId, scopedUserIds),
          gte(schema.narratives.createdAt, windowStart),
          lte(schema.narratives.createdAt, windowEnd),
        ),
      )
    for (const r of narrativeRows) reviewedUserIds.add(r.userId)

    // 1:1 cadence: most recent NON-cancelled scheduled meeting involving the
    // member (as organiser OR attendee) whose startAt is in the past. We fetch
    // the in-scope, past, live rows and reduce to a per-user max in memory.
    const now = new Date()
    const meetingRows = await db
      .select({
        organiserUserId: schema.scheduledMeetings.organiserUserId,
        attendeeUserId: schema.scheduledMeetings.attendeeUserId,
        startAt: schema.scheduledMeetings.startAt,
      })
      .from(schema.scheduledMeetings)
      .where(
        and(
          eq(schema.scheduledMeetings.orgId, orgId),
          isNull(schema.scheduledMeetings.cancelledAt),
          lte(schema.scheduledMeetings.startAt, now),
          or(
            inArray(schema.scheduledMeetings.attendeeUserId, scopedUserIds),
            inArray(schema.scheduledMeetings.organiserUserId, scopedUserIds),
          ),
        ),
      )

    const scopedSet = new Set(scopedUserIds)
    for (const r of meetingRows) {
      const ms = r.startAt.getTime()
      for (const uid of [r.organiserUserId, r.attendeeUserId]) {
        if (!scopedSet.has(uid)) continue
        const prev = lastOneOnOne.get(uid)
        if (prev === undefined || ms > prev) lastOneOnOne.set(uid, ms)
      }
    }
  }

  const now = Date.now()
  const DAY = 24 * 60 * 60 * 1000

  const members = memberRows
    .map((r) => {
      const lastMs = lastOneOnOne.get(r.u.id)
      const daysSince = lastMs === undefined ? null : Math.floor((now - lastMs) / DAY)
      return {
        membershipId: r.m.id,
        userId: r.u.id,
        login: r.u.login,
        name: r.u.name,
        avatarUrl: r.u.avatarUrl,
        characterKey: r.u.characterKey,
        role: r.m.role,
        jobTitle: r.m.jobTitle ?? null,
        reviewed: reviewedUserIds.has(r.u.id),
        lastOneOnOneAt: lastMs === undefined ? null : new Date(lastMs).toISOString(),
        daysSinceOneOnOne: daysSince,
        cadenceOverdue: daysSince === null || daysSince > CADENCE_FLAG_DAYS,
      }
    })
    // Surface the people who need attention first: no review, then stalest 1:1.
    .sort((a, b) => {
      if (a.reviewed !== b.reviewed) return a.reviewed ? 1 : -1
      const ad = a.daysSinceOneOnOne ?? Number.POSITIVE_INFINITY
      const bd = b.daysSinceOneOnOne ?? Number.POSITIVE_INFINITY
      return bd - ad
    })

  return (
    <ReviewsClient
      orgId={orgId}
      isHr={isHr}
      cadenceFlagDays={CADENCE_FLAG_DAYS}
      cycles={cycles.map((c) => ({
        id: c.id,
        name: c.name,
        periodStart: c.periodStart,
        periodEnd: c.periodEnd,
        status: c.status,
      }))}
      selectedCycleId={selected?.id ?? null}
      members={members}
    />
  )
}
