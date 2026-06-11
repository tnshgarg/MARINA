import Link from 'next/link'

export default function NotFound() {
  return (
    <main className="paper min-h-screen flex items-center justify-center px-6">
      <div className="text-center max-w-md">
        <p className="text-[11px] tracking-[0.2em] uppercase text-[var(--m-accent)] font-semibold mb-3">
          404 · Lost at sea
        </p>
        <h1 className="font-display text-[56px] md:text-[72px] leading-none tracking-tight text-[var(--m-ink)]">
          We couldn't <span className="italic">find that</span>
        </h1>
        <p className="mt-6 text-[15px] text-[var(--m-ink-2)] leading-relaxed">
          The page you're looking for might have been moved, deleted, or perhaps
          never existed. If you got here from a MARINA link, let us know at{' '}
          <a className="text-[var(--m-accent)] underline" href="mailto:hello@marina.in">
            hello@marina.in
          </a>
          .
        </p>
        <div className="mt-8 flex items-center justify-center gap-3 flex-wrap">
          <Link href="/" className="btn-primary">
            Back home
          </Link>
          <Link
            href="/dashboard"
            className="text-[13.5px] text-[var(--m-ink-2)] hover:text-[var(--m-ink)] px-3 py-2 rounded-lg border border-[var(--m-border)] hover:border-[var(--m-ink-4)] transition"
          >
            Go to dashboard
          </Link>
        </div>
      </div>
    </main>
  )
}
