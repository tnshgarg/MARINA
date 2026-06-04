import { redirect } from 'next/navigation'
import { auth, signIn } from '@/auth'

export default async function Home() {
  const session = await auth()
  if (session?.appUserId) redirect('/dashboard')

  return (
    <main className="min-h-screen bg-zinc-50 flex items-center justify-center px-6 dark:bg-black">
      <div className="max-w-xl w-full">
        <div className="mb-10">
          <p className="text-xs uppercase tracking-widest text-zinc-500">Project MARINA</p>
          <h1 className="mt-2 text-4xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
            AI Workforce Intelligence
          </h1>
          <p className="mt-3 text-base leading-7 text-zinc-600 dark:text-zinc-400">
            Track meaningful work output instead of mouse jiggles. Connect GitHub, get an AI-written
            narrative of your week, see whether the data signals <em>High</em>, <em>Steady</em>,{' '}
            <em>Low</em>, or <em>Blocked</em>.
          </p>
        </div>
        <form
          action={async () => {
            'use server'
            await signIn('github', { redirectTo: '/dashboard' })
          }}
        >
          <button
            type="submit"
            className="inline-flex items-center gap-2 rounded-md bg-zinc-900 px-4 py-2.5 text-sm font-medium text-white shadow-sm hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-white"
          >
            <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden>
              <path d="M12 .5C5.65.5.5 5.65.5 12c0 5.08 3.29 9.39 7.86 10.91.58.1.79-.25.79-.56v-2.1c-3.2.7-3.88-1.36-3.88-1.36-.52-1.31-1.28-1.66-1.28-1.66-1.05-.72.08-.71.08-.71 1.16.08 1.77 1.19 1.77 1.19 1.03 1.77 2.7 1.26 3.36.96.1-.75.4-1.26.73-1.55-2.55-.29-5.23-1.28-5.23-5.7 0-1.26.45-2.29 1.19-3.1-.12-.29-.52-1.46.11-3.04 0 0 .97-.31 3.18 1.18A11 11 0 0 1 12 6.8c.98.01 1.97.13 2.89.39 2.2-1.49 3.17-1.18 3.17-1.18.64 1.58.24 2.75.12 3.04.74.81 1.19 1.84 1.19 3.1 0 4.43-2.69 5.41-5.25 5.69.41.36.78 1.07.78 2.15v3.19c0 .31.21.67.8.56C20.21 21.39 23.5 17.08 23.5 12 23.5 5.65 18.35.5 12 .5Z" />
            </svg>
            Sign in with GitHub
          </button>
        </form>
        <p className="mt-4 text-xs text-zinc-500">
          v1 requests <code className="px-1 py-0.5 rounded bg-zinc-100 dark:bg-zinc-900">read:user user:email repo</code> so we can pull your commits, PRs, and reviews.
        </p>
      </div>
    </main>
  )
}
