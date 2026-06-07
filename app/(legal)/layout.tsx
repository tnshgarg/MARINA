import Link from 'next/link'

export default function LegalLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="min-h-screen bg-white">
      <header className="border-b border-slate-200">
        <div className="max-w-3xl mx-auto px-6 py-4 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2.5">
            <svg width={24} height={24} viewBox="0 0 28 28" fill="none">
              <path d="M14 3 L24 24 H4 Z" fill="#6366f1" />
              <circle cx={14} cy={18} r={3} fill="#fff" />
            </svg>
            <span className="font-semibold text-[15px] tracking-tight text-slate-900">MARINA</span>
          </Link>
          <nav className="flex items-center gap-4 text-[13px] text-slate-600">
            <Link href="/privacy" className="hover:text-indigo-600">Privacy</Link>
            <Link href="/terms" className="hover:text-indigo-600">Terms</Link>
            <Link href="/security" className="hover:text-indigo-600">Security</Link>
            <Link href="/dpa" className="hover:text-indigo-600">DPA</Link>
          </nav>
        </div>
      </header>
      <article className="max-w-3xl mx-auto px-6 py-12 prose prose-slate prose-sm">
        {children}
      </article>
    </main>
  )
}
