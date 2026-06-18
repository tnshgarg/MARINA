import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { HttpError, requireCapability } from '@/lib/auth/guards'

export const runtime = 'nodejs'

/**
 * Kick off the Slack workspace install. Owner / manage_integrations only.
 *
 * Why this endpoint over a static link: we need to (a) ensure the user is
 * authenticated, (b) bind a CSRF state token to their session so the
 * callback knows which org to attach the install to, and (c) hard-fail
 * with a clear error when `SLACK_CLIENT_ID` isn't configured.
 *
 * Required scopes:
 *   - bot: chat:write, chat:write.public, commands, users:read,
 *          users:read.email, im:write, channels:read, groups:read
 *   - user: identity.basic (so we know who triggered it)
 *
 * The redirect URI must match what's registered in the Slack app config.
 */
export async function GET(req: Request) {
  const url = new URL(req.url)
  const orgIdRaw = url.searchParams.get('orgId')
  const orgId = Number(orgIdRaw)
  if (!Number.isInteger(orgId)) {
    return NextResponse.json({ error: 'missing orgId' }, { status: 400 })
  }

  try {
    await requireCapability(orgId, 'manage_integrations')
  } catch (e) {
    if (e instanceof HttpError) {
      return NextResponse.json({ error: e.message }, { status: e.status })
    }
    throw e
  }

  const clientId = process.env.SLACK_CLIENT_ID
  if (!clientId) {
    return NextResponse.json(
      { error: 'Slack app not configured. Set SLACK_CLIENT_ID and SLACK_CLIENT_SECRET.' },
      { status: 503 },
    )
  }

  // CSRF state — random short string we'll verify on callback. Cookie is
  // httpOnly + secure so the page itself can't read or forge it.
  const state = `${orgId}.${crypto.randomUUID()}`
  const jar = await cookies()
  jar.set('marina_slack_state', state, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: 600,
    path: '/',
  })

  const redirectUri = `${absoluteOrigin(req)}/api/connect/slack/callback`
  const botScopes = [
    'chat:write',
    'chat:write.public',
    'commands',
    'users:read',
    'users:read.email',
    'im:write',
    'im:history',
    'app_mentions:read',
    'channels:read',
    'groups:read',
  ].join(',')

  const params = new URLSearchParams({
    client_id: clientId,
    scope: botScopes,
    user_scope: '',
    redirect_uri: redirectUri,
    state,
  })

  return NextResponse.redirect(`https://slack.com/oauth/v2/authorize?${params.toString()}`)
}

function absoluteOrigin(req: Request): string {
  // Trust forwarded headers in production (behind Vercel) then fall back to
  // the request's own origin.
  const hdr = (name: string) => new Headers(req.headers).get(name)
  const proto = hdr('x-forwarded-proto') ?? new URL(req.url).protocol.replace(':', '')
  const host = hdr('x-forwarded-host') ?? hdr('host') ?? new URL(req.url).host
  return `${proto}://${host}`
}
