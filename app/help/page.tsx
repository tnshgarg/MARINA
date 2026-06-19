import { ARTICLES, CATEGORY_ORDER } from '@/lib/help/articles'
import { HelpSearch } from './help-search'

export const metadata = { title: 'Help Center · MARINA' }

export default function HelpIndex() {
  const items = ARTICLES.map((a) => ({
    slug: a.slug,
    title: a.title,
    summary: a.summary,
    category: a.category,
    minutes: a.minutes,
  }))
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

      <HelpSearch items={items} categories={CATEGORY_ORDER} />

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
