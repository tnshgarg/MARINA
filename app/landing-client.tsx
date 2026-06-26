'use client'

import { useState } from 'react'

/**
 * Auth widget for the landing page. Renders the Google SSO button (when
 * configured), the email magic-link form, and (in dev) the dev-login link.
 *
 * GitHub is deliberately NOT a sign-in option here: a first-time visitor
 * shouldn't be asked to trust us with their GitHub account before they've even
 * seen the product. GitHub is linked later — during onboarding and from the
 * Integrations page — and only for identity (no repo access).
 *
 * Compact by design — it sits inside the hero column, not the whole hero.
 */
export default function LandingClient({
  authError,
  googleSignIn,
  flow = 'solo',
  redirectTo = '/',
}: {
  authError: string | null
  /** null when Google SSO env vars aren't set; we hide the button rather than show a broken one. */
  googleSignIn?: (() => Promise<void>) | null
  /** Which signup flow this widget belongs to. Sets/clears the marina_flow
   *  cookie: 'solo' (employee) marks solo; 'org' (company/manager) clears it. */
  flow?: 'solo' | 'org'
  /** Where to land after auth. Company landing → '/', individuals → '/individuals'. */
  redirectTo?: string
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
        // Route the post-auth landing explicitly: org signups land on / (→
        // onboarding), solo signups on /individuals (→ dashboard). `flow` also
        // lets the endpoint set/clear the marina_flow cookie for the round-trip.
        body: JSON.stringify({ email, redirectTo, flow }),
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
      {/* Primary CTA — Google SSO (only when configured). GitHub is not offered
          as a sign-in method on purpose; it's linked later for identity only. */}
      {googleSignIn && (
        <form action={googleSignIn}>
          <button
            type="submit"
            className="w-full inline-flex items-center justify-center gap-2.5 px-5 py-3 rounded-xl bg-white border border-[var(--m-border)] hover:border-[var(--m-ink-4)] hover:bg-[var(--m-bg-soft)] text-[var(--m-ink)] text-[14.5px] font-medium shadow-[var(--m-shadow-sm)] transition"
          >
            <GoogleIcon />
            Continue with Google
          </button>
        </form>
      )}

      {/* Divider — only meaningful when there's an SSO button above it. */}
      {googleSignIn && (
        <div className="flex items-center gap-3 my-3">
          <span className="flex-1 h-px bg-[var(--m-border)]" />
          <span className="text-[10px] uppercase tracking-widest text-[var(--m-ink-4)]">or</span>
          <span className="flex-1 h-px bg-[var(--m-border)]" />
        </div>
      )}

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

function GoogleIcon() {
  return (
    <svg width={18} height={18} viewBox="0 0 48 48" aria-hidden>
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3c-1.7 4.7-6.2 8-11.3 8-6.6 0-12-5.4-12-12s5.4-12 12-12c3 0 5.8 1.1 7.9 3l5.7-5.7C34 6 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
      <path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 16 18.9 13 24 13c3 0 5.8 1.1 7.9 3l5.7-5.7C34 6 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
      <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2c-2 1.5-4.5 2.4-7.2 2.4-5.1 0-9.5-3.3-11.2-7.9l-6.5 5C9.6 39.6 16.2 44 24 44z" />
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.3-2.3 4.2-4.1 5.6l6.2 5.2C41.4 35.3 44 30.1 44 24c0-1.3-.1-2.4-.4-3.5z" />
    </svg>
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
          ? `We sent a one-click sign-in link to ${email}. It's good for an hour — open it and tap "Finish signing in".`
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
