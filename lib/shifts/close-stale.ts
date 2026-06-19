import { and, desc, eq, gte, isNull, lt } from 'drizzle-orm'
import { db, schema } from '@/lib/db/client'

/** A shift open longer than this is almost certainly forgotten (punched in,
 *  logged off, never punched out). */
const STALE_HOURS = 16

/**
 * Close shifts that have been left open too long. Honest close: end the shift at
 * the LAST recorded agent activity inside it; if there's no telemetry at all,
 * end it at punch-in (a zero-duration, clearly-flagged shift) rather than
 * inflating hours with time the person almost certainly wasn't working.
 * Idempotent — safe to run from the daily sweep. Returns the count closed.
 */
export async function closeStaleShifts(now = new Date()): Promise<number> {
  const cutoff = new Date(now.getTime() - STALE_HOURS * 60 * 60 * 1000)
  const open = await db
    .select({
      id: schema.shifts.id,
      userId: schema.shifts.userId,
      punchedInAt: schema.shifts.punchedInAt,
    })
    .from(schema.shifts)
    .where(and(isNull(schema.shifts.punchedOutAt), lt(schema.shifts.punchedInAt, cutoff)))

  let closed = 0
  for (const s of open) {
    // Last activity window for this user inside the shift, if the agent reported.
    const lastAct = await db
      .select({ windowEnd: schema.localActivity.windowEnd })
      .from(schema.localActivity)
      .where(
        and(
          eq(schema.localActivity.userId, s.userId),
          gte(schema.localActivity.windowStart, s.punchedInAt),
        ),
      )
      .orderBy(desc(schema.localActivity.windowEnd))
      .limit(1)
    const endedAt = lastAct[0]?.windowEnd ?? s.punchedInAt

    await db
      .update(schema.shifts)
      .set({
        punchedOutAt: endedAt,
        punchedOutVia: 'auto',
        workSummary: '(Auto-closed — shift was left open. Duration reflects recorded activity only.)',
        verificationStatus: 'skipped',
      })
      .where(eq(schema.shifts.id, s.id))
    closed++
  }
  return closed
}
