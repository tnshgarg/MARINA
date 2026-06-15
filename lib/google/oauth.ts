import { randomBytes, createHmac, timingSafeEqual } from 'crypto'

/**
 * Standalone Google OAuth helper for the optional Calendar integration.
 * The user is already signed into MARINA (via GitHub/email magic link) when
 * they connect Calendar; this flow just gets a long-lived refresh token and
 * stores it on the existing accounts row.
 */

export const GOOGLE_SCOPES = [
  'https://www.googleapis.com/auth/calendar.readonly',
  'https://www.googleapis.com/auth/calendar.events.readonly',
  'openid',
  'email',
  'profile',
].join(' ')

/**
 * Build the OAuth config + redirect URI.
 *
 * We MUST use the same redirect_uri on both the /start (authorize) and
 * /callback (token exchange) ends, or Google returns `redirect_uri_mismatch`.
 *
 * Order of resolution (highest priority first):
 *   1. Origin derived from the live request headers — this is the source of
 *      truth in production, where `x-forwarded-proto` + `x-forwarded-host`
 *      reflect what the browser actually saw (e.g. `https://marina.team`).
 *   2. `NEXT_PUBLIC_APP_URL` — fallback for background jobs that don't have a
 *      request, e.g. token refresh from a cron.
 *   3. `http://localhost:3000` — last-resort local dev only.
 *
 * Pass the inbound `Request` to `googleConfig(req)` from any route handler
 * that needs to redirect the user.
 */
export function googleConfig(req?: Request) {
  const clientId = process.env.GOOGLE_CLIENT_ID
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET
  if (!clientId || !clientSecret) {
    throw new Error('Google OAuth not configured — set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET.')
  }
  const baseUrl = (req && originFromRequest(req)) || process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
  const redirectUri = `${baseUrl.replace(/\/+$/, '')}/api/connect/google/callback`
  return { clientId, clientSecret, redirectUri }
}

function originFromRequest(req: Request): string | null {
  try {
    const h = new Headers(req.headers)
    const proto = h.get('x-forwarded-proto') ?? new URL(req.url).protocol.replace(':', '')
    const host = h.get('x-forwarded-host') ?? h.get('host') ?? new URL(req.url).host
    if (!host) return null
    return `${proto}://${host}`
  } catch {
    return null
  }
}

export type GoogleState = {
  userId: number
  returnTo: string
  nonce: string
}

/** Pack the state into a single signed token. We sign with the cron secret. */
export function encodeState(state: GoogleState): string {
  const json = JSON.stringify(state)
  const b64 = Buffer.from(json).toString('base64url')
  const sig = sign(b64)
  return `${b64}.${sig}`
}

export function decodeState(raw: string): GoogleState | null {
  const [b64, sig] = raw.split('.')
  if (!b64 || !sig) return null
  const expected = sign(b64)
  // Constant-time comparison — avoid leaking the signature via timing.
  const a = Buffer.from(sig)
  const b = Buffer.from(expected)
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null
  try {
    return JSON.parse(Buffer.from(b64, 'base64url').toString('utf8')) as GoogleState
  } catch {
    return null
  }
}

function stateSecret(): string {
  const secret = process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET
  if (!secret) {
    // Fail CLOSED — never fall back to a public constant. A predictable secret
    // would let anyone forge a valid OAuth `state` for any userId (CSRF /
    // account-link hijack).
    throw new Error('AUTH_SECRET (or NEXTAUTH_SECRET) must be set to sign OAuth state.')
  }
  return secret
}

function sign(s: string): string {
  // Full-length HMAC-SHA256 (not a truncated plain hash).
  return createHmac('sha256', stateSecret()).update(s).digest('hex')
}

export function makeNonce(): string {
  return randomBytes(12).toString('base64url')
}

export type GoogleTokenResponse = {
  access_token: string
  refresh_token?: string
  expires_in: number
  token_type: string
  scope: string
  id_token?: string
}

/**
 * Exchange an auth code for tokens. Pass the inbound `Request` so the
 * redirect_uri sent here matches the one used at /start (Google verifies
 * they're identical). Background callers without a request can omit it.
 */
export async function exchangeCode(code: string, req?: Request): Promise<GoogleTokenResponse> {
  const cfg = googleConfig(req)
  const params = new URLSearchParams({
    code,
    client_id: cfg.clientId,
    client_secret: cfg.clientSecret,
    redirect_uri: cfg.redirectUri,
    grant_type: 'authorization_code',
  })
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString(),
  })
  const text = await res.text()
  if (!res.ok) throw new Error(`google/token ${res.status}: ${text.slice(0, 200)}`)
  return JSON.parse(text) as GoogleTokenResponse
}

/** Refresh an access token using a stored refresh token. */
export async function refreshAccessToken(refreshToken: string): Promise<GoogleTokenResponse> {
  const cfg = googleConfig()
  const params = new URLSearchParams({
    refresh_token: refreshToken,
    client_id: cfg.clientId,
    client_secret: cfg.clientSecret,
    grant_type: 'refresh_token',
  })
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString(),
  })
  const text = await res.text()
  if (!res.ok) throw new Error(`google/refresh ${res.status}: ${text.slice(0, 200)}`)
  return JSON.parse(text) as GoogleTokenResponse
}

/**
 * Revoke a token at Google. Returns `true` if Google confirmed revocation
 * (status 200), `false` if the revocation failed for any reason. Callers
 * deciding whether to honour a user's "Disconnect" request should treat
 * `false` as "still connected upstream" and surface that.
 */
export async function revokeToken(token: string): Promise<boolean> {
  try {
    const res = await fetch(
      `https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(token)}`,
      { method: 'POST' },
    )
    return res.ok
  } catch (err) {
    console.error('[google] revokeToken failed', err)
    return false
  }
}
