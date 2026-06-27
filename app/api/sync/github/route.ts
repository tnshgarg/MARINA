import { NextResponse } from 'next/server'
import { eq } from 'drizzle-orm'
import { auth } from '@/auth'
import { db, schema } from '@/lib/db/client'
import { syncUserActivity } from '@/lib/github/sync'
import { trackedOrgsForUser } from '@/lib/github/auto-sync'

export const runtime = 'nodejs'

export async function POST(req: Request) {
  const session = await auth()
  if (!session?.appUserId || !session.login) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  // Optional initial backfill: the employee onboarding asks for a deep pull
  // (90d) on first connect; the recurring sync stays at 7d. Clamped so a caller
  // can't ask GitHub for an unbounded range.
  let daysBack = 7
  try {
    const body = (await req.json()) as { days?: number }
    if (typeof body?.days === 'number' && [7, 30, 90].includes(body.days)) daysBack = body.days
  } catch {
    /* no body → default 7 */
  }

  // Read the GitHub token from the DB (server-only) rather than the session —
  // the token is `repo`-scoped and must never be exposed to the browser.
  const me = await db.query.users.findFirst({ where: eq(schema.users.id, session.appUserId) })
  const accessToken = me?.accessToken
  if (!accessToken) {
    return NextResponse.json({ error: 'github_not_connected' }, { status: 409 })
  }

  try {
    // The user may belong to multiple orgs. The shared helper takes the union
    // of every active org's tracked-orgs allowlist (empty anywhere = no filter).
    const filter = await trackedOrgsForUser(session.appUserId)
    const result = await syncUserActivity(session.appUserId, session.login, accessToken, daysBack, filter)
    return NextResponse.json({ ok: true, ...result })
  } catch (err) {
    console.error('sync failed', err)
    return NextResponse.json({ error: 'sync failed' }, { status: 500 })
  }
}
