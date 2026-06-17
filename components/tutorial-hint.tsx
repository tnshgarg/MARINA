'use client'

import { useEffect, useState } from 'react'
import { MarinaMark } from '@/components/marina-mark'

/**
 * Dismissible inline "first-time tip" — spoken by Marina, not a generic
 * tooltip. Her orb fronts every hint so it reads as your chief of staff
 * leaning in with a quick pointer, and dismissal persists in localStorage so
 * each tip shows at most once per (browser, user).
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

  // `tone` tints the card (border/bg/title). Marina's orb is intentionally
  // always sage — it's her identity, the same everywhere she appears — so it
  // doesn't take a tone colour.
  const colors = {
    sage: {
      border: 'border-[var(--m-accent)]/30',
      bg: 'bg-[var(--m-accent-soft)]/40',
      title: 'text-[var(--m-accent)]',
    },
    clay: {
      border: 'border-[var(--m-clay)]/30',
      bg: 'bg-[var(--m-clay-soft)]/40',
      title: 'text-[var(--m-clay-deep)]',
    },
    gold: {
      border: 'border-[var(--m-gold)]/30',
      bg: 'bg-[var(--m-gold-soft)]/40',
      title: 'text-[var(--m-gold)]',
    },
  }[tone]

  return (
    <div
      className={`relative rounded-lg border ${colors.border} ${colors.bg} px-3.5 py-3 text-[12.5px] text-[var(--m-ink-2)] leading-relaxed`}
      role="note"
    >
      <div className="flex items-start gap-3">
        {/* Decorative here — the visible "· from Marina" already attributes it,
            so the orb stays aria-hidden to avoid announcing "Marina" twice. */}
        <MarinaMark size={26} className="shrink-0 mt-0.5" label="" />
        <div className="flex-1 min-w-0">
          <p className={`text-[11.5px] font-semibold uppercase tracking-wider mb-0.5 ${colors.title}`}>
            {title}
            <span className="ml-1.5 normal-case tracking-normal font-normal text-[var(--m-ink-4)]">
              · from Marina
            </span>
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
