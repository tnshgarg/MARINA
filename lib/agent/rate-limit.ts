/**
 * Per-token sliding-window rate limiting.
 *
 * In-memory only — fine for a single Vercel instance / dev. For production with
 * multiple regions or warm-pool instances you'd swap this for Upstash or Vercel
 * KV. The interface is small enough to make that a one-file change.
 */

type Bucket = {
  windowStartMs: number
  count: number
}

const STORE = new Map<string, Bucket>()
const SWEEP_INTERVAL_MS = 5 * 60 * 1000
let lastSweep = Date.now()

export type RateLimitName = 'events' | 'heartbeat' | 'pause' | 'screenshots'

const LIMITS: Record<RateLimitName, { max: number; windowMs: number }> = {
  events: { max: 60, windowMs: 60 * 1000 }, // 60 batches/min
  heartbeat: { max: 30, windowMs: 60 * 1000 },
  pause: { max: 30, windowMs: 60 * 1000 },
  screenshots: { max: 20, windowMs: 5 * 60 * 1000 }, // <= 4/min average
}

export type RateLimitResult = {
  ok: boolean
  remaining: number
  resetMs: number
  limit: number
}

export function checkLimit(name: RateLimitName, tokenId: number): RateLimitResult {
  const { max, windowMs } = LIMITS[name]
  const now = Date.now()
  const key = `${name}:${tokenId}`
  let bucket = STORE.get(key)
  if (!bucket || now - bucket.windowStartMs >= windowMs) {
    bucket = { windowStartMs: now, count: 0 }
    STORE.set(key, bucket)
  }
  bucket.count++
  maybeSweep(now)
  const resetMs = bucket.windowStartMs + windowMs - now
  return {
    ok: bucket.count <= max,
    remaining: Math.max(0, max - bucket.count),
    resetMs,
    limit: max,
  }
}

function maybeSweep(now: number): void {
  if (now - lastSweep < SWEEP_INTERVAL_MS) return
  lastSweep = now
  for (const [k, b] of STORE.entries()) {
    const limitName = k.split(':')[0] as RateLimitName
    const cfg = LIMITS[limitName]
    if (!cfg) {
      STORE.delete(k)
      continue
    }
    if (now - b.windowStartMs > cfg.windowMs * 2) STORE.delete(k)
  }
}

export function rateLimitHeaders(r: RateLimitResult): Record<string, string> {
  return {
    'x-ratelimit-limit': String(r.limit),
    'x-ratelimit-remaining': String(r.remaining),
    'x-ratelimit-reset': String(Math.ceil(r.resetMs / 1000)),
  }
}
