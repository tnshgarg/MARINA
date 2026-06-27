import { and, eq, isNull } from 'drizzle-orm'
import { db, schema } from '@/lib/db/client'
import { verifyShiftSummary } from '@/lib/engine/verify-shift'
import { buildStory } from '@/lib/engine/story'
import { notify } from '@/lib/notify/send'
import { afterResponse } from '@/lib/after'

/**
 * Channel-agnostic punch in / out. Mirrors the agent shift routes so the Slack
 * surface (and any future surface) can start/end a shift through the same
 * verification + story + notify pipeline. `punchedInVia` / `punchedOutVia`
 * record the surface ('slack') for the audit trail. Verification is gatekept
 * to 'skipped' via verifyShiftSummary (screenshots disabled).
 */
export async function punchIn(
  userId: number,
  orgId?: number | null,
  via = 'slack',
): Promise<{ ok: true; shiftId: number; alreadyOpen: boolean } | { ok: false; error: string }> {
  let resolvedOrg = orgId ?? null
  if (resolvedOrg == null) {
    const m = await db.query.memberships.findFirst({
      where: and(eq(schema.memberships.userId, userId), isNull(schema.memberships.endedAt)),
    })
    resolvedOrg = m?.orgId ?? null
  }

  const existing = await db.query.shifts.findFirst({
    where: and(eq(schema.shifts.userId, userId), isNull(schema.shifts.punchedOutAt)),
  })
  if (existing) return { ok: true, shiftId: existing.id, alreadyOpen: true }

  try {
    const [row] = await db
      .insert(schema.shifts)
      .values({ userId, orgId: resolvedOrg ?? undefined, punchedInVia: via })
      .returning()
    return { ok: true, shiftId: row.id, alreadyOpen: false }
  } catch {
    // Race: concurrent punch-in hit the one-open-shift unique index.
    const open = await db.query.shifts.findFirst({
      where: and(eq(schema.shifts.userId, userId), isNull(schema.shifts.punchedOutAt)),
    })
    if (open) return { ok: true, shiftId: open.id, alreadyOpen: true }
    return { ok: false, error: 'Could not punch in. Try again.' }
  }
}

/**
 * Verify a punched-out shift's summary and fire the punch-out notify. This is
 * the SLOW half of a punch-out (an LLM call via verifyShiftSummary) — keep it
 * out of any response with a tight budget (e.g. a Slack `view_submission`, which
 * must ack within ~3s). Re-reads the shift so it can run in the background.
 */
export async function finalizeShiftVerification(
  shiftId: number,
): Promise<{ status: string; score: number } | null> {
  const shift = await db.query.shifts.findFirst({ where: eq(schema.shifts.id, shiftId) })
  if (!shift || !shift.punchedOutAt || !shift.workSummary) return null

  const verdict = await verifyShiftSummary(shift, shift.workSummary)
  const [verified] = await db
    .update(schema.shifts)
    .set({
      verificationStatus: verdict.status,
      verificationScore: verdict.score,
      verificationNotes: verdict.notes,
      verificationProvider: `${verdict.provider}/${verdict.model}`,
      verifiedAt: new Date(),
    })
    .where(eq(schema.shifts.id, shift.id))
    .returning()

  if (verified.orgId) {
    const user = await db.query.users.findFirst({ where: eq(schema.users.id, shift.userId) })
    void notify({
      kind: 'shift.punched_out',
      orgId: verified.orgId,
      actorUserId: shift.userId,
      userName: user?.name ?? `@${user?.login ?? 'someone'}`,
      userLogin: user?.login ?? 'someone',
      durationMins: Math.max(
        0,
        Math.round(((verified.punchedOutAt?.getTime() ?? Date.now()) - verified.punchedInAt.getTime()) / 60000),
      ),
      verificationStatus: verdict.status,
      verificationScore: verdict.score,
      summary: shift.workSummary,
      notes: verdict.notes,
    })
  }

  return { status: verdict.status, score: verdict.score }
}

/** Record the punch-out + summary. Shared by the sync and deferred variants. */
async function recordPunchOut(
  userId: number,
  summary: string,
  via: string,
): Promise<{ ok: true; shiftId: number } | { ok: false; error: string }> {
  const s = (summary ?? '').trim().slice(0, 4000)
  if (s.length < 20) return { ok: false, error: 'Summary must be at least 20 characters.' }

  const shift = await db.query.shifts.findFirst({
    where: and(eq(schema.shifts.userId, userId), isNull(schema.shifts.punchedOutAt)),
  })
  if (!shift) return { ok: false, error: 'No open shift — punch in first.' }

  await db
    .update(schema.shifts)
    .set({ punchedOutAt: new Date(), punchedOutVia: via, workSummary: s, verificationStatus: 'unverified' })
    .where(eq(schema.shifts.id, shift.id))
  return { ok: true, shiftId: shift.id }
}

/**
 * Synchronous punch-out (web / agent surfaces, no tight ack budget): records the
 * summary, then verifies inline and returns the verdict. Story build is
 * deferred as before.
 */
export async function punchOut(
  userId: number,
  summary: string,
  via = 'slack',
): Promise<{ ok: true; status: string; score: number } | { ok: false; error: string }> {
  const rec = await recordPunchOut(userId, summary, via)
  if (!rec.ok) return rec
  afterResponse(() => buildStory(userId, new Date()), 'punchout story')
  const v = await finalizeShiftVerification(rec.shiftId)
  return v ? { ok: true, status: v.status, score: v.score } : { ok: false, error: 'Could not verify shift.' }
}

/**
 * Deferred punch-out for Slack: records the summary and closes the shift
 * immediately, then runs verification + story in the background. This is what
 * keeps `/marina out` snappy — the LLM verify never blocks the modal submit.
 */
export async function punchOutDeferred(
  userId: number,
  summary: string,
  via = 'slack',
): Promise<{ ok: true; shiftId: number } | { ok: false; error: string }> {
  const rec = await recordPunchOut(userId, summary, via)
  if (!rec.ok) return rec
  afterResponse(() => buildStory(userId, new Date()), 'punchout story (deferred)')
  afterResponse(() => finalizeShiftVerification(rec.shiftId), 'shift verify (deferred)')
  return { ok: true, shiftId: rec.shiftId }
}
