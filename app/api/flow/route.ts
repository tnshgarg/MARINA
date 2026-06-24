import { NextResponse } from 'next/server'

export const runtime = 'nodejs'

/**
 * Records which flow a visitor chose on the landing page BEFORE they sign in, so
 * after auth we route them to the right place:
 *
 *  - `solo`  → an individual employee using Marina for themselves. After sign-in
 *    they land on their personal /dashboard (no org, no "form a squad" step).
 *  - anything else clears the marker → the default manager/HR flow, which still
 *    sends a no-org user to /onboarding to create a team. UNCHANGED.
 *
 * Method-agnostic: the cookie survives the OAuth/magic-link round-trip, so it
 * works whether the employee signs up with GitHub, Google or email.
 */
export async function GET(req: Request) {
  const url = new URL(req.url)
  const to = url.searchParams.get('to')
  const next = url.searchParams.get('next') || (to === 'solo' ? '/#get-started' : '/')
  const res = NextResponse.redirect(new URL(next, req.url))
  if (to === 'solo') {
    res.cookies.set('marina_flow', 'solo', {
      maxAge: 60 * 60 * 24 * 365,
      httpOnly: true,
      sameSite: 'lax',
      path: '/',
    })
  } else {
    res.cookies.delete('marina_flow')
  }
  return res
}
