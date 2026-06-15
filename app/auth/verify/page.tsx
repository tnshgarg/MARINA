import { redirect } from 'next/navigation'
import { signIn } from '@/auth'

export const dynamic = 'force-dynamic'

/**
 * Magic-link landing page.
 *
 * IMPORTANT: the emailed link is a plain GET URL, and email security scanners
 * (Gmail, Outlook "Safe Links", corporate proxies) plus browser link-prefetch
 * will fetch that URL *before the human ever clicks*. If we consumed the
 * single-use token on GET, those bots would burn it and the real click would
 * say "link expired / invalid".
 *
 * So GET does nothing but render a "Finish signing in" button. The token is
 * only consumed when the user submits the form (a POST / server action), which
 * scanners and prefetch never trigger. This is the same pattern Slack / Notion /
 * Linear use for their magic links.
 */
export default async function VerifyPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string; redirect?: string }>
}) {
  const sp = await searchParams
  const token = sp.token?.trim()
  // Open-redirect guard: same-site absolute path only (reject `//host`, `/\host`).
  const rt = sp.redirect ?? ''
  const redirectTo =
    rt.startsWith('/') && !rt.startsWith('//') && !rt.startsWith('/\\') ? rt : '/'

  if (!token) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-slate-50 px-6">
        <div className="max-w-md w-full app-card app-card-lg text-center">
          <p className="text-[28px]">🔗</p>
          <h1 className="app-h2 mt-2">Missing token</h1>
          <p className="app-sub mt-2">The link looks incomplete. Request a fresh one from the home page.</p>
          <a href="/" className="btn-primary mt-4">Back to home</a>
        </div>
      </main>
    )
  }

  // Server action — runs ONLY on the explicit button click (POST). This is
  // where the single-use token is actually consumed.
  async function finish() {
    'use server'
    try {
      await signIn('magic', { token, redirectTo })
    } catch (err) {
      // NEXT_REDIRECT is thrown by NextAuth signIn when redirect succeeds —
      // re-throw to let Next handle it.
      if (
        err && typeof err === 'object' && 'digest' in err &&
        typeof (err as { digest?: unknown }).digest === 'string' &&
        ((err as { digest: string }).digest).includes('NEXT_REDIRECT')
      ) {
        throw err
      }
      console.error('[auth/verify] failed', err)
      // Keep invite context so the user can request a fresh link in place.
      if (redirectTo.startsWith('/invite/')) {
        redirect(`${redirectTo}?auth_error=invalid_or_expired_link`)
      }
      redirect('/?auth_error=invalid_or_expired_link')
    }
    redirect(redirectTo)
  }

  return (
    <main className="min-h-screen flex items-center justify-center bg-slate-50 px-6">
      <div className="max-w-md w-full app-card app-card-lg text-center">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logo.svg" width={40} height={40} alt="" aria-hidden className="mx-auto mb-3" />
        <h1 className="app-h2">You&apos;re almost in</h1>
        <p className="app-sub mt-2">
          Click below to finish signing in to MARINA on this device.
        </p>
        <form action={finish} className="mt-5">
          <button type="submit" className="btn-primary w-full">
            Finish signing in →
          </button>
        </form>
        <p className="mt-3 text-[12px] text-slate-400">
          This link is single-use and expires after an hour.
        </p>
      </div>
    </main>
  )
}
