import Link from 'next/link'

export const metadata = { title: 'Help Center · MARINA' }

export default function HelpLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="min-h-screen paper">
      <header className="border-b border-[var(--m-border)]/60 backdrop-blur-md bg-[var(--m-bg)]/75 sticky top-0 z-30">
        <div className="max-w-4xl mx-auto px-6 py-3.5 flex items-center justify-between gap-6">
          <Link href="/help" className="flex items-center gap-2.5 min-w-0">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo.svg" width={28} height={28} alt="MARINA" className="block object-contain shrink-0" />
            <span className="font-display text-[18px] tracking-tight text-[var(--m-ink)]">MARINA</span>
            <span className="text-[13px] text-[var(--m-ink-3)] font-medium hidden sm:inline">Help center</span>
          </Link>
          <nav className="flex items-center gap-5 text-[13px] text-[var(--m-ink-2)]">
            <Link href="/dashboard" className="hover:text-[var(--m-ink)] transition-colors">
              Dashboard
            </Link>
            <Link href="/setup-guide" className="hover:text-[var(--m-ink)] transition-colors hidden sm:inline">
              Setup guide
            </Link>
          </nav>
        </div>
      </header>
      {children}
    </main>
  )
}
