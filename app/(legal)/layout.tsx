import Link from 'next/link'

export default function LegalLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="min-h-screen paper">
      <header className="border-b border-[var(--m-border)]/60 backdrop-blur-md bg-[var(--m-bg)]/75 sticky top-0 z-30">
        <div className="max-w-4xl mx-auto px-6 py-3.5 flex items-center justify-between gap-6">
          <Link href="/" className="flex items-center gap-2.5">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo.svg" width={28} height={28} alt="MARINA" className="block object-contain" />
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
