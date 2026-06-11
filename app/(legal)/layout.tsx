import Link from 'next/link'

export default function LegalLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="min-h-screen paper">
      <header className="border-b border-[var(--m-border)]/60 backdrop-blur-md bg-[var(--m-bg)]/75 sticky top-0 z-30">
        <div className="max-w-4xl mx-auto px-6 py-3.5 flex items-center justify-between gap-6">
          <Link href="/" className="flex items-center gap-2.5">
            <svg width={26} height={26} viewBox="0 0 28 28" fill="none">
              <defs>
                <linearGradient id="mlogol" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stopColor="#3f6b54" />
                  <stop offset="100%" stopColor="#c19a4d" />
                </linearGradient>
              </defs>
              <path d="M14 3 L24 24 H4 Z" fill="url(#mlogol)" />
              <circle cx={14} cy={18} r={3} fill="#f8f6f1" />
            </svg>
            <span className="font-display text-[18px] tracking-tight text-[var(--m-ink)]">MARINA</span>
          </Link>
          <nav className="flex items-center gap-5 text-[13px] text-[var(--m-ink-2)]">
            <Link href="/privacy" className="hover:text-[var(--m-ink)] transition-colors">Privacy</Link>
            <Link href="/terms" className="hover:text-[var(--m-ink)] transition-colors">Terms</Link>
            <Link href="/security" className="hover:text-[var(--m-ink)] transition-colors">Security</Link>
            <Link href="/dpa" className="hover:text-[var(--m-ink)] transition-colors">DPA</Link>
          </nav>
        </div>
      </header>
      <article className="legal-prose max-w-3xl mx-auto px-6 py-16">
        {children}
      </article>
    </main>
  )
}
