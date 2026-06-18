/**
 * Slack Web API client. Thin and purpose-built — we only need:
 *
 *   - OAuth code exchange (oauth.v2.access)
 *   - DM open + post (conversations.open + chat.postMessage)
 *   - Channel post (chat.postMessage)
 *   - Email → Slack user-id lookup (users.lookupByEmail)
 *
 * Every call returns a discriminated `{ ok: true, ...data } | { ok: false, error }`
 * so the notify dispatcher can degrade gracefully when Slack is misconfigured
 * or a single API call fails — we never want a Slack hiccup to break a
 * leave-request flow.
 */
import { eq } from 'drizzle-orm'
import { db, schema } from '@/lib/db/client'

export type SlackInstall = {
  teamId: string
  teamName: string
  botToken: string
  botUserId: string
  defaultChannelId: string | null
}

export type SlackResult<T> = ({ ok: true } & T) | { ok: false; error: string }

const SLACK_BASE = 'https://slack.com/api'

async function callSlack<T = Record<string, unknown>>(
  method: string,
  token: string,
  body: Record<string, unknown> | URLSearchParams,
): Promise<SlackResult<T>> {
  const isForm = body instanceof URLSearchParams
  try {
    const res = await fetch(`${SLACK_BASE}/${method}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': isForm
          ? 'application/x-www-form-urlencoded'
          : 'application/json; charset=utf-8',
      },
      body: isForm ? body.toString() : JSON.stringify(body),
    })
    const json = (await res.json()) as { ok?: boolean; error?: string } & T
    if (!json.ok) return { ok: false, error: json.error ?? 'unknown_error' }
    return { ok: true, ...(json as T) }
  } catch (e) {
    return { ok: false, error: (e as Error).message }
  }
}

/**
 * Exchange the OAuth code from a Slack install redirect for a bot token.
 * Uses the CLIENT_ID/SECRET pair to authenticate the exchange itself.
 */
export async function exchangeInstallCode(code: string, redirectUri: string): Promise<
  SlackResult<{
    team: { id: string; name: string }
    bot_user_id: string
    access_token: string
    authed_user: { id: string }
    incoming_webhook?: { channel_id: string }
  }>
> {
  const clientId = process.env.SLACK_CLIENT_ID
  const clientSecret = process.env.SLACK_CLIENT_SECRET
  if (!clientId || !clientSecret) {
    return { ok: false, error: 'SLACK_CLIENT_ID / SLACK_CLIENT_SECRET not set' }
  }
  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    code,
    redirect_uri: redirectUri,
  })
  // `oauth.v2.access` doesn't take a bearer token; pass empty string and
  // let the URL params authenticate.
  return callSlack('oauth.v2.access', '', body)
}

/**
 * Load the bot install record for an org. Returns null when the org never
 * installed (or revoked) the Slack app.
 */
export async function getSlackInstall(orgId: number): Promise<SlackInstall | null> {
  const org = await db.query.orgs.findFirst({ where: eq(schema.orgs.id, orgId) })
  if (!org?.slackBotToken || !org.slackTeamId || !org.slackBotUserId) return null
  return {
    teamId: org.slackTeamId,
    teamName: org.slackTeamName ?? 'Slack',
    botToken: org.slackBotToken,
    botUserId: org.slackBotUserId,
    defaultChannelId: org.slackDefaultChannelId ?? null,
  }
}

/** Look up a user's Slack ID by email. Caches the result on the membership row. */
export async function resolveSlackUserId(
  install: SlackInstall,
  email: string,
): Promise<string | null> {
  const res = await callSlack<{ user: { id: string } }>(
    'users.lookupByEmail',
    install.botToken,
    new URLSearchParams({ email }),
  )
  if (!res.ok) {
    // `users_not_found` is normal (employee not in this Slack workspace).
    if (res.error !== 'users_not_found') {
      console.warn('[slack] lookupByEmail failed', email, res.error)
    }
    return null
  }
  return res.user.id
}

/**
 * Send a direct message to a Slack user. We open the IM channel first (idempotent
 * per Slack — repeated `conversations.open` returns the same channel) and then
 * post the message into it. Pass `text` for the fallback (notifications) and
 * `blocks` for the rich layout.
 */
export async function sendSlackDm(
  install: SlackInstall,
  slackUserId: string,
  payload: { text: string; blocks?: unknown[] },
): Promise<SlackResult<{ ts: string }>> {
  const open = await callSlack<{ channel: { id: string } }>(
    'conversations.open',
    install.botToken,
    { users: slackUserId },
  )
  if (!open.ok) return { ok: false, error: `open: ${open.error}` }
  return callSlack('chat.postMessage', install.botToken, {
    channel: open.channel.id,
    ...payload,
  })
}

/** Post into a Slack channel (default channel if none specified). */
export async function sendSlackChannel(
  install: SlackInstall,
  payload: { text: string; blocks?: unknown[]; channel?: string },
): Promise<SlackResult<{ ts: string }>> {
  const channel = payload.channel ?? install.defaultChannelId
  if (!channel) return { ok: false, error: 'no channel configured' }
  return callSlack('chat.postMessage', install.botToken, {
    channel,
    text: payload.text,
    blocks: payload.blocks,
  })
}

/**
 * Publish the App Home tab for a user. The view is a `{ type: 'home', blocks }`
 * object — Slack replaces the user's Home tab with it. Idempotent; call it on
 * every `app_home_opened` and after any action that changes the user's state.
 */
export async function publishHomeView(
  install: SlackInstall,
  slackUserId: string,
  view: unknown,
): Promise<SlackResult<Record<string, unknown>>> {
  return callSlack('views.publish', install.botToken, { user_id: slackUserId, view })
}

/**
 * Open a modal in response to an interaction. `triggerId` is single-use and
 * expires ~3s after the user's click, so call this promptly (inline, not in
 * afterResponse).
 */
export async function openModal(
  install: SlackInstall,
  triggerId: string,
  view: unknown,
): Promise<SlackResult<{ view: { id: string } }>> {
  return callSlack('views.open', install.botToken, { trigger_id: triggerId, view })
}

/** Post an ephemeral message visible only to one user in a channel. */
export async function postEphemeral(
  install: SlackInstall,
  channel: string,
  slackUserId: string,
  payload: { text: string; blocks?: unknown[] },
): Promise<SlackResult<{ message_ts: string }>> {
  return callSlack('chat.postEphemeral', install.botToken, {
    channel,
    user: slackUserId,
    ...payload,
  })
}

/**
 * Ensure a membership has its `slackUserId` resolved. Looks up by user.email
 * on cache-miss. Caches the result (positive or null) and returns the id.
 * Cheap to call repeatedly — the lookup is skipped if `slackResolvedAt` is
 * within the last 7 days.
 */
export async function ensureMembershipSlackId(
  install: SlackInstall,
  membershipId: number,
): Promise<string | null> {
  const m = await db.query.memberships.findFirst({
    where: eq(schema.memberships.id, membershipId),
  })
  if (!m) return null
  const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000
  if (m.slackUserId && m.slackResolvedAt && m.slackResolvedAt.getTime() > weekAgo) {
    return m.slackUserId
  }
  const user = await db.query.users.findFirst({ where: eq(schema.users.id, m.userId) })
  if (!user?.email) return null
  const slackId = await resolveSlackUserId(install, user.email)
  await db
    .update(schema.memberships)
    .set({ slackUserId: slackId, slackResolvedAt: new Date() })
    .where(eq(schema.memberships.id, membershipId))
  return slackId
}

/** Same as above, but takes user id directly (more convenient for notify). */
export async function ensureUserSlackIdInOrg(
  install: SlackInstall,
  orgId: number,
  userId: number,
): Promise<string | null> {
  const m = await db.query.memberships.findFirst({
    where: (t, { and, eq, isNull }) => and(eq(t.orgId, orgId), eq(t.userId, userId), isNull(t.endedAt)),
  })
  if (!m) return null
  return ensureMembershipSlackId(install, m.id)
}
