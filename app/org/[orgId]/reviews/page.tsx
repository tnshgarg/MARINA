import { notFound, redirect } from 'next/navigation'
import { and, desc, eq, gte, inArray, isNull, lte, or } from 'drizzle-orm'
import { auth } from '@/auth'
import { db, schema } from '@/lib/db/client'
import { HttpError, requireScope } from '@/lib/auth/guards'
import { capabilitiesFor } from '@/lib/auth/capabilities'
import type { Role } from '@/lib/db/schema'
import ReviewsClient from './client'

export const dynamic = 'force-dynamic'

/**
 * Target 1:1 rhythm. Next 1:1 is "due" this many days after the last one;
 * past that it's overdue. Also doubles as the stale flag for the cadence
 * column (no 1:1 within ~2 cadences ≈ very overdue).
 */
const CADENCE_DAYS = 14
const DAY = 24 * 60 * 60 * 1000

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

  // Per-member review status, computed only when a cycle is in focus.
  const reviewedUserIds = new Set<number>()

  // ---- 1:1 cadence facts (computed regardless of cycle so the cadence
  // column is always useful). For each in-scope report we track two things:
  //   • lastPast    — most recent NON-cancelled past meeting (offer "log it")
  //   • lastLogged  — most recent completed/logged meeting (its notes/sentiment)
  type MeetingFacts = {
    id: number
    title: string
    startAt: Date
    notes: string | null
    sentiment: string | null
    actionItems: string[]
    completedAt: Date | null
  }
  const lastPast = new Map<number, MeetingFacts>()
  const lastLogged = new Map<number, MeetingFacts>()

  if (scopedUserIds.length > 0) {
    const now = new Date()
    const meetingRows = await db
      .select({
        id: schema.scheduledMeetings.id,
        organiserUserId: schema.scheduledMeetings.organiserUserId,
        attendeeUserId: schema.scheduledMeetings.attendeeUserId,
        title: schema.scheduledMeetings.title,
        startAt: schema.scheduledMeetings.startAt,
        notes: schema.scheduledMeetings.notes,
        sentiment: schema.scheduledMeetings.sentiment,
        actionItems: schema.scheduledMeetings.actionItems,
        completedAt: schema.scheduledMeetings.completedAt,
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
      const facts: MeetingFacts = {
        id: r.id,
        title: r.title,
        startAt: r.startAt,
        notes: r.notes ?? null,
        sentiment: r.sentiment ?? null,
        actionItems: (r.actionItems as string[] | null) ?? [],
        completedAt: r.completedAt ?? null,
      }
      // Attribute the meeting to whichever party is an in-scope report.
      for (const uid of [r.organiserUserId, r.attendeeUserId]) {
        if (!scopedSet.has(uid)) continue
        const prevPast = lastPast.get(uid)
        if (!prevPast || r.startAt.getTime() > prevPast.startAt.getTime()) {
          lastPast.set(uid, facts)
        }
        if (r.completedAt) {
          const prevLog = lastLogged.get(uid)
          if (!prevLog || r.completedAt.getTime() > (prevLog.completedAt?.getTime() ?? 0)) {
            lastLogged.set(uid, facts)
          }
        }
      }
    }
  }

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
  }

  const now = Date.now()

  const members = memberRows
    .map((r) => {
      const past = lastPast.get(r.u.id) ?? null
      const logged = lastLogged.get(r.u.id) ?? null
      const lastMs = past ? past.startAt.getTime() : null
      const daysSince = lastMs === null ? null : Math.floor((now - lastMs) / DAY)
      // Next 1:1 due = last + cadence. Never had one => due now.
      const nextDueMs = lastMs === null ? now : lastMs + CADENCE_DAYS * DAY
      const overdueDays = Math.floor((now - nextDueMs) / DAY)
      // The most recent past meeting is what the manager would log; if it's
      // already logged we still pass it so the dialog can edit the existing note.
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
        lastOneOnOneAt: lastMs === null ? null : new Date(lastMs).toISOString(),
        daysSinceOneOnOne: daysSince,
        nextDueAt: new Date(nextDueMs).toISOString(),
        cadenceOverdue: nextDueMs <= now,
        overdueDays: overdueDays > 0 ? overdueDays : 0,
        // The most recent past meeting (to log/edit), if any.
        lastMeeting: past
          ? {
              id: past.id,
              title: past.title,
              startAt: past.startAt.toISOString(),
              isLogged: past.completedAt !== null,
            }
          : null,
        // The most recent *logged* debrief — its content for inline display.
        loggedDebrief: logged
          ? {
              meetingId: logged.id,
              startAt: logged.startAt.toISOString(),
              completedAt: logged.completedAt ? logged.completedAt.toISOString() : null,
              notes: logged.notes,
              sentiment: logged.sentiment,
              actionItems: logged.actionItems,
            }
          : null,
      }
    })
    // Surface the people who need attention first: overdue 1:1s, then no review.
    .sort((a, b) => {
      if (a.cadenceOverdue !== b.cadenceOverdue) return a.cadenceOverdue ? -1 : 1
      if (a.overdueDays !== b.overdueDays) return b.overdueDays - a.overdueDays
      if (a.reviewed !== b.reviewed) return a.reviewed ? 1 : -1
      const ad = a.daysSinceOneOnOne ?? Number.POSITIVE_INFINITY
      const bd = b.daysSinceOneOnOne ?? Number.POSITIVE_INFINITY
      return bd - ad
    })

  return (
    <ReviewsClient
      orgId={orgId}
      isHr={isHr}
      cadenceDays={CADENCE_DAYS}
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
