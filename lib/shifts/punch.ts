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
      .values({ userId, orgId: resolvedOrg ?? undefined, punchedInVia: 'slack' })
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

export async function punchOut(
  userId: number,
  summary: string,
): Promise<{ ok: true; status: string; score: number } | { ok: false; error: string }> {
  const s = (summary ?? '').trim().slice(0, 4000)
  if (s.length < 20) return { ok: false, error: 'Summary must be at least 20 characters.' }

  const shift = await db.query.shifts.findFirst({
    where: and(eq(schema.shifts.userId, userId), isNull(schema.shifts.punchedOutAt)),
  })
  if (!shift) return { ok: false, error: 'No open shift — punch in first.' }

  const punchedOutAt = new Date()
  const [updated] = await db
    .update(schema.shifts)
    .set({ punchedOutAt, punchedOutVia: 'slack', workSummary: s, verificationStatus: 'unverified' })
    .where(eq(schema.shifts.id, shift.id))
    .returning()

  const verdict = await verifyShiftSummary(updated, s)
  const [verified] = await db
    .update(schema.shifts)
    .set({
      verificationStatus: verdict.status,
      verificationScore: verdict.score,
      verificationNotes: verdict.notes,
      verificationProvider: `${verdict.provider}/${verdict.model}`,
      verifiedAt: new Date(),
    })
    .where(eq(schema.shifts.id, updated.id))
    .returning()

  afterResponse(() => buildStory(userId, new Date()), 'slack punchout story')

  if (verified.orgId) {
    const user = await db.query.users.findFirst({ where: eq(schema.users.id, userId) })
    void notify({
      kind: 'shift.punched_out',
      orgId: verified.orgId,
      actorUserId: userId,
      userName: user?.name ?? `@${user?.login ?? 'someone'}`,
      userLogin: user?.login ?? 'someone',
      durationMins: Math.max(0, Math.round((punchedOutAt.getTime() - verified.punchedInAt.getTime()) / 60000)),
      verificationStatus: verdict.status,
      verificationScore: verdict.score,
      summary: s,
      notes: verdict.notes,
    })
  }

  return { ok: true, status: verdict.status, score: verdict.score }
}
