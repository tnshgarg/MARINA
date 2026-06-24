import { NextResponse } from 'next/server'
import { and, eq, isNull } from 'drizzle-orm'
import { auth } from '@/auth'
import { db, schema } from '@/lib/db/client'
import { syncUserActivity } from '@/lib/github/sync'

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
    // The user may belong to multiple orgs. Take the union of every active
    // org's tracked-orgs list as the allowlist — an event is kept if ANY of
    // the user's orgs cares about that repo's owner. Empty list (anywhere)
    // = no filter for legacy installs.
    const memberships = await db
      .select({ orgId: schema.memberships.orgId })
      .from(schema.memberships)
      .where(
        and(
          eq(schema.memberships.userId, session.appUserId),
          isNull(schema.memberships.endedAt),
        ),
      )
    let trackedOrgs: string[] = []
    let anyOrgFiltersOff = memberships.length === 0
    for (const m of memberships) {
      const org = await db.query.orgs.findFirst({ where: eq(schema.orgs.id, m.orgId) })
      const list = (org as { trackedGithubOrgs?: string[] } | undefined)?.trackedGithubOrgs ?? []
      if (list.length === 0) {
        anyOrgFiltersOff = true
        break
      }
      trackedOrgs.push(...list)
    }
    const filter = anyOrgFiltersOff ? [] : Array.from(new Set(trackedOrgs))
    const result = await syncUserActivity(session.appUserId, session.login, accessToken, daysBack, filter)
    return NextResponse.json({ ok: true, ...result })
  } catch (err) {
    console.error('sync failed', err)
    return NextResponse.json({ error: 'sync failed' }, { status: 500 })
  }
}
