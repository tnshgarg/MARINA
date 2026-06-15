import { NextResponse } from 'next/server'
import { and, eq, isNull } from 'drizzle-orm'
import { auth } from '@/auth'
import { db, schema } from '@/lib/db/client'
import { trackEvent, type AnalyticsKind } from '@/lib/analytics/track'

export const runtime = 'nodejs'

/**
 * Client-side analytics ingest. Client components call this when the user
 * performs a tracked action that has no server roundtrip otherwise (e.g.
 * opening a tab inside a SPA page).
 *
 * Server-side flows should call `trackEvent()` directly — going through
 * fetch adds latency for no benefit.
 *
 * Untrusted input: we accept `kind` but only let through known kinds (the
 * trackEvent helper's type is informational at runtime; we validate here
 * to keep junk out of the table).
 */
const ALLOWED_KINDS = new Set<AnalyticsKind>([
  'dashboard.viewed',
  'profile.opened',
  'people.viewed',
  'teams.viewed',
  'reports.opened',
  'scrum.opened',
  'brief.regenerated',
  'narrative.regenerated',
  'meeting.scheduled',
  'leave.requested',
  'leave.decided',
  'blocker.raised',
  'blocker.resolved',
  'blocker.nudged',
  'deliverable.logged',
  'team_report.generated',
  'performance_review.opened',
  'invite.sent',
  'invite.accepted',
  'github.connected',
  'calendar.connected',
  'slack.connected',
  'agent.paired',
  'agent.unpaired',
  'admin.viewed',
  'admin.broadcast.digest_sent',
  'admin.announcement.published',
  'error.caught',
  'rate_limit.hit',
])

export async function POST(req: Request) {
  let body: { kind?: string; orgId?: number; payload?: Record<string, unknown> }
  try {
    body = (await req.json()) ?? {}
  } catch {
    return NextResponse.json({ error: 'invalid json' }, { status: 400 })
  }
  const kind = body.kind as AnalyticsKind | undefined
  if (!kind || !ALLOWED_KINDS.has(kind)) {
    return NextResponse.json({ error: 'unknown kind' }, { status: 400 })
  }

  // Require a signed-in user — this endpoint was previously open to anonymous
  // callers, letting anyone spam allow-listed events into the analytics table.
  const session = await auth()
  if (!session?.appUserId) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  // An orgId from the body must be one the caller actually belongs to —
  // otherwise a user could forge events attributed to any workspace, polluting
  // the founder analytics. Drop the orgId if it isn't theirs.
  let orgId: number | null = null
  if (typeof body.orgId === 'number') {
    const member = await db.query.memberships.findFirst({
      where: and(
        eq(schema.memberships.orgId, body.orgId),
        eq(schema.memberships.userId, session.appUserId),
        isNull(schema.memberships.endedAt),
      ),
    })
    orgId = member ? body.orgId : null
  }

  trackEvent({
    kind,
    orgId,
    userId: session.appUserId,
    payload: body.payload,
    surface: 'web',
  })
  return NextResponse.json({ ok: true })
}
