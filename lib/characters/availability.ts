import { and, eq, isNull, ne } from 'drizzle-orm'
import { db, schema } from '@/lib/db/client'

/**
 * Per-org character uniqueness.
 *
 * The previous design let two teammates pick the same hero, which made the
 * team page confusing ("who's the Iron Man again?"). The new roster is
 * smaller (12 characters) and per-org unique — if Priya picks The Oracle,
 * nobody else in her org can also be The Oracle.
 *
 * Returns the set of character keys ALREADY taken by active members in
 * the org, excluding the optional `excludeUserId` (so a user editing their
 * own profile doesn't see their current pick as "taken").
 */
export async function takenCharacterKeysForOrg(
  orgId: number,
  excludeUserId?: number,
): Promise<Set<string>> {
  const rows = await db
    .select({ userId: schema.users.id, characterKey: schema.users.characterKey })
    .from(schema.memberships)
    .innerJoin(schema.users, eq(schema.memberships.userId, schema.users.id))
    .where(
      and(
        eq(schema.memberships.orgId, orgId),
        isNull(schema.memberships.endedAt),
        excludeUserId ? ne(schema.users.id, excludeUserId) : undefined,
      ),
    )
  const taken = new Set<string>()
  for (const r of rows) {
    if (r.characterKey) taken.add(r.characterKey)
  }
  return taken
}

/**
 * Resolve the "primary" org for a user — the first non-ended membership we
 * find. The character uniqueness scope is defined per-org because a user
 * who's in two orgs may want different identities in each, but for the pick
 * page we only enforce uniqueness in the first org they joined.
 */
export async function primaryOrgIdFor(userId: number): Promise<number | null> {
  const m = await db.query.memberships.findFirst({
    where: and(eq(schema.memberships.userId, userId), isNull(schema.memberships.endedAt)),
  })
  return m?.orgId ?? null
}
