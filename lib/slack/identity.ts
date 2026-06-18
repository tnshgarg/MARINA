import { and, eq, isNull, sql } from 'drizzle-orm'
import { db, schema } from '@/lib/db/client'
import { getSlackInstall, slackUserEmail } from '@/lib/slack/client'

/**
 * Reverse identity: a Slack (team_id, user_id) pair → the MARINA org +
 * membership + user it maps to. This is the seam every inbound Slack surface
 * (App Home, interactivity, events, assistant, slash commands) goes through.
 * An org is bound to a Slack workspace via `orgs.slackTeamId`; a person via
 * `memberships.slackUserId`.
 */
export type SlackActor = {
  org: typeof schema.orgs.$inferSelect
  membership: typeof schema.memberships.$inferSelect
  user: typeof schema.users.$inferSelect
}

export async function resolveOrgByTeam(
  teamId: string,
): Promise<typeof schema.orgs.$inferSelect | null> {
  if (!teamId) return null
  return (await db.query.orgs.findFirst({ where: eq(schema.orgs.slackTeamId, teamId) })) ?? null
}

/**
 * Resolve a Slack user → membership in an org, with **link-on-first-use**:
 *   1. Direct match on the cached `memberships.slackUserId`.
 *   2. On a miss, ask Slack for the caller's email (`users.info`) and match a
 *      member by email, then stamp `slackUserId` so it's cached next time.
 *
 * This is what makes `/marina` and the App Home "just work" the first time a
 * real member uses them — previously slackUserId was only ever resolved as a
 * side effect of a notification DM, so a member who'd never been DM'd read as
 * "not linked".
 */
export async function resolveMembershipBySlack(
  orgId: number,
  slackUserId: string,
): Promise<typeof schema.memberships.$inferSelect | null> {
  const direct = await db.query.memberships.findFirst({
    where: and(
      eq(schema.memberships.orgId, orgId),
      eq(schema.memberships.slackUserId, slackUserId),
      isNull(schema.memberships.endedAt),
    ),
  })
  if (direct) return direct

  // Link-on-first-use: Slack id → email → member.
  const install = await getSlackInstall(orgId)
  if (!install) return null
  const email = await slackUserEmail(install, slackUserId)
  if (!email) return null

  const rows = await db
    .select({ m: schema.memberships })
    .from(schema.memberships)
    .innerJoin(schema.users, eq(schema.memberships.userId, schema.users.id))
    .where(
      and(
        eq(schema.memberships.orgId, orgId),
        isNull(schema.memberships.endedAt),
        sql`lower(${schema.users.email}) = ${email.toLowerCase()}`,
      ),
    )
    .limit(1)
  if (rows.length === 0) return null

  const m = rows[0].m
  await db
    .update(schema.memberships)
    .set({ slackUserId, slackResolvedAt: new Date() })
    .where(eq(schema.memberships.id, m.id))
  return { ...m, slackUserId }
}

export async function resolveSlackActor(
  teamId: string,
  slackUserId: string,
): Promise<SlackActor | null> {
  const org = await resolveOrgByTeam(teamId)
  if (!org) return null
  const membership = await resolveMembershipBySlack(org.id, slackUserId)
  if (!membership) return null
  const user = await db.query.users.findFirst({ where: eq(schema.users.id, membership.userId) })
  if (!user) return null
  return { org, membership, user }
}
