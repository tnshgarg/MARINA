import { and, eq, sql } from 'drizzle-orm'
import { db, schema } from '@/lib/db/client'
import type { Plan } from '@/lib/db/schema'

/**
 * Early-bird code redemption. We seed codes manually for design partners
 * and the first wave of customers; redeeming one flips the org to a paid
 * plan without going through Razorpay.
 *
 * Returns a discriminated union so callers (the API route + the UI) can
 * map each failure to a human-readable message without losing fidelity.
 */
export type RedeemResult =
  | { ok: true; plan: Plan; expiresAt: Date | null; lifetime: boolean }
  | { ok: false; reason: 'unknown_code' | 'inactive' | 'expired' | 'exhausted' | 'already_redeemed' }

/**
 * Normalise a raw user input to the storage form. We strip whitespace,
 * uppercase, and squash internal whitespace. This way "  marina50 " and
 * "MARINA50" hit the same row.
 */
export function normaliseCode(raw: string): string {
  return raw.replace(/\s+/g, '').toUpperCase()
}

export async function redeemEarlyBird({
  orgId,
  userId,
  code: raw,
}: {
  orgId: number
  userId: number
  code: string
}): Promise<RedeemResult> {
  const code = normaliseCode(raw)
  if (!code) return { ok: false, reason: 'unknown_code' }

  const row = await db.query.earlyBirdCodes.findFirst({
    where: eq(schema.earlyBirdCodes.code, code),
  })
  if (!row) return { ok: false, reason: 'unknown_code' }
  if (!row.isActive) return { ok: false, reason: 'inactive' }
  if (row.expiresAt && row.expiresAt < new Date()) return { ok: false, reason: 'expired' }
  if (row.usedCount >= row.maxRedemptions) return { ok: false, reason: 'exhausted' }

  // Was this code already redeemed by *this* org? We block double-spend.
  const prior = await db.query.earlyBirdRedemptions.findFirst({
    where: and(
      eq(schema.earlyBirdRedemptions.codeId, row.id),
      eq(schema.earlyBirdRedemptions.orgId, orgId),
    ),
  })
  if (prior) return { ok: false, reason: 'already_redeemed' }

  const grantExpiresAt = row.durationDays
    ? new Date(Date.now() + row.durationDays * 24 * 60 * 60 * 1000)
    : null

  // The three writes form a unit. We do them sequentially because Drizzle's
  // serverless driver doesn't support transactions; the unique index on
  // (codeId, orgId) and the >= maxRedemptions check above keep us honest.
  await db.insert(schema.earlyBirdRedemptions).values({
    codeId: row.id,
    orgId,
    redeemedByUserId: userId,
    grantedPlan: row.plan,
    grantExpiresAt,
  })

  await db
    .update(schema.earlyBirdCodes)
    .set({ usedCount: sql`${schema.earlyBirdCodes.usedCount} + 1` })
    .where(eq(schema.earlyBirdCodes.id, row.id))

  // Flip the org to the granted plan. We use trialEndsAt as the lapse date
  // because the existing downgrade logic already respects it — when it falls
  // in the past, the cron will reset the org to free.
  await db
    .update(schema.orgs)
    .set({
      plan: row.plan,
      trialEndsAt: grantExpiresAt,
      // No paid provider — this is a manual grant.
      billingProvider: null,
    })
    .where(eq(schema.orgs.id, orgId))

  return {
    ok: true,
    plan: row.plan,
    expiresAt: grantExpiresAt,
    lifetime: row.durationDays === null,
  }
}

/**
 * Human-readable failure messages keyed by `reason`. Centralised so the API
 * route and the client both render the same copy.
 */
export const REDEEM_FAILURE_COPY: Record<
  Exclude<RedeemResult, { ok: true }>['reason'],
  string
> = {
  unknown_code: 'That code doesn’t look right. Double-check with whoever shared it.',
  inactive: 'This code was disabled. Reach out to thetanishgarg@gmail.com if you think this is a mistake.',
  expired: 'This code has expired. We’re happy to issue you a fresh one — drop us a line.',
  exhausted: 'This code has been fully redeemed. It can’t be used again.',
  already_redeemed: 'Your workspace already redeemed this code.',
}
