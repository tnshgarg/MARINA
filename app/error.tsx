'use client'

import { useEffect } from 'react'
import Link from 'next/link'

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error('[app error boundary]', error)
  }, [error])

  return (
    <main className="paper min-h-screen flex items-center justify-center px-6">
      <div className="text-center max-w-md">
        <p className="text-[11px] tracking-[0.2em] uppercase text-[var(--m-bad)] font-semibold mb-3">
          Something broke
        </p>
        <h1 className="font-display text-[48px] md:text-[60px] leading-none tracking-tight text-[var(--m-ink)]">
          That wasn't <span className="italic">supposed</span> to happen
        </h1>
        <p className="mt-6 text-[15px] text-[var(--m-ink-2)] leading-relaxed">
          We've logged this and our team will look at it. In the meantime, you
          can try again — most problems are transient.
        </p>
        {error.digest && (
          <p className="mt-3 text-[11.5px] text-[var(--m-ink-4)] font-mono">
            Reference: {error.digest}
          </p>
        )}
        <div className="mt-8 flex items-center justify-center gap-3 flex-wrap">
          <button onClick={reset} className="btn-primary">
            Try again
          </button>
          <Link
            href="/"
            className="text-[13.5px] text-[var(--m-ink-2)] hover:text-[var(--m-ink)] px-3 py-2 rounded-lg border border-[var(--m-border)] hover:border-[var(--m-ink-4)] transition"
          >
            Back home
          </Link>
        </div>
      </div>
    </main>
  )
}
