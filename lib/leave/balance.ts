import { and, eq, gte, lte } from 'drizzle-orm'
import { db, schema } from '@/lib/db/client'
import { DEFAULT_LEAVE_POLICY } from '@/lib/db/schema'

/**
 * Leave-balance computation. Balance is intentionally derived (not stored):
 *
 *   remaining = annual quota (from org policy) − days already approved this
 *   calendar year for that type.
 *
 * Deriving avoids an accrual ledger we'd have to keep perfectly in sync; the
 * org's `leavePolicy` is the single source of quota and approved leaves are
 * the single source of usage. Only types that appear in the policy get a
 * numeric balance — statutory/case-by-case types (maternity, bereavement, …)
 * are shown as "as needed".
 */
export type LeaveBalanceRow = {
  type: string
  quota: number
  used: number
  remaining: number
}

export type LeaveBalance = {
  year: number
  rows: LeaveBalanceRow[]
}

/** Inclusive day count between two YYYY-MM-DD strings, clamped to [from,to]. */
function inclusiveDaysClamped(startISO: string, endISO: string, fromISO: string, toISO: string): number {
  const s = startISO < fromISO ? fromISO : startISO
  const e = endISO > toISO ? toISO : endISO
  if (s > e) return 0
  const ms = Date.parse(e + 'T00:00:00Z') - Date.parse(s + 'T00:00:00Z')
  return Math.floor(ms / 86_400_000) + 1
}

export function orgLeavePolicy(policy: Record<string, number> | null | undefined): Record<string, number> {
  if (policy && Object.keys(policy).length > 0) return policy
  return DEFAULT_LEAVE_POLICY
}

/**
 * Compute a single user's leave balance for the given calendar year (defaults
 * to the current year). `policy` is the org's leavePolicy (or null → default).
 */
export async function leaveBalanceForUser(
  userId: number,
  orgId: number,
  policy: Record<string, number> | null | undefined,
  year = new Date().getFullYear(),
): Promise<LeaveBalance> {
  const fromISO = `${year}-01-01`
  const toISO = `${year}-12-31`

  const approved = await db
    .select({
      startDate: schema.leaveRequests.startDate,
      endDate: schema.leaveRequests.endDate,
      leaveType: schema.leaveRequests.leaveType,
    })
    .from(schema.leaveRequests)
    .where(
      and(
        eq(schema.leaveRequests.userId, userId),
        eq(schema.leaveRequests.orgId, orgId),
        eq(schema.leaveRequests.status, 'approved'),
        // Overlaps the year window.
        lte(schema.leaveRequests.startDate, toISO),
        gte(schema.leaveRequests.endDate, fromISO),
      ),
    )

  const usedByType = new Map<string, number>()
  for (const l of approved) {
    const days = inclusiveDaysClamped(l.startDate, l.endDate, fromISO, toISO)
    usedByType.set(l.leaveType, (usedByType.get(l.leaveType) ?? 0) + days)
  }

  const pol = orgLeavePolicy(policy)
  const rows: LeaveBalanceRow[] = Object.entries(pol).map(([type, quota]) => {
    const used = usedByType.get(type) ?? 0
    return { type, quota, used, remaining: Math.max(0, quota - used) }
  })

  return { year, rows }
}
