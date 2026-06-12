import { and, eq, isNull, or, sql } from 'drizzle-orm'
import { db, schema } from '@/lib/db/client'
import type { Capability } from '@/lib/auth/capabilities'

/**
 * Active, non-removed memberships at or above manager rank. Used for
 * fan-out events where the natural audience is "managers + owner".
 */
export async function managerUserIdsForOrg(orgId: number): Promise<number[]> {
  const rows = await db
    .select({ userId: schema.memberships.userId })
    .from(schema.memberships)
    .where(
      and(
        eq(schema.memberships.orgId, orgId),
        isNull(schema.memberships.endedAt),
        or(
          eq(schema.memberships.role, 'owner'),
          eq(schema.memberships.role, 'manager'),
        ),
      ),
    )
  return rows.map((r) => r.userId)
}

/**
 * Users in the org who hold a specific capability. Owners always count;
 * managers count by default for the role-default caps. Anyone with the cap
 * in their `extraCaps` jsonb array counts too. We resolve this in SQL for
 * a single round-trip — no per-row N+1.
 */
export async function userIdsWithCapability(
  orgId: number,
  capability: Capability,
): Promise<number[]> {
  // Capabilities that come "for free" with the manager role. Keep this in
  // sync with `lib/auth/capabilities.ts` — for now we duplicate the small
  // set rather than introduce a circular import. If you add a manager-default
  // cap there, add it here too.
  const MANAGER_DEFAULT: Capability[] = [
    'manage_members',
    'decide_leaves',
    'schedule_meetings',
    'export_data',
  ]

  const isManagerDefault = MANAGER_DEFAULT.includes(capability)

  const rows = await db
    .select({
      userId: schema.memberships.userId,
      role: schema.memberships.role,
      extraCaps: schema.memberships.extraCaps,
    })
    .from(schema.memberships)
    .where(
      and(
        eq(schema.memberships.orgId, orgId),
        isNull(schema.memberships.endedAt),
      ),
    )

  const ids = new Set<number>()
  for (const r of rows) {
    if (r.role === 'owner') ids.add(r.userId)
    else if (r.role === 'manager' && isManagerDefault) ids.add(r.userId)
    else if (Array.isArray(r.extraCaps) && r.extraCaps.includes(capability)) ids.add(r.userId)
  }
  return Array.from(ids)
}
