import { db, schema } from '@/lib/db/client'
import { afterResponse } from '@/lib/after'

/**
 * Product analytics event sink.
 *
 * Why this exists: we need to know which features are being used, by whom,
 * and how often — to make decisions about what to invest in next. Without
 * this, every roadmap conversation is a guess.
 *
 * Design principles:
 *   - **Fire and forget.** Never block a request to record an event. We
 *     wrap the insert in `afterResponse` so it runs after the response is
 *     flushed; if it fails, it logs and disappears.
 *   - **No PII inside `payload`.** Only IDs, counts, enum values. Free-form
 *     user text never lands here — that would turn this table into a
 *     compliance nightmare.
 *   - **Cheap to call.** Callers shouldn't think hard about whether to
 *     instrument; if you wonder if something is worth tracking, it is.
 *
 * Event kinds use dotted namespacing: `dashboard.viewed`, `profile.opened`,
 * `brief.regenerated`, `meeting.scheduled`, `report.generated`, etc.
 * Keep them stable — renames break dashboards.
 */
export type AnalyticsKind =
  // Pageviews / surface opens
  | 'dashboard.viewed'
  | 'profile.opened'
  | 'people.viewed'
  | 'teams.viewed'
  | 'reports.opened'
  | 'scrum.opened'
  // Feature actions
  | 'brief.regenerated'
  | 'narrative.regenerated'
  | 'meeting.scheduled'
  | 'leave.requested'
  | 'leave.decided'
  | 'blocker.raised'
  | 'blocker.resolved'
  | 'blocker.nudged'
  | 'deliverable.logged'
  | 'team_report.generated'
  | 'performance_review.opened'
  | 'invite.sent'
  | 'invite.accepted'
  | 'github.connected'
  | 'calendar.connected'
  | 'slack.connected'
  | 'agent.paired'
  | 'agent.unpaired'
  // Admin console
  | 'admin.viewed'
  | 'admin.broadcast.digest_sent'
  | 'admin.announcement.published'
  // Errors / drop-offs
  | 'error.caught'
  | 'rate_limit.hit'

export type TrackInput = {
  kind: AnalyticsKind
  orgId?: number | null
  userId?: number | null
  /** Structured payload — IDs and counts only, no PII. */
  payload?: Record<string, unknown>
  surface?: 'web' | 'agent' | 'slack' | 'admin' | 'api'
  sessionId?: string | null
}

/** Record an analytics event. Fire-and-forget; never blocks the request. */
export function trackEvent(input: TrackInput): void {
  afterResponse(
    async () => {
      try {
        await db.insert(schema.analyticsEvents).values({
          orgId: input.orgId ?? null,
          userId: input.userId ?? null,
          kind: input.kind,
          payload: input.payload as never,
          surface: input.surface ?? 'web',
          sessionId: input.sessionId ?? null,
        })
      } catch (err) {
        // Swallow — analytics must never break the request path. We do log
        // so a missing migration is visible during local dev.
        console.error('[analytics] track failed', input.kind, err)
      }
    },
    `track ${input.kind}`,
  )
}
