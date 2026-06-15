import { NextResponse } from 'next/server'
import { and, eq, isNull } from 'drizzle-orm'
import { auth } from '@/auth'
import { db, schema } from '@/lib/db/client'
import { leaveBalanceForUser } from '@/lib/leave/balance'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * The signed-in user's own leave balance for a given org. Used by the
 * leave-request form so people see their remaining allowance ONLY when they're
 * actually about to request time off (not as an always-on dashboard nudge).
 */
export async function GET(req: Request) {
  const session = await auth()
  if (!session?.appUserId) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }
  const orgId = Number(new URL(req.url).searchParams.get('orgId'))
  if (!Number.isInteger(orgId)) {
    return NextResponse.json({ error: 'orgId required' }, { status: 400 })
  }

  // Must be a current member of the org.
  const membership = await db.query.memberships.findFirst({
    where: and(
      eq(schema.memberships.orgId, orgId),
      eq(schema.memberships.userId, session.appUserId),
      isNull(schema.memberships.endedAt),
    ),
  })
  if (!membership) {
    return NextResponse.json({ error: 'not a member' }, { status: 403 })
  }

  const org = await db.query.orgs.findFirst({ where: eq(schema.orgs.id, orgId) })
  // Per-employee override (if present) wins over the org default; both fall
  // back to DEFAULT_LEAVE_POLICY inside leaveBalanceForUser.
  const policy =
    (membership as { leavePolicy?: Record<string, number> | null }).leavePolicy ??
    (org as { leavePolicy?: Record<string, number> | null } | undefined)?.leavePolicy ??
    null

  const balance = await leaveBalanceForUser(session.appUserId, orgId, policy)
  return NextResponse.json(balance)
}
