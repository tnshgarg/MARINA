import { and, eq, gte } from 'drizzle-orm'
import { db, schema } from '@/lib/db/client'

/**
 * Postgres-backed sliding-window rate limiter for sensitive endpoints
 * (magic-link issue, pairing-code generation, etc.). Uses a per-bucket
 * lookup against `rate_limit_events`.
 *
 * Pros: zero-infra, durable, works on serverless.
 * Cons: every check is a DB round-trip + insert. Use for low-frequency
 * sensitive ops, not for hot-path API protection (use a CDN edge limit
 * for that).
 */

export type RateLimitResult = {
  allowed: boolean
  remaining: number
  resetAtMs: number
}

/**
 * Take an event in this bucket. If the bucket has had >= `limit` events in
 * the last `windowMs`, returns allowed=false and does NOT insert.
 *
 * Buckets:
 *   - `magic_link:<email>` → 5 per 15 min
 *   - `pair_code:<userId>` → 3 per 15 min
 *   - `invite:<orgId>`     → 20 per 1 hr
 */
export async function checkRateLimit(
  bucket: string,
  limit: number,
  windowMs: number,
): Promise<RateLimitResult> {
  const since = new Date(Date.now() - windowMs)

  const recent = await db
    .select({ id: schema.rateLimitEvents.id, at: schema.rateLimitEvents.occurredAt })
    .from(schema.rateLimitEvents)
    .where(
      and(
        eq(schema.rateLimitEvents.bucket, bucket),
        gte(schema.rateLimitEvents.occurredAt, since),
      ),
    )

  if (recent.length >= limit) {
    const oldestMs = Math.min(...recent.map((r) => r.at.getTime()))
    return { allowed: false, remaining: 0, resetAtMs: oldestMs + windowMs }
  }

  await db.insert(schema.rateLimitEvents).values({ bucket })

  return {
    allowed: true,
    remaining: Math.max(0, limit - recent.length - 1),
    resetAtMs: Date.now() + windowMs,
  }
}
