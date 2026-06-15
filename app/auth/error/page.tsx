import Link from 'next/link'

export const dynamic = 'force-dynamic'

const FRIENDLY: Record<string, { title: string; body: string; hint?: string }> = {
  Configuration: {
    title: 'Something went wrong on our end',
    body: "We couldn't complete the sign-in due to a temporary server problem. Please try again in a moment, or contact support if it persists.",
    // Internal fix hint is shown ONLY in non-production (see render) — end
    // users should never be told to run a migration command.
    hint: 'Run `pnpm db:push` in the marina/ folder, then try again.',
  },
  AccessDenied: {
    title: 'Access denied',
    body: "Your account isn't allowed to access this app.",
  },
  Verification: {
    title: 'Link expired',
    body: 'That sign-in link has expired or been used already. Request a fresh one.',
  },
  CredentialsSignin: {
    title: 'Sign-in failed',
    body: "We couldn't verify your sign-in. The link may have expired or already been used.",
    hint: 'Go back to the home page and request a fresh sign-in link.',
  },
  Default: {
    title: 'Sign-in failed',
    body: 'Something went wrong while signing you in. Please try again.',
  },
}

export default async function AuthErrorPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>
}) {
  const sp = await searchParams
  const errorKey = sp.error ?? 'Default'
  const info = FRIENDLY[errorKey] ?? FRIENDLY.Default
  // Only surface internal "how to fix" hints to developers, never to end users
  // in production (they leak the stack / can't run server commands anyway).
  const showHint = info.hint && (errorKey !== 'Configuration' || process.env.NODE_ENV !== 'production')

  return (
    <main className="min-h-screen flex items-center justify-center bg-slate-50 px-6">
      <div className="max-w-md w-full bg-white rounded-2xl shadow-lg border border-slate-200 p-8 text-center">
        <div className="text-[36px] mb-3">⚠️</div>
        <h1 className="text-[20px] font-semibold text-slate-900">{info.title}</h1>
        <p className="mt-2 text-[14px] text-slate-600 leading-relaxed">{info.body}</p>
        {showHint && (
          <div className="mt-4 rounded-xl bg-amber-50 border border-amber-200 px-4 py-3 text-left">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-amber-700 mb-1">
              How to fix
            </p>
            <p className="text-[13px] text-amber-900">{info.hint}</p>
          </div>
        )}
        <p className="mt-6 text-[11px] text-slate-400">Error code: {errorKey}</p>
        <Link
          href="/"
          className="mt-6 inline-flex w-full justify-center px-4 py-2.5 rounded-xl bg-slate-900 text-white hover:bg-slate-800 text-[14px] font-medium transition"
        >
          Back to home
        </Link>
      </div>
    </main>
  )
}
