'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'

export type HelpItem = {
  slug: string
  title: string
  summary: string
  category: string
  minutes: number
}

/** Searchable, categorised grid of help articles. */
export function HelpSearch({ items, categories }: { items: HelpItem[]; categories: string[] }) {
  const [q, setQ] = useState('')
  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase()
    if (!needle) return items
    return items.filter((a) => `${a.title} ${a.summary} ${a.category}`.toLowerCase().includes(needle))
  }, [q, items])

  return (
    <div>
      <div className="relative mt-8 max-w-md">
        <svg
          className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--m-ink-4)] pointer-events-none"
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          aria-hidden
        >
          <circle cx="11" cy="11" r="7" />
          <path d="m21 21-4.3-4.3" strokeLinecap="round" />
        </svg>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search help…"
          aria-label="Search help articles"
          className="input w-full text-[14px] pl-9"
        />
      </div>

      {filtered.length === 0 ? (
        <p className="mt-10 text-[13.5px] text-[var(--m-ink-3)]">
          No articles match “{q}”.{' '}
          <button type="button" onClick={() => setQ('')} className="text-[var(--m-accent)] hover:underline">
            Clear search
          </button>
          .
        </p>
      ) : (
        <div className="mt-10 space-y-10">
          {categories.map((cat) => {
            const group = filtered.filter((a) => a.category === cat)
            if (!group.length) return null
            return (
              <section key={cat}>
                <h2 className="text-[13px] font-semibold uppercase tracking-wider text-[var(--m-ink-4)] mb-3">{cat}</h2>
                <div className="grid gap-3 sm:grid-cols-2">
                  {group.map((a) => (
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
      )}
    </div>
  )
}
