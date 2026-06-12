'use client'

import { useEffect, useState } from 'react'

/**
 * Dismissible inline "first-time tip" callout. Persists the dismissal in
 * localStorage so each tip is shown at most once per (browser, user). Use
 * for surfaces that are powerful but non-obvious — Blocker Resolver, Scrum
 * Mode, capability editor — without forcing a full product tour.
 *
 * Pattern:
 *   <TutorialHint id="scrum-mode-intro" title="Standup, on rails">
 *     Use ← → to move between teammates, Space to mark covered.
 *   </TutorialHint>
 *
 * The `id` is part of the storage key — pick something stable; renaming
 * later will re-show the hint to everyone who already dismissed it.
 */
export function TutorialHint({
  id,
  title,
  tone = 'sage',
  children,
}: {
  id: string
  title: string
  tone?: 'sage' | 'clay' | 'gold'
  children: React.ReactNode
}) {
  const storageKey = `marina-tip-dismissed:${id}`
  // SSR-safe: start "hidden" on the server and only flip to visible after
  // we've checked localStorage. Otherwise the hint flashes on every page
  // load before disappearing — much worse than the short delay.
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    try {
      if (localStorage.getItem(storageKey)) return
      setVisible(true)
    } catch {
      // Private mode / storage disabled — just don't show the hint.
    }
  }, [storageKey])

  if (!visible) return null

  const dismiss = () => {
    try {
      localStorage.setItem(storageKey, String(Date.now()))
    } catch {
      /* noop */
    }
    setVisible(false)
  }

  const colors = {
    sage: {
      border: 'border-[var(--m-accent)]/30',
      bg: 'bg-[var(--m-accent-soft)]/40',
      icon: 'text-[var(--m-accent)]',
      title: 'text-[var(--m-accent)]',
    },
    clay: {
      border: 'border-[var(--m-clay)]/30',
      bg: 'bg-[var(--m-clay-soft)]/40',
      icon: 'text-[var(--m-clay-deep)]',
      title: 'text-[var(--m-clay-deep)]',
    },
    gold: {
      border: 'border-[var(--m-gold)]/30',
      bg: 'bg-[var(--m-gold-soft)]/40',
      icon: 'text-[var(--m-gold)]',
      title: 'text-[var(--m-gold)]',
    },
  }[tone]

  return (
    <div
      className={`relative rounded-lg border ${colors.border} ${colors.bg} px-3.5 py-3 text-[12.5px] text-[var(--m-ink-2)] leading-relaxed`}
      role="note"
    >
      <div className="flex items-start gap-2.5">
        <svg
          width={16}
          height={16}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={1.8}
          className={`shrink-0 mt-0.5 ${colors.icon}`}
          aria-hidden
        >
          <circle cx={12} cy={12} r={9} />
          <path d="M12 8v5M12 16h.01" strokeLinecap="round" />
        </svg>
        <div className="flex-1 min-w-0">
          <p className={`text-[11.5px] font-semibold uppercase tracking-wider mb-0.5 ${colors.title}`}>
            {title}
          </p>
          <div>{children}</div>
        </div>
        <button
          type="button"
          onClick={dismiss}
          className="shrink-0 text-[11px] font-medium text-[var(--m-ink-3)] hover:text-[var(--m-ink)] px-2 py-1 rounded-md hover:bg-white/60 transition"
          aria-label="Dismiss tip"
        >
          Got it
        </button>
      </div>
    </div>
  )
}
