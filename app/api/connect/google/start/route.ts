import { NextResponse } from 'next/server'
import { HttpError, requireSession } from '@/lib/auth/guards'
import { GOOGLE_SCOPES, encodeState, googleConfig, makeNonce } from '@/lib/google/oauth'

export const runtime = 'nodejs'

/**
 * Kick off the Google OAuth dance. The user is already signed in via
 * GitHub/email; this endpoint just builds the Google consent URL with
 * a signed state cookie and 302s the browser.
 */
export async function GET(req: Request) {
  try {
    const session = await requireSession()
    const url = new URL(req.url)
    const returnTo = url.searchParams.get('return_to') ?? '/settings'

    let cfg
    try {
      cfg = googleConfig(req)
    } catch (e) {
      return NextResponse.json(
        { error: 'Google OAuth not configured', detail: (e as Error).message },
        { status: 503 },
      )
    }

    const state = encodeState({
      userId: session.appUserId,
      returnTo,
      nonce: makeNonce(),
    })

    const params = new URLSearchParams({
      client_id: cfg.clientId,
      redirect_uri: cfg.redirectUri,
      response_type: 'code',
      scope: GOOGLE_SCOPES,
      // Force a refresh-token issuance every time
      access_type: 'offline',
      prompt: 'consent',
      state,
      include_granted_scopes: 'true',
    })

    return NextResponse.redirect(
      `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`,
    )
  } catch (err) {
    if (err instanceof HttpError) {
      return NextResponse.redirect(new URL('/', req.url))
    }
    console.error('google/start failed', err)
    return NextResponse.json({ error: 'internal' }, { status: 500 })
  }
}
