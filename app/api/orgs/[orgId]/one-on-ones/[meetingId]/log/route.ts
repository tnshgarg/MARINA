import { NextResponse } from 'next/server'
import { and, eq } from 'drizzle-orm'
import { db, schema } from '@/lib/db/client'
import { HttpError, ensureScopeUser, requireScope } from '@/lib/auth/guards'
import { audit, requestMeta } from '@/lib/audit/log'

export const runtime = 'nodejs'

const NOTES_MAX = 5000
const ITEM_MAX = 500
const ITEMS_MAX = 20
const SENTIMENTS = ['great', 'ok', 'concern'] as const
type Sentiment = (typeof SENTIMENTS)[number]

/**
 * POST /api/orgs/[orgId]/one-on-ones/[meetingId]/log
 *
 * Log how a 1:1 went after the fact: notes, a coarse sentiment, action items,
 * and mark the meeting completed. Manager+ only; the meeting must belong to
 * this org and the *other* party (the report) must be inside the manager's
 * scope, so a scoped manager can only debrief their own people's 1:1s.
 *
 * Body: { notes?, sentiment?: 'great'|'ok'|'concern', actionItems?: string[] }
 */
export async function POST(
  req: Request,
  ctx: { params: Promise<{ orgId: string; meetingId: string }> },
) {
  const { orgId: rawO, meetingId: rawM } = await ctx.params
  const orgId = Number(rawO)
  const meetingId = Number(rawM)
  if (!Number.isInteger(orgId) || !Number.isInteger(meetingId)) {
    return NextResponse.json({ error: 'invalid ids' }, { status: 400 })
  }

  try {
    const { session, scope } = await requireScope(orgId, 'manager')

    const meeting = await db.query.scheduledMeetings.findFirst({
      where: and(
        eq(schema.scheduledMeetings.id, meetingId),
        eq(schema.scheduledMeetings.orgId, orgId),
      ),
    })
    if (!meeting) return NextResponse.json({ error: 'meeting not found' }, { status: 404 })
    if (meeting.cancelledAt) {
      return NextResponse.json({ error: 'meeting was cancelled' }, { status: 400 })
    }

    // Scope check: the report (the party who isn't the signed-in manager) must
    // be visible to this manager. If the manager organised it, the report is
    // the attendee; otherwise it's the organiser. Admin scope passes anyway.
    const reportUserId =
      meeting.organiserUserId === session.appUserId
        ? meeting.attendeeUserId
        : meeting.organiserUserId
    ensureScopeUser(scope, reportUserId)

    const body = (await req.json().catch(() => ({}))) as {
      notes?: unknown
      sentiment?: unknown
      actionItems?: unknown
    }

    const notes =
      typeof body.notes === 'string' && body.notes.trim().length > 0
        ? body.notes.trim().slice(0, NOTES_MAX)
        : null

    let sentiment: Sentiment | null = null
    if (body.sentiment != null) {
      if (!SENTIMENTS.includes(body.sentiment as Sentiment)) {
        return NextResponse.json(
          { error: `sentiment must be one of ${SENTIMENTS.join(', ')}` },
          { status: 400 },
        )
      }
      sentiment = body.sentiment as Sentiment
    }

    let actionItems: string[] = []
    if (body.actionItems != null) {
      if (!Array.isArray(body.actionItems)) {
        return NextResponse.json({ error: 'actionItems must be an array' }, { status: 400 })
      }
      actionItems = body.actionItems
        .filter((x): x is string => typeof x === 'string')
        .map((s) => s.trim().slice(0, ITEM_MAX))
        .filter((s) => s.length > 0)
        .slice(0, ITEMS_MAX)
    }

    const [updated] = await db
      .update(schema.scheduledMeetings)
      .set({
        notes,
        sentiment,
        actionItems,
        completedAt: meeting.completedAt ?? new Date(),
        loggedByUserId: session.appUserId,
      })
      .where(eq(schema.scheduledMeetings.id, meetingId))
      .returning()

    void audit({
      action: 'org.settings_changed',
      orgId,
      actorUserId: session.appUserId,
      targetType: 'user',
      targetId: reportUserId,
      payload: {
        event: 'one_on_one_logged',
        meetingId,
        sentiment,
        actionItemCount: actionItems.length,
        hasNotes: notes !== null,
      },
      ...requestMeta(req),
    })

    return NextResponse.json({
      ok: true,
      meeting: {
        id: updated.id,
        notes: updated.notes,
        sentiment: updated.sentiment,
        actionItems: updated.actionItems,
        completedAt: updated.completedAt ? updated.completedAt.toISOString() : null,
      },
    })
  } catch (err) {
    if (err instanceof HttpError) {
      return NextResponse.json({ error: err.message }, { status: err.status })
    }
    console.error('one-on-one log failed', err)
    return NextResponse.json({ error: 'internal' }, { status: 500 })
  }
}
