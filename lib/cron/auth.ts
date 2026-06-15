/**
 * Verify a cron request. Accepts:
 *  - `Authorization: Bearer <CRON_SECRET>` (Vercel Cron format) — always
 *  - `?secret=<CRON_SECRET>` query param — DEV ONLY
 *
 * Query string acceptance is dev-only because URL params show up in CDN
 * logs, browser history, shoulder-surfed screenshots, etc.
 */
import { timingSafeEqual } from 'crypto'

function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a)
  const bb = Buffer.from(b)
  if (ab.length !== bb.length) return false
  return timingSafeEqual(ab, bb)
}

export function authorizeCron(req: Request): boolean {
  const secret = process.env.CRON_SECRET
  if (!secret) return false

  const auth = req.headers.get('authorization') ?? ''
  if (safeEqual(auth, `Bearer ${secret}`)) return true

  if (process.env.NODE_ENV !== 'production') {
    try {
      const url = new URL(req.url)
      if (url.searchParams.get('secret') === secret) return true
    } catch {
      // ignore
    }
  }
  return false
}
