'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

export type SectionTab = {
  key: string
  label: string
  href: string
  // Optional small counter shown next to the tab (e.g. "3" pending leaves).
  badge?: number | null
  // Tabs whose route prefix should be matched against the current path.
  matchPrefix: string
}

/**
 * In-page tabs that sit at the top of a section's page. Used so we can keep
 * the sidebar at six items while still surfacing sibling views (Members /
 * Shifts, Activity / Insights, Workspace / Profile).
 *
 * Matches by route prefix so a sub-path like /members/abc still highlights
 * the Members tab.
 */
export function SectionTabs({ tabs }: { tabs: SectionTab[] }) {
  const pathname = usePathname() ?? ''

  return (
    <div className="border-b border-slate-200 mb-6">
      <nav className="flex gap-1 -mb-px" aria-label="Section tabs">
        {tabs.map((t) => {
          const active = pathname === t.matchPrefix || pathname.startsWith(t.matchPrefix + '/')
          return (
            <Link
              key={t.key}
              href={t.href}
              prefetch
              className={`relative inline-flex items-center gap-1.5 px-3 pb-2.5 pt-1 text-[13px] font-medium transition ${
                active
                  ? 'text-slate-900 border-b-2 border-slate-900'
                  : 'text-slate-500 border-b-2 border-transparent hover:text-slate-900 hover:border-slate-200'
              }`}
            >
              {t.label}
              {typeof t.badge === 'number' && t.badge > 0 && (
                <span
                  className={`text-[10.5px] tabular-nums px-1.5 py-0.5 rounded-full ${
                    active ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-600'
                  }`}
                >
                  {t.badge}
                </span>
              )}
            </Link>
          )
        })}
      </nav>
    </div>
  )
}
