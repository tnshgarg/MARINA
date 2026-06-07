'use client'

import { useState } from 'react'

export default function InviteAuthOptions({
  token,
  email,
  githubSignIn,
}: {
  token: string
  email: string
  githubSignIn: () => Promise<void>
}) {
  const [emailMode, setEmailMode] = useState(false)
  const [typedEmail, setTypedEmail] = useState(email)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [sent, setSent] = useState<{ link?: string; notes?: string[] } | null>(null)

  async function sendMagicLink() {
    setBusy(true)
    setError(null)
    try {
      const res = await fetch('/api/auth/magic/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: typedEmail, redirectTo: `/invite/${token}` }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data?.error || 'Failed to send link')
      setSent({ link: data.devLink, notes: data.notes })
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  if (sent) {
    return (
      <div className="rounded-xl bg-gradient-to-br from-emerald-50 to-white border border-emerald-200 p-4">
        <p className="text-[24px] mb-2">{sent.link ? '🔗' : '📬'}</p>
        <p className="text-[15px] font-semibold text-emerald-900">
          {sent.link ? 'Click the link to sign in' : 'Check your inbox'}
        </p>
        <p className="mt-1 text-[13px] text-emerald-800">
          {sent.link
            ? "Email isn't fully configured — use the link below."
            : `We sent a one-click sign-in link to ${typedEmail}. It expires in 15 minutes.`}
        </p>
        {sent.link && (
          <a
            href={sent.link}
            className="mt-3 inline-flex items-center gap-2 w-full justify-center px-4 py-3 rounded-xl bg-emerald-600 text-white hover:bg-emerald-700 text-[14px] font-medium transition"
          >
            Sign in &amp; accept invite →
          </a>
        )}
        {sent.notes && sent.notes.length > 0 && (
          <div className="mt-3 rounded-lg bg-amber-50 border border-amber-200 p-3 text-[11px] text-amber-900">
            <p className="font-semibold mb-1">⚠️ Why didn&apos;t I get an email?</p>
            <ul className="list-disc pl-4 space-y-0.5">
              {sent.notes.map((n) => (
                <li key={n}>{n}</li>
              ))}
            </ul>
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {!emailMode ? (
        <>
          <form action={githubSignIn}>
            <button
              type="submit"
              className="w-full inline-flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-slate-900 text-white hover:bg-slate-800 text-[14px] font-medium transition"
            >
              <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden>
                <path d="M12 .5C5.65.5.5 5.65.5 12c0 5.08 3.29 9.39 7.86 10.91.58.1.79-.25.79-.56v-2.1c-3.2.7-3.88-1.36-3.88-1.36-.52-1.31-1.28-1.66-1.28-1.66-1.05-.72.08-.71.08-.71 1.16.08 1.77 1.19 1.77 1.19 1.03 1.77 2.7 1.26 3.36.96.1-.75.4-1.26.73-1.55-2.55-.29-5.23-1.28-5.23-5.7 0-1.26.45-2.29 1.19-3.1-.12-.29-.52-1.46.11-3.04 0 0 .97-.31 3.18 1.18A11 11 0 0 1 12 6.8c.98.01 1.97.13 2.89.39 2.2-1.49 3.17-1.18 3.17-1.18.64 1.58.24 2.75.12 3.04.74.81 1.19 1.84 1.19 3.1 0 4.43-2.69 5.41-5.25 5.69.41.36.78 1.07.78 2.15v3.19c0 .31.21.67.8.56C20.21 21.39 23.5 17.08 23.5 12 23.5 5.65 18.35.5 12 .5Z" />
              </svg>
              Continue with GitHub
            </button>
          </form>

          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-slate-200"></div>
            </div>
            <div className="relative flex justify-center text-[11px]">
              <span className="bg-white px-2 text-slate-400">or</span>
            </div>
          </div>

          <button
            onClick={() => setEmailMode(true)}
            className="w-full inline-flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-white border border-slate-200 hover:border-slate-300 hover:bg-slate-50 text-slate-700 text-[14px] font-medium transition"
          >
            ✉️ Continue with email
          </button>

          <p className="text-[11px] text-slate-500 text-center pt-2">
            Non-engineer? Use email. Engineers, GitHub gives you live activity sync.
          </p>
        </>
      ) : (
        <>
          <label className="block">
            <p className="text-[11px] uppercase tracking-widest text-slate-500 font-semibold mb-1.5">
              Email
            </p>
            <input
              type="email"
              value={typedEmail}
              onChange={(e) => setTypedEmail(e.target.value)}
              placeholder="you@company.com"
              className="input"
              autoFocus
            />
          </label>
          <button
            onClick={sendMagicLink}
            disabled={busy || !typedEmail.includes('@')}
            className="w-full inline-flex items-center justify-center px-4 py-3 rounded-xl bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed text-[14px] font-medium transition"
          >
            {busy ? 'Sending…' : 'Send sign-in link'}
          </button>
          <button
            onClick={() => setEmailMode(false)}
            className="w-full text-[12px] text-slate-500 hover:text-slate-700"
          >
            ← Back to all options
          </button>
          {error && <p className="text-[12px] text-rose-600">{error}</p>}
        </>
      )}
    </div>
  )
}
