import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { and, eq, ne } from 'drizzle-orm'
import { db, schema } from '@/lib/db/client'
import { requireSession } from '@/lib/auth/guards'
import { exchangeInstallCode } from '@/lib/slack/client'
import { audit, requestMeta } from '@/lib/audit/log'

export const runtime = 'nodejs'

/**
 * Slack OAuth callback. Verifies CSRF state, exchanges the code for a bot
 * token, persists the install on the org, and redirects the user back to the
 * Integrations page with a success/error flag.
 */
export async function GET(req: Request) {
  const url = new URL(req.url)
  const code = url.searchParams.get('code')
  const state = url.searchParams.get('state')
  const error = url.searchParams.get('error')

  const jar = await cookies()
  const expectedState = jar.get('marina_slack_state')?.value
  jar.delete('marina_slack_state')

  // Resolve the orgId from the state (state = "<orgId>.<uuid>") so we can
  // redirect with the correct path on any failure.
  const orgId = Number(state?.split('.')[0] ?? '0')
  const failRedirect = (reason: string) =>
    NextResponse.redirect(
      new URL(`/org/${orgId}?slack_error=${encodeURIComponent(reason)}`, req.url),
    )

  if (error) return failRedirect(error)
  if (!code || !state || !expectedState || state !== expectedState) {
    return failRedirect('csrf_or_missing_code')
  }
  if (!Number.isInteger(orgId) || orgId <= 0) return failRedirect('invalid_state')

  try {
    await requireSession()
  } catch {
    return failRedirect('signed_out')
  }

  const redirectUri = new URL('/api/connect/slack/callback', req.url).toString()
  const exchange = await exchangeInstallCode(code, redirectUri)
  if (!exchange.ok) return failRedirect(exchange.error)

  const team = exchange.team
  const botToken = exchange.access_token
  const botUserId = exchange.bot_user_id
  // If Slack returned an incoming-webhook channel (the user picked one during
  // install), use it as the default broadcast channel. Otherwise we'll DM
  // people directly and the org can pick a channel later in settings.
  const defaultChannelId = exchange.incoming_webhook?.channel_id ?? null

  // Install-replace: a Slack workspace maps to exactly ONE org. Clear any OTHER
  // org previously bound to this workspace (e.g. a re-install that pointed it at
  // a different org) so the team_id resolves unambiguously — this is the root
  // cause of the "two orgs share one workspace → not linked" class of bug.
  await db
    .update(schema.orgs)
    .set({
      slackTeamId: null,
      slackTeamName: null,
      slackBotToken: null,
      slackBotUserId: null,
      slackDefaultChannelId: null,
      slackInstalledAt: null,
    })
    .where(and(eq(schema.orgs.slackTeamId, team.id), ne(schema.orgs.id, orgId)))

  await db
    .update(schema.orgs)
    .set({
      slackTeamId: team.id,
      slackTeamName: team.name,
      slackBotToken: botToken,
      slackBotUserId: botUserId,
      slackDefaultChannelId: defaultChannelId,
      slackInstalledAt: new Date(),
    })
    .where(eq(schema.orgs.id, orgId))

  audit({
    action: 'org.settings_changed',
    orgId,
    targetType: 'org',
    targetId: orgId,
    payload: { event: 'slack_installed', team: team.name },
    ...requestMeta(req),
  })

  return NextResponse.redirect(
    new URL(`/org/${orgId}?slack=connected`, req.url),
  )
}
