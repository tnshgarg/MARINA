import { redirect } from 'next/navigation'
import { signIn } from '@/auth'

export const dynamic = 'force-dynamic'

export default async function VerifyPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string; redirect?: string }>
}) {
  const sp = await searchParams
  const token = sp.token?.trim()
  const redirectTo = sp.redirect?.startsWith('/') ? sp.redirect : '/'

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

  // Sign in via the magic provider. NextAuth will set the session cookie
  // server-side and redirect onward.
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
    redirect('/?auth_error=invalid_or_expired_link')
  }

  // Fallback in case signIn didn't redirect (unlikely)
  redirect(redirectTo)
}
