/**
 * Verify a cron request. Accepts either:
 *  - `Authorization: Bearer <CRON_SECRET>` (Vercel Cron format), or
 *  - `?secret=<CRON_SECRET>` query param for manual testing.
 */
export function authorizeCron(req: Request): boolean {
  const secret = process.env.CRON_SECRET
  if (!secret) return false

  const auth = req.headers.get('authorization') ?? ''
  if (auth === `Bearer ${secret}`) return true

  try {
    const url = new URL(req.url)
    if (url.searchParams.get('secret') === secret) return true
  } catch {
    // ignore
  }
  return false
}
