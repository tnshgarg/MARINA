'use client'

import { useState } from 'react'
import { CharacterAvatar } from '@/components/character-avatar'

type Hero = { key: string; name: string; color: string }

export default function LandingClient({
  authError,
  githubSignIn,
  characters,
}: {
  authError: string | null
  githubSignIn: () => Promise<void>
  characters: Hero[]
}) {
  const [email, setEmail] = useState('')
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<{ dispatched: boolean; devLink?: string; notes?: string[] } | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function startMagic(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    setResult(null)
    try {
      const res = await fetch('/api/auth/magic/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, redirectTo: '/' }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data?.error ?? 'failed')
      setResult({
        dispatched: !!data.dispatched,
        devLink: data.devLink,
        notes: Array.isArray(data.notes) ? data.notes : [],
      })
    } catch (e) {
      setError(String(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="relative max-w-6xl mx-auto px-6 pt-16 pb-24">
      <div className="text-center">
        {/* Eyebrow / badge */}
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-50 border border-indigo-100 text-[12px] font-medium text-indigo-700">
          <span className="w-1.5 h-1.5 rounded-full bg-indigo-500 animate-pulse" />
          New · AI story narratives are live
        </div>

        <h1 className="mt-6 text-[clamp(36px,6vw,68px)] leading-[1.05] font-semibold tracking-tight text-slate-900 max-w-4xl mx-auto">
          Run a team that{' '}
          <span className="relative inline-block">
            <span className="relative z-10 bg-clip-text text-transparent bg-gradient-to-r from-indigo-600 via-violet-600 to-pink-600">
              actually ships.
            </span>
            <span className="absolute left-0 right-0 bottom-1 h-3 bg-yellow-200/60 -z-0 -skew-y-1" />
          </span>
        </h1>

        <p className="mt-6 text-[18px] leading-relaxed text-slate-600 max-w-2xl mx-auto">
          MARINA is the AI Chief of Staff for engineering and product teams in India.
          Punch in, ship work, punch out — and let an AI tell the honest story of the day to your
          manager. No surveillance theatre. No spying. Just intelligence.
        </p>

        {/* Auth dual */}
        <div className="mt-9 max-w-md mx-auto">
          {result ? (
            <SuccessCard result={result} email={email} />
          ) : (
            <>
              <form onSubmit={startMagic} className="flex gap-2 bg-white rounded-2xl p-1.5 border border-slate-200 shadow-lg">
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@yourcompany.com"
                  className="flex-1 px-3 py-2.5 text-[14px] outline-none rounded-xl"
                  disabled={busy}
                />
                <button
                  type="submit"
                  disabled={busy}
                  className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-slate-900 text-white hover:bg-slate-800 text-[13px] font-medium disabled:opacity-60 transition"
                >
                  {busy ? 'Sending…' : 'Send magic link →'}
                </button>
              </form>
              <div className="flex items-center gap-3 my-4">
                <span className="flex-1 h-px bg-slate-200" />
                <span className="text-[10px] uppercase tracking-widest text-slate-400">or</span>
                <span className="flex-1 h-px bg-slate-200" />
              </div>
              <form action={githubSignIn}>
                <button
                  type="submit"
                  className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border border-slate-200 hover:border-slate-300 hover:bg-slate-50 text-slate-800 text-[13px] font-medium transition"
                >
                  <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" aria-hidden>
                    <path d="M12 .5C5.65.5.5 5.65.5 12c0 5.08 3.29 9.39 7.86 10.91.58.1.79-.25.79-.56v-2.1c-3.2.7-3.88-1.36-3.88-1.36-.52-1.31-1.28-1.66-1.28-1.66-1.05-.72.08-.71.08-.71 1.16.08 1.77 1.19 1.77 1.19 1.03 1.77 2.7 1.26 3.36.96.1-.75.4-1.26.73-1.55-2.55-.29-5.23-1.28-5.23-5.7 0-1.26.45-2.29 1.19-3.1-.12-.29-.52-1.46.11-3.04 0 0 .97-.31 3.18 1.18A11 11 0 0 1 12 6.8c.98.01 1.97.13 2.89.39 2.2-1.49 3.17-1.18 3.17-1.18.64 1.58.24 2.75.12 3.04.74.81 1.19 1.84 1.19 3.1 0 4.43-2.69 5.41-5.25 5.69.41.36.78 1.07.78 2.15v3.19c0 .31.21.67.8.56C20.21 21.39 23.5 17.08 23.5 12 23.5 5.65 18.35.5 12 .5Z" />
                  </svg>
                  Continue with GitHub
                </button>
              </form>
              <p className="mt-3 text-[11px] text-slate-500">
                Free for the first 5 operators forever · No credit card needed
              </p>
              {process.env.NODE_ENV !== 'production' && (
                <a
                  href="/dev/login"
                  className="mt-4 inline-block text-[11px] text-rose-600 hover:text-rose-700 hover:underline"
                >
                  🛠 Dev login (instant sign-in as any seeded user)
                </a>
              )}
            </>
          )}
          {(error || authError) && (
            <p className="mt-3 text-[12px] text-rose-600">
              {error ?? (authError === 'invalid_or_expired_link' ? 'That link expired or was already used. Request a fresh one.' : 'Auth failed.')}
            </p>
          )}
        </div>

        {/* Hero gallery */}
        <div className="mt-12 flex items-center justify-center gap-2 flex-wrap">
          {characters.map((c) => (
            <div key={c.key} className="group" title={c.name}>
              <CharacterAvatar characterKey={c.key} size={44} />
            </div>
          ))}
        </div>
        <p className="mt-3 text-[12px] text-slate-500">
          10 pixel-art heroes. Every operator picks one. (Or use a real photo — your call.)
        </p>
      </div>
    </section>
  )
}

function SuccessCard({
  result,
  email,
}: {
  result: { dispatched: boolean; devLink?: string; notes?: string[] }
  email: string
}) {
  const hasNotes = (result.notes?.length ?? 0) > 0
  const dispatched = result.dispatched && !hasNotes
  return (
    <div className="rounded-2xl border border-emerald-200 bg-gradient-to-br from-emerald-50 to-white p-5 text-left">
      <p className="text-[24px] mb-2">{dispatched ? '📬' : '🔗'}</p>
      <p className="text-[15px] font-semibold text-emerald-900">
        {dispatched ? 'Check your inbox' : 'Link generated — use it below'}
      </p>
      <p className="mt-1 text-[13px] text-emerald-800">
        {dispatched
          ? `We sent a one-click sign-in link to ${email}. It expires in 15 minutes.`
          : `Email delivery isn't fully configured — sign in with the link below.`}
      </p>

      {result.devLink && (
        <a
          href={result.devLink}
          className="mt-3 inline-flex items-center gap-2 w-full justify-center px-4 py-3 rounded-xl bg-emerald-600 text-white hover:bg-emerald-700 text-[14px] font-medium transition"
        >
          Sign in now →
        </a>
      )}

      {result.devLink && (
        <details className="mt-3 group">
          <summary className="cursor-pointer text-[11px] text-emerald-700 select-none">
            Or copy the raw link
          </summary>
          <div className="mt-2 rounded-lg bg-white border border-emerald-200 p-3 text-[11px] break-all font-mono text-emerald-800">
            {result.devLink}
          </div>
        </details>
      )}

      {hasNotes && (
        <div className="mt-4 rounded-lg bg-amber-50 border border-amber-200 p-3 text-[12px] text-amber-900">
          <p className="font-semibold mb-1">⚠️ Why didn&apos;t I get an email?</p>
          <ul className="list-disc pl-4 space-y-0.5">
            {result.notes!.map((n) => (
              <li key={n}>{n}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
