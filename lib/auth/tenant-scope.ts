import { and, eq, gte, isNull, lte, or, sql } from 'drizzle-orm'
import { db, schema } from '@/lib/db/client'

/**
 * Drop-in clause for "this org's currently active members". Use anywhere
 * you query `memberships` directly so soft-deleted members don't appear.
 *
 *   .where(activeMembersOf(orgId))
 */
export function activeMembersOf(orgId: number) {
  return and(eq(schema.memberships.orgId, orgId), isNull(schema.memberships.endedAt))
}

/**
 * Tenant-isolation helper. When you query user-level data (github events,
 * narratives, etc.) for an org, you must filter to the time window during
 * which each user was an *active member* of that org.
 *
 * Without this, a user who's been in Org A and Org B will leak each side's
 * data to the other.
 *
 * Returns a Drizzle SQL fragment you can drop into a WHERE clause.
 *
 * Usage:
 *   const events = await db
 *     .select()
 *     .from(schema.githubEvents)
 *     .where(
 *       and(
 *         inArray(schema.githubEvents.userId, userIds),
 *         await orgScopedTimestamp(orgId, schema.githubEvents.userId, schema.githubEvents.occurredAt),
 *       ),
 *     )
 *
 * For single-user reads you can use {@link membershipWindow} to get a tuple
 * `[start, end]` and apply the bounds manually.
 */
export async function orgScopedTimestamp(
  orgId: number,
  // Drizzle's column refs are tricky to type without a generic; SQL passthrough.
  userIdColumn: { name: string; tableName?: string },
  timestampColumn: { name: string; tableName?: string },
) {
  void orgId
  void userIdColumn
  void timestampColumn
  // This helper exists for clarity but the actual scoping is per-query: see
  // `withMembershipWindow` below — Drizzle struggles with dynamic column refs
  // across mixed tables. Use that builder instead.
  throw new Error('Use withMembershipWindow per query — see comment above.')
}

/**
 * Look up the activeness window for a single user in a single org. Returns
 * null if the user has never been a member.
 *
 * - `start` = membership.createdAt
 * - `end`   = membership.endedAt ?? now (open-ended)
 *
 * For data freshly-joined members shouldn't see (e.g. activity prior to
 * joining), filter `occurredAt >= start`. For ended members, also
 * `occurredAt <= end`.
 */
export async function membershipWindow(
  orgId: number,
  userId: number,
): Promise<{ start: Date; end: Date | null } | null> {
  const row = await db.query.memberships.findFirst({
    where: and(
      eq(schema.memberships.orgId, orgId),
      eq(schema.memberships.userId, userId),
    ),
  })
  if (!row) return null
  return { start: row.createdAt, end: row.endedAt }
}

/**
 * Apply membership-window scoping to a per-user timestamped query. Given a
 * SQL column reference, returns a `SQL` you can AND into a WHERE.
 *
 * The SQL boils down to:
 *   EXISTS (
 *     SELECT 1 FROM memberships m
 *     WHERE m.user_id = <userColumn>
 *       AND m.org_id  = <orgId>
 *       AND <tsColumn> >= m.created_at
 *       AND (m.ended_at IS NULL OR <tsColumn> <= m.ended_at)
 *   )
 *
 * Pure SQL keeps it indexable against the existing `memberships_org_user_idx`.
 */
export function withMembershipWindow(
  orgId: number,
  userIdColumnSql: ReturnType<typeof sql.raw>,
  timestampColumnSql: ReturnType<typeof sql.raw>,
) {
  return sql`EXISTS (
    SELECT 1 FROM memberships m
    WHERE m.org_id = ${orgId}
      AND m.user_id = ${userIdColumnSql}
      AND ${timestampColumnSql} >= m.created_at
      AND (m.ended_at IS NULL OR ${timestampColumnSql} <= m.ended_at)
  )`
}

/* The composition helpers below are exported so call sites can do simple
 * single-user-window filters when they're not driving from memberships. */
export { and, eq, gte, isNull, lte, or }
