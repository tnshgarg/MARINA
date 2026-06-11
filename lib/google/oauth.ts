import { randomBytes, createHash } from 'crypto'

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

export function googleConfig() {
  const clientId = process.env.GOOGLE_CLIENT_ID
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET
  if (!clientId || !clientSecret) {
    throw new Error('Google OAuth not configured — set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET.')
  }
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
  const redirectUri = `${baseUrl.replace(/\/+$/, '')}/api/connect/google/callback`
  return { clientId, clientSecret, redirectUri }
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
  if (sign(b64) !== sig) return null
  try {
    return JSON.parse(Buffer.from(b64, 'base64url').toString('utf8')) as GoogleState
  } catch {
    return null
  }
}

function sign(s: string): string {
  const secret = process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET || 'dev-secret'
  return createHash('sha256').update(s + secret).digest('hex').slice(0, 16)
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

/** Exchange an auth code for tokens. */
export async function exchangeCode(code: string): Promise<GoogleTokenResponse> {
  const cfg = googleConfig()
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
