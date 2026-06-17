'use client'

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { MarinaMark } from '@/components/marina-mark'

/**
 * Marina's first-run dashboard tour.
 *
 * On a manager's first visit she walks them through the few things that matter
 * — her morning brief, the live stats, the team grid, and the "ask me anything"
 * dock — with a spotlight + a coachmark in her voice. It is fully SKIPPABLE
 * (Esc, "Skip tour", or finishing once) and shows at most once per browser via
 * localStorage, the same pattern as TutorialHint. Steps whose target isn't on
 * the page (e.g. a conditional panel) are skipped automatically, so it never
 * points at nothing.
 *
 * Re-trigger anytime with: window.dispatchEvent(new Event('marina:start-tour'))
 */

const STORAGE_KEY = 'marina:dashboard-tour:v1'
const PAD = 8
const POP_W = 330

type Step = {
  /** CSS selector of the element to spotlight. null = centered, no spotlight. */
  selector: string | null
  title: string
  body: string
}

const STEPS: Step[] = [
  {
    selector: '[data-tour="brief"]',
    title: "This is me — your morning brief",
    body: "Every day I read the room first and tell you, in one line, exactly what needs you. No digging through dashboards.",
  },
  {
    selector: '[data-tour="stats"]',
    title: 'Your team at a glance',
    body: "Productivity, who's blocked, who's shipping, who's out — live. Glance here and you already know how today's going.",
  },
  {
    selector: '[data-tour="members"]',
    title: 'Everyone you manage',
    body: 'Your whole team lives here. Once the tour’s done, open anyone to see what they’re working on, what they shipped, and whether they’re stuck.',
  },
  {
    selector: '[data-tour="ask-marina"]',
    title: 'Stuck on a question? Ask me.',
    body: "“Who’s overloaded?” “What shipped this week?” “Is anyone burning out?” I answer from real data, in seconds.",
  },
  {
    selector: null,
    title: "That’s the tour",
    body: "I’ve got the watching covered — go lead. You can reopen this anytime from the menu.",
  },
]

type Rect = { top: number; left: number; width: number; height: number }

export function DashboardTour() {
  const [mounted, setMounted] = useState(false)
  const [active, setActive] = useState(false)
  const [idx, setIdx] = useState(0)
  const [rect, setRect] = useState<Rect | null>(null)
  const [popH, setPopH] = useState(200)
  const reducedMotion = useRef(false)
  const dialogRef = useRef<HTMLDivElement>(null)
  const popRef = useRef<HTMLDivElement>(null)
  const prevFocusRef = useRef<HTMLElement | null>(null)

  useEffect(() => {
    setMounted(true)
    try {
      reducedMotion.current =
        window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false
    } catch {
      /* noop */
    }
  }, [])

  const finish = useCallback(() => {
    setActive(false)
    try {
      localStorage.setItem(STORAGE_KEY, String(Date.now()))
    } catch {
      /* private mode — fine */
    }
    // Hand focus back to wherever it was before the tour took over.
    try {
      prevFocusRef.current?.focus?.()
    } catch {
      /* noop */
    }
  }, [])

  // Auto-start once per browser, after the dashboard has had a beat to render
  // (the Ask-Marina launcher mounts via a portal, so we wait for it).
  useEffect(() => {
    if (!mounted) return
    let alreadySeen = false
    try {
      alreadySeen = !!localStorage.getItem(STORAGE_KEY)
    } catch {
      alreadySeen = true // storage blocked — don't nag
    }
    const start = () => {
      setIdx(0)
      setActive(true)
    }
    let t: ReturnType<typeof setTimeout> | null = null
    if (!alreadySeen) t = setTimeout(start, 900)
    // Manual replay (e.g. a "Show me around" affordance) ignores the seen flag.
    const onReplay = () => start()
    window.addEventListener('marina:start-tour', onReplay)
    return () => {
      if (t) clearTimeout(t)
      window.removeEventListener('marina:start-tour', onReplay)
    }
  }, [mounted])

  // Resolve + measure the current step's target, skipping any that aren't on
  // the page. Centered steps (selector null) clear the spotlight.
  const measure = useCallback((stepIndex: number) => {
    let i = stepIndex
    while (i < STEPS.length) {
      const s = STEPS[i]
      if (!s.selector) {
        setRect(null)
        setIdx(i)
        return
      }
      const el = document.querySelector(s.selector) as HTMLElement | null
      if (el) {
        const r = el.getBoundingClientRect()
        setRect({ top: r.top, left: r.left, width: r.width, height: r.height })
        setIdx(i)
        return
      }
      i += 1 // target missing — skip to the next step
    }
    // Ran off the end with nothing to show.
    finish()
  }, [finish])

  // When the active step changes, scroll its target into view, then measure.
  useEffect(() => {
    if (!active) return
    const s = STEPS[idx]
    if (s?.selector) {
      const el = document.querySelector(s.selector) as HTMLElement | null
      if (el) {
        try {
          el.scrollIntoView({
            behavior: reducedMotion.current ? 'auto' : 'smooth',
            block: 'center',
            inline: 'nearest',
          })
        } catch {
          el.scrollIntoView()
        }
      }
    }
    const t = setTimeout(() => measure(idx), reducedMotion.current ? 0 : 280)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, idx])

  // Keep the spotlight glued to the target while the page scrolls/resizes.
  useEffect(() => {
    if (!active) return
    const onMove = () => {
      const s = STEPS[idx]
      if (!s?.selector) return
      const el = document.querySelector(s.selector) as HTMLElement | null
      if (!el) return
      const r = el.getBoundingClientRect()
      setRect({ top: r.top, left: r.left, width: r.width, height: r.height })
    }
    window.addEventListener('scroll', onMove, true)
    window.addEventListener('resize', onMove)
    return () => {
      window.removeEventListener('scroll', onMove, true)
      window.removeEventListener('resize', onMove)
    }
  }, [active, idx])

  // Esc skips; → advances. (Enter is intentionally NOT bound here: when the
  // visible Next button has focus, the browser already fires its click on
  // Enter — binding it globally too would advance two steps at once.)
  useEffect(() => {
    if (!active) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') finish()
      else if (e.key === 'ArrowRight') next()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, idx])

  // Focus management for the aria-modal dialog: remember where focus was, then
  // move it into the dialog on open and on every step change so a screen
  // reader announces the new coachmark (its title/body via aria-labelledby/
  // describedby). finish() restores focus to where it started.
  useEffect(() => {
    if (active) {
      prevFocusRef.current = (document.activeElement as HTMLElement) ?? null
    }
  }, [active])

  useEffect(() => {
    if (!active) return
    const t = setTimeout(
      () => dialogRef.current?.focus(),
      reducedMotion.current ? 0 : 320,
    )
    return () => clearTimeout(t)
  }, [active, idx])

  // Measure the coachmark's real height so placement can keep the WHOLE card
  // (including the Skip/Next footer) on-screen — otherwise a target near the
  // bottom edge (e.g. the Ask-Marina launcher) pushes the controls off-screen
  // and the tour looks un-dismissable.
  useLayoutEffect(() => {
    if (popRef.current) setPopH(popRef.current.offsetHeight)
  }, [active, idx, rect])

  const next = useCallback(() => {
    if (idx >= STEPS.length - 1) {
      finish()
    } else {
      setIdx((i) => i + 1)
    }
  }, [idx, finish])

  if (!mounted || !active) return null

  const step = STEPS[idx]
  const vw = typeof window !== 'undefined' ? window.innerWidth : 1280
  const vh = typeof window !== 'undefined' ? window.innerHeight : 800
  const isLast = idx === STEPS.length - 1
  const trans = reducedMotion.current ? 'none' : 'top 220ms ease, left 220ms ease, width 220ms ease, height 220ms ease'

  // Popover placement: centered for the final step; otherwise below the target
  // if it fits, else above, else pinned to the bottom edge. We compute an
  // explicit numeric top from the MEASURED height and hard-clamp it into the
  // viewport [16, vh - popH - 16], so the whole card (footer included) is
  // always reachable no matter where the target sits.
  let popStyle: React.CSSProperties
  if (!rect) {
    popStyle = {
      top: '50%',
      left: '50%',
      transform: 'translate(-50%, -50%)',
      width: POP_W,
    }
  } else {
    const left = Math.min(Math.max(rect.left, 16), Math.max(16, vw - POP_W - 16))
    const belowTop = rect.top + rect.height + 14
    const aboveTop = rect.top - 14 - popH
    const maxTop = Math.max(16, vh - popH - 16)
    let top: number
    if (belowTop <= maxTop) top = belowTop // fits below
    else if (aboveTop >= 16) top = aboveTop // fits above
    else top = maxTop // neither — pin to the bottom edge, fully visible
    top = Math.min(Math.max(top, 16), maxTop)
    popStyle = { top, left, width: POP_W }
  }

  return createPortal(
    <div
      ref={dialogRef}
      tabIndex={-1}
      className="fixed inset-0 z-[300]"
      role="dialog"
      aria-modal="true"
      aria-label="Marina’s product tour"
      aria-labelledby="marina-tour-title"
      aria-describedby="marina-tour-body"
      style={{ outline: 'none' }}
    >
      {/* Click-catcher: a non-semantic dimmer that blocks interaction with the
          page behind and advances on click. aria-hidden + not focusable so AT
          users get ONLY the real Skip/Next controls (no giant duplicate button). */}
      <div
        aria-hidden
        onClick={next}
        className="absolute inset-0 w-full h-full"
        style={{ background: rect ? 'transparent' : 'rgba(20,30,25,0.55)' }}
      />

      {/* Spotlight: a hole over the target, everything else dimmed via a huge
          box-shadow. pointer-events:none so it never eats clicks. */}
      {rect && (
        <div
          aria-hidden
          className="absolute pointer-events-none rounded-xl"
          style={{
            top: rect.top - PAD,
            left: rect.left - PAD,
            width: rect.width + PAD * 2,
            height: rect.height + PAD * 2,
            boxShadow: '0 0 0 9999px rgba(20,30,25,0.55)',
            outline: '2px solid var(--m-accent)',
            outlineOffset: 2,
            transition: trans,
          }}
        />
      )}

      {/* Marina coachmark */}
      <div
        ref={popRef}
        className="absolute rounded-2xl border border-[var(--m-border)] bg-white shadow-[var(--m-shadow-xl)] p-4"
        style={{ ...popStyle, transition: reducedMotion.current ? 'none' : 'top 220ms ease, left 220ms ease' }}
      >
        <div className="flex items-start gap-3">
          <MarinaMark size={34} className="shrink-0 mt-0.5" label="Marina" />
          <div className="min-w-0">
            <p id="marina-tour-title" className="text-[14px] font-semibold text-[var(--m-ink)] leading-snug">{step.title}</p>
            <p id="marina-tour-body" className="mt-1 text-[12.5px] leading-relaxed text-[var(--m-ink-2)]">{step.body}</p>
          </div>
        </div>

        <div className="mt-3.5 flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={finish}
            className="text-[12px] font-medium text-[var(--m-ink-4)] hover:text-[var(--m-ink-2)] transition"
          >
            {isLast ? 'Close' : 'Skip tour'}
          </button>
          <div className="flex items-center gap-2.5">
            <span className="text-[11px] tabular-nums text-[var(--m-ink-4)]">
              {idx + 1} / {STEPS.length}
            </span>
            <button type="button" onClick={next} className="btn-primary text-[12.5px] px-3.5 py-1.5">
              {isLast ? 'Done' : 'Next'}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  )
}
