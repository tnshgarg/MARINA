'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'

type Phase = 'init' | 'gate' | 'pressing' | 'flying' | 'skipping' | 'done'

/**
 * The daily punch-in ritual. On entering the dashboard (once per day, when not
 * already on the clock) a calm full-screen prompt — on the same cream paper as
 * the dashboard it reveals, so the transition feels continuous — asks the
 * employee to start their day. The button is a chunky, tactile "press onto a
 * ledge" control (Duolingo-style); pressing it plays a satisfying compress,
 * then the button shrinks and flies up toward the navbar punch control — a
 * single "you're in, the clock started" motion. Stored per-day, so it's a
 * once-a-morning moment, not a nag.
 */
export function PunchGate({ active, name }: { active: boolean; name?: string }) {
  const router = useRouter()
  const [phase, setPhase] = useState<Phase>('init')

  function dayKey() {
    return `marina:punchgate:${new Date().toISOString().slice(0, 10)}`
  }
  function markDone() {
    try {
      localStorage.setItem(dayKey(), 'done')
    } catch {
      /* storage unavailable */
    }
  }

  useEffect(() => {
    if (active) {
      setPhase('done')
      return
    }
    let already = false
    try {
      already = localStorage.getItem(dayKey()) === 'done'
    } catch {
      /* ignore */
    }
    setPhase(already ? 'done' : 'gate')
  }, [active])

  function punchIn() {
    if (phase !== 'gate') return
    setPhase('pressing')
    // Fire the punch during the press; it resolves while the button flies.
    void fetch('/api/me/punch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'in' }),
    }).catch(() => {})
    window.setTimeout(() => {
      markDone()
      setPhase('flying')
      window.setTimeout(() => {
        setPhase('done')
        router.refresh() // navbar now shows "Working · 0m"
      }, 820)
    }, 380)
  }

  function skip() {
    if (phase !== 'gate') return
    markDone()
    setPhase('skipping')
    window.setTimeout(() => setPhase('done'), 440)
  }

  if (phase === 'init' || phase === 'done') return null

  const leaving = phase === 'flying' || phase === 'skipping'
  const flying = phase === 'flying'
  const pressing = phase === 'pressing'

  const greeting = (() => {
    const h = new Date().getHours()
    if (h < 12) return 'Good morning'
    if (h < 17) return 'Good afternoon'
    return 'Good evening'
  })()
  const today = new Date().toLocaleDateString(undefined, {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  })
  const firstName = name?.split(' ')[0]?.trim() ?? ''

  return (
    <div
      className="fixed inset-0 z-[100] flex flex-col items-center justify-center px-6 transition-all duration-500"
      style={{
        background: 'var(--m-bg)',
        opacity: leaving ? 0 : 1,
        pointerEvents: leaving ? 'none' : 'auto',
      }}
    >
      {/* Ambient brand glow — same warm sage wash as the marketing surfaces, so
          this reads as part of the product, not a separate flat screen. */}
      <div aria-hidden className="absolute inset-0 overflow-hidden pointer-events-none">
        <div
          className="absolute left-1/2 top-[30%] -translate-x-1/2 -translate-y-1/2 w-[820px] h-[820px] rounded-full blur-3xl opacity-90"
          style={{
            background:
              'radial-gradient(circle at 50% 50%, rgba(63,107,84,0.14), transparent 62%), radial-gradient(circle at 70% 30%, rgba(196,123,86,0.08), transparent 60%)',
          }}
        />
      </div>

      <style>{`
        @keyframes mg-halo { 0%,100%{transform:scale(1);opacity:.55} 50%{transform:scale(1.16);opacity:.12} }
        @keyframes mg-in { from{opacity:0;transform:translateY(12px)} to{opacity:1;transform:translateY(0)} }
        .mg-btn {
          box-shadow: 0 9px 0 0 #2f5240, 0 22px 34px -10px rgba(31,61,44,0.45);
          transition: transform 150ms cubic-bezier(.34,1.56,.64,1), box-shadow 150ms ease;
        }
        .mg-btn:hover { transform: translateY(-2px); box-shadow: 0 11px 0 0 #2f5240, 0 26px 40px -12px rgba(31,61,44,0.5); }
        .mg-btn:active { transform: translateY(9px); box-shadow: 0 1px 0 0 #2f5240, 0 8px 14px -6px rgba(31,61,44,0.4); }
        @media (prefers-reduced-motion: reduce) { .mg-halo-el { animation: none !important; } }
      `}</style>

      {/* Brand presence */}
      <div
        className="absolute top-7 left-1/2 -translate-x-1/2 flex items-center gap-2"
        style={{ opacity: leaving ? 0 : 1, transition: 'opacity 300ms', animation: 'mg-in 500ms ease both' }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logo.svg" width={22} height={22} alt="" aria-hidden className="block object-contain" />
        <span className="font-display text-[16px] tracking-tight text-[var(--m-ink)]">MARINA</span>
      </div>

      {/* Fly wrapper — the whole composition lifts + shrinks toward the navbar
          on punch-in. */}
      <div
        className="relative flex flex-col items-center"
        style={{
          transition: 'transform 820ms cubic-bezier(.5,0,.15,1)',
          transform: flying ? 'translateY(-43vh) scale(0.1)' : 'translateY(0) scale(1)',
        }}
      >
        <p
          className="text-[11px] tracking-[0.2em] uppercase text-[var(--m-ink-4)] font-semibold mb-2"
          style={{ opacity: flying ? 0 : 1, transition: 'opacity 200ms', animation: 'mg-in 500ms 60ms ease both' }}
        >
          {today}
        </p>
        {firstName && (
          <h1
            className="font-display text-[30px] sm:text-[36px] tracking-tight text-[var(--m-ink)] mb-9 text-center"
            style={{ opacity: flying ? 0 : 1, transition: 'opacity 200ms', animation: 'mg-in 500ms 120ms ease both' }}
          >
            {greeting}, {firstName}
          </h1>
        )}

        {/* The button — a sage disc that presses down onto its own darker ledge. */}
        <div className="relative" style={{ animation: 'mg-in 500ms 200ms ease both' }}>
          {!pressing && !flying && (
            <span
              aria-hidden
              className="mg-halo-el absolute -inset-6 rounded-full"
              style={{
                background: 'radial-gradient(circle, var(--m-accent) 0%, transparent 68%)',
                animation: 'mg-halo 2.8s ease-in-out infinite',
              }}
            />
          )}
          <button
            type="button"
            onClick={punchIn}
            aria-label="Punch in to start your day"
            className="mg-btn group relative w-36 h-36 sm:w-40 sm:h-40 rounded-full flex items-center justify-center select-none focus:outline-none focus-visible:ring-4 focus-visible:ring-[var(--m-accent)]/40"
            style={{
              background: 'linear-gradient(180deg, #4d8064 0%, #3f6b54 100%)',
              // While held during the punch sequence, keep it visibly compressed.
              ...(pressing
                ? {
                    transform: 'translateY(9px)',
                    boxShadow: '0 1px 0 0 #2f5240, 0 8px 14px -6px rgba(31,61,44,0.4)',
                  }
                : {}),
            }}
          >
            {/* Inner bevel ring for depth */}
            <span aria-hidden className="absolute inset-[9px] rounded-full border border-white/15" />
            <span
              aria-hidden
              className="absolute inset-0 rounded-full"
              style={{ background: 'radial-gradient(circle at 50% 28%, rgba(255,255,255,0.22), transparent 60%)' }}
            />
            <svg
              width={58}
              height={58}
              viewBox="0 0 24 24"
              fill="none"
              stroke="white"
              strokeWidth={2.1}
              aria-hidden
              className="relative"
              style={{ filter: 'drop-shadow(0 1px 1px rgba(0,0,0,0.18))' }}
            >
              <path d="M12 3.5v8" strokeLinecap="round" />
              <path d="M6.8 6.8a7.5 7.5 0 1 0 10.4 0" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        <div className="mt-10 text-center" style={{ opacity: flying ? 0 : 1, transition: 'opacity 200ms' }}>
          <p className="font-display text-[24px] sm:text-[26px] text-[var(--m-ink)] leading-tight">
            Punch in to start your day
          </p>
          <p className="mt-1.5 text-[13.5px] text-[var(--m-ink-3)] max-w-xs mx-auto leading-relaxed">
            Marina starts the clock — your hours stay private to you.
          </p>
          <button
            type="button"
            onClick={skip}
            className="mt-5 text-[13px] font-medium text-[var(--m-ink-4)] hover:text-[var(--m-ink-2)] px-4 py-2 rounded-lg hover:bg-[var(--m-bg-soft)] transition-colors"
          >
            Skip for today
          </button>
        </div>
      </div>
    </div>
  )
}
