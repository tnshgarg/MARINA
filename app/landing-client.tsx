'use client'

import { useState } from 'react'

/**
 * Auth widget for the landing page. Renders the email magic-link form, GitHub
 * OAuth button, and (in dev) the dev-login link. The hero copy and headline
 * live in `app/page.tsx`; this component is purely the call-to-action surface.
 *
 * Compact by design — it sits inside the hero column, not the whole hero.
 */
export default function LandingClient({
  authError,
  githubSignIn,
}: {
  authError: string | null
  githubSignIn: () => Promise<void>
  /** kept for backwards compat with existing call sites; no longer rendered */
  characters?: Array<{ key: string; name: string; color: string }>
}) {
  const [email, setEmail] = useState('')
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<{
    dispatched: boolean
    devLink?: string
    notes?: string[]
  } | null>(null)
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

  if (result) {
    return (
      <div className="max-w-md">
        <SuccessCard result={result} email={email} />
        {(error || authError) && (
          <p className="mt-3 text-[12px] text-rose-600">
            {error ?? (authError === 'invalid_or_expired_link'
              ? 'That link expired or was already used. Request a fresh one.'
              : 'Auth failed.')}
          </p>
        )}
      </div>
    )
  }

  return (
    <div className="max-w-md">
      {/* Primary CTA — GitHub OAuth */}
      <form action={githubSignIn}>
        <button
          type="submit"
          className="w-full inline-flex items-center justify-center gap-2.5 px-5 py-3 rounded-xl bg-[var(--m-ink)] hover:bg-[var(--m-ink-2)] text-white text-[14.5px] font-medium shadow-[var(--m-shadow)] transition"
        >
          <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden>
            <path d="M12 .5C5.65.5.5 5.65.5 12c0 5.08 3.29 9.39 7.86 10.91.58.1.79-.25.79-.56v-2.1c-3.2.7-3.88-1.36-3.88-1.36-.52-1.31-1.28-1.66-1.28-1.66-1.05-.72.08-.71.08-.71 1.16.08 1.77 1.19 1.77 1.19 1.03 1.77 2.7 1.26 3.36.96.1-.75.4-1.26.73-1.55-2.55-.29-5.23-1.28-5.23-5.7 0-1.26.45-2.29 1.19-3.1-.12-.29-.52-1.46.11-3.04 0 0 .97-.31 3.18 1.18A11 11 0 0 1 12 6.8c.98.01 1.97.13 2.89.39 2.2-1.49 3.17-1.18 3.17-1.18.64 1.58.24 2.75.12 3.04.74.81 1.19 1.84 1.19 3.1 0 4.43-2.69 5.41-5.25 5.69.41.36.78 1.07.78 2.15v3.19c0 .31.21.67.8.56C20.21 21.39 23.5 17.08 23.5 12 23.5 5.65 18.35.5 12 .5Z" />
          </svg>
          Get started with GitHub
        </button>
      </form>

      {/* Divider */}
      <div className="flex items-center gap-3 my-3">
        <span className="flex-1 h-px bg-[var(--m-border)]" />
        <span className="text-[10px] uppercase tracking-widest text-[var(--m-ink-4)]">or</span>
        <span className="flex-1 h-px bg-[var(--m-border)]" />
      </div>

      {/* Email magic link */}
      <form
        onSubmit={startMagic}
        className="flex gap-1.5 bg-white rounded-xl p-1.5 border border-[var(--m-border)] shadow-[var(--m-shadow-sm)] focus-within:border-[var(--m-accent)] focus-within:ring-2 focus-within:ring-[var(--m-accent)]/15 transition"
      >
        <input
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@yourcompany.com"
          className="flex-1 px-3 py-2 text-[14px] outline-none rounded-lg bg-transparent text-[var(--m-ink)] placeholder:text-[var(--m-ink-4)]"
          disabled={busy}
        />
        <button
          type="submit"
          disabled={busy}
          className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-[var(--m-accent)] text-white hover:bg-[var(--m-accent-2)] text-[13px] font-medium disabled:opacity-60 transition whitespace-nowrap"
        >
          {busy ? 'Sending…' : 'Magic link →'}
        </button>
      </form>

      {process.env.NODE_ENV !== 'production' && (
        <a
          href="/dev/login"
          className="mt-3 inline-block text-[11px] text-rose-600 hover:text-rose-700 hover:underline"
        >
          🛠 Dev login (instant sign-in as any seeded user)
        </a>
      )}

      {(error || authError) && (
        <p className="mt-3 text-[12px] text-rose-600">
          {error ?? (authError === 'invalid_or_expired_link'
            ? 'That link expired or was already used. Request a fresh one.'
            : 'Auth failed.')}
        </p>
      )}
    </div>
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
    <div className="rounded-2xl border border-[var(--m-good)]/20 bg-gradient-to-br from-[var(--m-good-soft)] to-white p-5">
      <p className="text-[13px] font-semibold uppercase tracking-wider text-[var(--m-good)] mb-1">
        {dispatched ? 'Check your inbox' : 'Link generated'}
      </p>
      <p className="text-[14px] text-[var(--m-ink)]">
        {dispatched
          ? `We sent a one-click sign-in link to ${email}. It expires in 15 minutes.`
          : `Email delivery isn't fully configured — sign in with the link below.`}
      </p>

      {result.devLink && (
        <a
          href={result.devLink}
          className="mt-3 inline-flex items-center gap-2 w-full justify-center px-4 py-2.5 rounded-xl bg-[var(--m-ink)] text-white hover:bg-[var(--m-ink-2)] text-[14px] font-medium transition"
        >
          Sign in now →
        </a>
      )}

      {result.devLink && (
        <details className="mt-3">
          <summary className="cursor-pointer text-[11px] text-[var(--m-ink-3)] select-none">
            Or copy the raw link
          </summary>
          <div className="mt-2 rounded-lg bg-white border border-[var(--m-border)] p-3 text-[11px] break-all font-mono text-[var(--m-ink-2)]">
            {result.devLink}
          </div>
        </details>
      )}

      {hasNotes && (
        <div className="mt-4 rounded-lg bg-[var(--m-warn-soft)] border border-[var(--m-warn)]/20 p-3 text-[12px] text-[var(--m-ink-2)]">
          <p className="font-semibold mb-1">Why didn&apos;t I get an email?</p>
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
