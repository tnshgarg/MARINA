import { and, eq, isNull } from 'drizzle-orm'
import { db, schema } from '@/lib/db/client'

/**
 * Reverse identity: a Slack (team_id, user_id) pair → the MARINA org +
 * membership + user it maps to. This is the seam every inbound Slack surface
 * (App Home, interactivity, events, assistant) goes through. An org is bound
 * to a Slack workspace via `orgs.slackTeamId`; a person via
 * `memberships.slackUserId` (resolved at install time from their email).
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

export async function resolveSlackActor(
  teamId: string,
  slackUserId: string,
): Promise<SlackActor | null> {
  const org = await resolveOrgByTeam(teamId)
  if (!org) return null
  const membership = await db.query.memberships.findFirst({
    where: and(
      eq(schema.memberships.orgId, org.id),
      eq(schema.memberships.slackUserId, slackUserId),
      isNull(schema.memberships.endedAt),
    ),
  })
  if (!membership) return null
  const user = await db.query.users.findFirst({ where: eq(schema.users.id, membership.userId) })
  if (!user) return null
  return { org, membership, user }
}
