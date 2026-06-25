import Link from 'next/link'
import { SCREENSHOTS_ENABLED } from '@/lib/flags'

/**
 * Shared header/navigation chrome for the personal console pages under /me/*.
 *
 * Every personal page (My data, Attendance regularizations, My shots) was
 * rendering its own ad-hoc header — some linked to /settings, none linked
 * back to the personal dashboard, so people got stranded. This standardises
 * that: the MARINA mark and a clear "← Dashboard" link both return to
 * /dashboard, the page title is passed in, and the sibling personal pages are
 * one click away.
 *
 * Server-component friendly: plain JSX + next/link, no client hooks. The
 * caller marks the active page via `current` so the matching tab is
 * highlighted (and announced as the current page for assistive tech).
 */

type PersonalPage = 'data' | 'regularizations' | 'shots'

export default function PersonalPageHeader({
  title,
  eyebrow,
  current,
  showAttendance = true,
}: {
  /** Page title shown as the header heading. */
  title: string
  /** Optional small label above the title (e.g. "Your data & transparency"). */
  eyebrow?: string
  /** Which personal page is active, so its tab is highlighted. */
  current?: PersonalPage
  /** Attendance regularization is an org concept (a manager approves it). Hide
   *  the tab for solo employees with no org. */
  showAttendance?: boolean
}) {
  const nav: { key: PersonalPage; label: string; href: string }[] = [
    { key: 'data', label: 'My data', href: '/me/data' },
    // Attendance regularization needs a manager to approve — org-only.
    ...(showAttendance
      ? [{ key: 'regularizations' as PersonalPage, label: 'Attendance', href: '/me/regularizations' }]
      : []),
    // GATEKEPT: the "My shots" (screenshots) tab is hidden while the feature is off.
    ...(SCREENSHOTS_ENABLED
      ? [{ key: 'shots' as PersonalPage, label: 'My shots', href: '/me/shots' }]
      : []),
  ]
  return (
    <header className="border-b border-[var(--m-border)]/60 backdrop-blur-md bg-[var(--m-bg)]/75 sticky top-0 z-30">
      <div className="max-w-3xl mx-auto px-6 py-3.5">
        <div className="flex items-center justify-between gap-4">
          {/* Brand mark — returns to the personal dashboard. */}
          <Link
            href="/dashboard"
            aria-label="MARINA — back to dashboard"
            className="flex items-center gap-2.5 shrink-0"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/logo.svg"
              width={28}
              height={28}
              alt=""
              aria-hidden
              className="block object-contain"
            />
            <span className="font-display text-[18px] tracking-tight text-[var(--m-ink)]">
              MARINA
            </span>
          </Link>

          {/* Primary escape hatch back to the dashboard. */}
          <Link
            href="/dashboard"
            aria-label="Back to dashboard"
            className="text-[13px] font-medium text-[var(--m-ink-3)] hover:text-[var(--m-accent)] transition-colors shrink-0"
          >
            ← Dashboard
          </Link>
        </div>

        <div className="mt-3 flex flex-wrap items-end justify-between gap-x-6 gap-y-2">
          <div className="min-w-0">
            {eyebrow ? <p className="app-eyebrow">{eyebrow}</p> : null}
            <h1 className="app-h2 mt-0.5">{title}</h1>
          </div>

          {/* Move between the personal pages without going via the dashboard. */}
          <nav aria-label="Personal pages" className="flex items-center gap-1 text-[13px]">
            {nav.map((item) => {
              const active = item.key === current
              return (
                <Link
                  key={item.key}
                  href={item.href}
                  aria-current={active ? 'page' : undefined}
                  className={
                    active
                      ? 'px-2.5 py-1 rounded-md bg-[var(--m-accent-soft)] text-[var(--m-accent-2)] font-medium'
                      : 'px-2.5 py-1 rounded-md text-[var(--m-ink-3)] hover:text-[var(--m-ink)] hover:bg-[var(--m-bg-soft)] transition-colors'
                  }
                >
                  {item.label}
                </Link>
              )
            })}
          </nav>
        </div>
      </div>
    </header>
  )
}
