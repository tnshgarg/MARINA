import Link from 'next/link'
import { ARTICLES, CATEGORY_ORDER } from '@/lib/help/articles'

export const metadata = { title: 'Help Center · MARINA' }

export default function HelpIndex() {
  return (
    <div className="max-w-4xl mx-auto px-6 py-12 sm:py-16">
      <p className="app-eyebrow">Help center</p>
      <h1 className="text-[30px] sm:text-[36px] font-semibold text-[var(--m-ink)] tracking-tight mt-1">
        How can we help?
      </h1>
      <p className="text-[15px] text-[var(--m-ink-2)] mt-2 max-w-xl leading-relaxed">
        Everything you need to get the most out of Marina — for teammates and managers alike. Confused about
        something? You&apos;re not alone. Start here.
      </p>

      <div className="mt-10 space-y-10">
        {CATEGORY_ORDER.map((cat) => {
          const items = ARTICLES.filter((a) => a.category === cat)
          if (!items.length) return null
          return (
            <section key={cat}>
              <h2 className="text-[13px] font-semibold uppercase tracking-wider text-[var(--m-ink-4)] mb-3">{cat}</h2>
              <div className="grid gap-3 sm:grid-cols-2">
                {items.map((a) => (
                  <Link
                    key={a.slug}
                    href={`/help/${a.slug}`}
                    className="group rounded-xl border border-[var(--m-border)] bg-white p-4 hover:border-[var(--m-accent)] transition-colors"
                  >
                    <p className="text-[14.5px] font-semibold text-[var(--m-ink)] group-hover:text-[var(--m-accent)] transition-colors">
                      {a.title}
                    </p>
                    <p className="text-[12.5px] text-[var(--m-ink-3)] mt-1 leading-snug">{a.summary}</p>
                    <p className="text-[11px] text-[var(--m-ink-4)] mt-2">{a.minutes} min read</p>
                  </Link>
                ))}
              </div>
            </section>
          )
        })}
      </div>

      <div className="mt-14 rounded-xl border border-[var(--m-border)] bg-[var(--m-accent-soft)] p-5">
        <p className="text-[14px] font-semibold text-[var(--m-ink)]">Still stuck?</p>
        <p className="text-[13px] text-[var(--m-ink-2)] mt-1 leading-relaxed">
          Ask Marina directly — send a DM in Slack, or reach out to your workspace admin. You&apos;re never on your
          own here.
        </p>
      </div>
    </div>
  )
}
