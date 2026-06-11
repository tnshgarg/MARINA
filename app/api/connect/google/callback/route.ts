import { NextResponse } from 'next/server'
import { and, eq } from 'drizzle-orm'
import { db, schema } from '@/lib/db/client'
import { decodeState, exchangeCode } from '@/lib/google/oauth'
import { afterResponse } from '@/lib/after'

export const runtime = 'nodejs'

/**
 * Handle Google's OAuth callback. Validates the signed state, exchanges the
 * code for tokens, and persists them on the `accounts` table keyed to the
 * MARINA user. The user is redirected back to the page that initiated the
 * connect (typically /settings).
 */
export async function GET(req: Request) {
  const url = new URL(req.url)
  const code = url.searchParams.get('code')
  const stateRaw = url.searchParams.get('state')
  const error = url.searchParams.get('error')

  // User clicked Cancel on the consent screen, or Google rejected.
  if (error) {
    return NextResponse.redirect(new URL(`/settings?calendar_error=${encodeURIComponent(error)}`, req.url))
  }
  if (!code || !stateRaw) {
    return NextResponse.redirect(new URL('/settings?calendar_error=missing_code', req.url))
  }

  const state = decodeState(stateRaw)
  if (!state) {
    return NextResponse.redirect(new URL('/settings?calendar_error=invalid_state', req.url))
  }

  try {
    const tokens = await exchangeCode(code)

    // Resolve the Google account email so we can show it in settings + dedupe.
    let providerAccountId = `${state.userId}` // fallback if userinfo fails
    let email: string | null = null
    try {
      const userinfo = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
        headers: { Authorization: `Bearer ${tokens.access_token}` },
      }).then((r) => r.json() as Promise<{ sub?: string; email?: string }>)
      if (userinfo.sub) providerAccountId = userinfo.sub
      if (userinfo.email) email = userinfo.email
    } catch {
      // ignore — we'll still store tokens
    }

    // Upsert into accounts. NextAuth Drizzle adapter's "account" table is
    // what holds OAuth tokens; we reuse that table to store this 2nd provider.
    const existing = await db.query.accounts.findFirst({
      where: and(
        eq(schema.accounts.provider, 'google'),
        eq(schema.accounts.providerAccountId, providerAccountId),
      ),
    })

    const expiresAt = Math.floor(Date.now() / 1000) + (tokens.expires_in ?? 3600)

    if (existing) {
      await db
        .update(schema.accounts)
        .set({
          access_token: tokens.access_token,
          // Google only returns refresh_token on first consent — preserve if missing.
          refresh_token: tokens.refresh_token ?? existing.refresh_token,
          expires_at: expiresAt,
          token_type: tokens.token_type ?? 'Bearer',
          scope: tokens.scope ?? null,
          id_token: tokens.id_token ?? null,
        })
        .where(
          and(
            eq(schema.accounts.provider, 'google'),
            eq(schema.accounts.providerAccountId, providerAccountId),
          ),
        )
    } else {
      await db.insert(schema.accounts).values({
        userId: state.userId,
        type: 'oauth',
        provider: 'google',
        providerAccountId,
        access_token: tokens.access_token,
        refresh_token: tokens.refresh_token ?? null,
        expires_at: expiresAt,
        token_type: tokens.token_type ?? 'Bearer',
        scope: tokens.scope ?? null,
        id_token: tokens.id_token ?? null,
      })
    }

    // Stash the connected email on users so we can show it without re-querying Google.
    if (email) {
      // Don't overwrite the primary email used for sign-in; only fill if empty.
      try {
        const u = await db.query.users.findFirst({ where: eq(schema.users.id, state.userId) })
        if (u && !u.email) {
          await db.update(schema.users).set({ email }).where(eq(schema.users.id, state.userId))
        }
      } catch {
        // ignore
      }
    }

    // Kick off an initial sync via `after()` so it survives the redirect.
    afterResponse(async () => {
      const { syncCalendar } = await import('@/lib/google/calendar')
      await syncCalendar(state.userId)
    }, 'google initial sync')

    const returnTo = state.returnTo.startsWith('/') ? state.returnTo : '/settings'
    return NextResponse.redirect(new URL(`${returnTo}?calendar=connected`, req.url))
  } catch (err) {
    console.error('google/callback failed', err)
    return NextResponse.redirect(
      new URL(`/settings?calendar_error=${encodeURIComponent(String(err).slice(0, 100))}`, req.url),
    )
  }
}
