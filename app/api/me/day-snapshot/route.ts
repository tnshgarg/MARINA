import { NextResponse } from 'next/server'
import { and, count, desc, eq, gt, gte, isNull, lt, lte, sql } from 'drizzle-orm'
import { db, schema } from '@/lib/db/client'
import { HttpError, requireSession } from '@/lib/auth/guards'

export const runtime = 'nodejs'

/**
 * Single-call "what's my day look like right now" endpoint.
 *
 * Powers the personal-dashboard "Your day" card (replacement for the static
 * AI story) AND the upcoming desktop-agent "Today" panel — both surfaces
 * read the same shape so the two stay in sync.
 *
 * Polled every 30 seconds from the web. The agent should poll on the same
 * cadence (cheaper than recomputing locally).
 */
export async function GET() {
  try {
    const session = await requireSession()
    const userId = session.appUserId
    const now = new Date()
    const todayMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate())

    // 1. Active shift — required for almost every metric below.
    const activeShift = await db.query.shifts.findFirst({
      where: and(
        eq(schema.shifts.userId, userId),
        isNull(schema.shifts.punchedOutAt),
      ),
      orderBy: [desc(schema.shifts.punchedInAt)],
    })

    if (!activeShift) {
      return NextResponse.json({
        punchedIn: false,
        shiftStartedAt: null,
        productivity: 0,
        focusMinutes: 0,
        totalShiftMinutes: 0,
        deliverablesToday: 0,
        meetingsRemainingToday: 0,
        nextMeetingAt: null,
        nextMeetingTitle: null,
        activeBreak: null,
        narrative: null,
      })
    }

    // 2. Activity totals SINCE PUNCH-IN — focus / idle.
    const [activitySum, activeBreak, deliverablesCount, todaysMeetings, latestNarrative] = await Promise.all([
      db
        .select({
          focus: sql<number>`COALESCE(SUM(${schema.localActivity.activeSeconds}), 0)`,
          idle: sql<number>`COALESCE(SUM(${schema.localActivity.idleSeconds}), 0)`,
        })
        .from(schema.localActivity)
        .where(
          and(
            eq(schema.localActivity.userId, userId),
            gte(schema.localActivity.windowStart, activeShift.punchedInAt),
          ),
        ),
      db.query.breaks.findFirst({
        where: and(eq(schema.breaks.userId, userId), isNull(schema.breaks.endedAt)),
        orderBy: [desc(schema.breaks.startedAt)],
      }),
      db
        .select({ n: count() })
        .from(schema.deliverables)
        .where(
          and(
            eq(schema.deliverables.userId, userId),
            gte(schema.deliverables.completedAt, todayMidnight),
          ),
        ),
      db
        .select({
          id: schema.meetings.id,
          title: schema.meetings.title,
          startAt: schema.meetings.startAt,
          endAt: schema.meetings.endAt,
        })
        .from(schema.meetings)
        .where(
          and(
            eq(schema.meetings.userId, userId),
            gte(schema.meetings.startAt, todayMidnight),
            lt(schema.meetings.startAt, new Date(todayMidnight.getTime() + 24 * 60 * 60 * 1000)),
          ),
        )
        .orderBy(schema.meetings.startAt),
      db
        .select({ body: schema.narratives.body })
        .from(schema.narratives)
        .where(eq(schema.narratives.userId, userId))
        .orderBy(desc(schema.narratives.createdAt))
        .limit(1)
        .then((rows) => rows[0]),
    ])

    const focusSec = Number(activitySum[0]?.focus ?? 0)
    const idleSec = Number(activitySum[0]?.idle ?? 0)
    const totalSec = focusSec + idleSec
    const productivity = totalSec > 0 ? Math.round((focusSec / totalSec) * 100) : 0
    void lte  // keep the import used

    // Filter meetings that haven't ended yet.
    const upcoming = todaysMeetings.filter((m) => m.endAt.getTime() > now.getTime())
    const next = upcoming[0] ?? null

    return NextResponse.json({
      punchedIn: true,
      shiftStartedAt: activeShift.punchedInAt.toISOString(),
      productivity,
      focusMinutes: Math.round(focusSec / 60),
      totalShiftMinutes: Math.round(totalSec / 60),
      deliverablesToday: Number(deliverablesCount[0]?.n ?? 0),
      meetingsRemainingToday: upcoming.length,
      nextMeetingAt: next?.startAt.toISOString() ?? null,
      nextMeetingTitle: next?.title ?? null,
      activeBreak: activeBreak
        ? {
            reason: activeBreak.reason,
            minutesAgo: Math.max(0, Math.round((now.getTime() - activeBreak.startedAt.getTime()) / 60_000)),
          }
        : null,
      narrative: latestNarrative?.body ?? null,
    })
  } catch (err) {
    if (err instanceof HttpError) {
      return NextResponse.json({ error: err.message }, { status: err.status })
    }
    console.error('day-snapshot failed', err)
    void gt
    return NextResponse.json({ error: 'internal' }, { status: 500 })
  }
}
