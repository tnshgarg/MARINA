'use client'

import { useEffect, useState } from 'react'

/**
 * Animated Team Pulse mockup that lives on the landing hero.
 *
 * Why this exists: a static mockup tells visitors "we made a screenshot",
 * not "this is a live product". By cycling through 4 plausible moments of a
 * real morning we let them feel the rhythm of the dashboard:
 *
 *   1. 9:12 AM — quiet, two teammates blocked, mostly shipping
 *   2. 9:14 AM — a new blocker arrives (counter ticks up, card slides in)
 *   3. 9:18 AM — manager nudges, one blocker resolves (counter ticks down)
 *   4. 9:32 AM — sales call wraps, focus bar grows on the design card
 *
 * The cycle takes ~12 seconds total. We use opacity + transform transitions
 * so nothing pops; the live dot in the chrome stays pinging the whole time
 * to anchor the "this is happening right now" feeling.
 *
 * Implementation note: we avoid `Math.random` and `Date.now` so this can
 * be safely rendered without hydration warnings — every change is driven
 * by a state index that flips on a timer.
 */
export function HeroPreview() {
  const [step, setStep] = useState(0)

  useEffect(() => {
    const id = setInterval(() => setStep((s) => (s + 1) % 4), 3200)
    return () => clearInterval(id)
  }, [])

  // Per-step state — every screen the dashboard might show.
  // Step 0: quiet morning. 1 blocker, 6 shipping, 1 on leave.
  // Step 1: new blocker arrives. 2 blockers, 6 shipping, 1 on leave.
  // Step 2: manager resolves it. 1 blocker, 7 shipping, 1 on leave.
  // Step 3: focus deepens; Vikram wraps the call. Stats hold.
  const state = [
    { blocked: 1, shipping: 6, leave: 1, anikaPct: 52, blockerCount: 1, vikramLine: 'On a customer call · Zoom', vikramTag: 'In meeting', vikramTone: 'info' as const },
    { blocked: 2, shipping: 6, leave: 1, anikaPct: 58, blockerCount: 2, vikramLine: 'On a customer call · Zoom', vikramTag: 'In meeting', vikramTone: 'info' as const },
    { blocked: 1, shipping: 7, leave: 1, anikaPct: 64, blockerCount: 1, vikramLine: 'Logging call notes · Notion', vikramTag: 'Working', vikramTone: 'good' as const },
    { blocked: 1, shipping: 7, leave: 1, anikaPct: 71, blockerCount: 1, vikramLine: 'Replied to 4 Slack threads', vikramTag: 'Working', vikramTone: 'good' as const },
  ][step]

  const tickerTimes = ['9:12 AM', '9:14 AM', '9:18 AM', '9:32 AM']

  return (
    <div className="relative">
      <div
        className="absolute -inset-6 rounded-[28px] -z-10 m-float"
        style={{
          background:
            'linear-gradient(135deg, rgba(63,107,84,0.12) 0%, rgba(196,123,86,0.08) 50%, rgba(193,154,77,0.10) 100%)',
        }}
      />
      <div className="absolute inset-0 translate-x-3 translate-y-4 rounded-[20px] bg-[var(--m-bg-soft)] border border-[var(--m-border)] -z-10" />

      <div className="relative rounded-[20px] bg-white border border-[var(--m-border)] shadow-[var(--m-shadow-xl)] p-5">
        {/* Mock chrome */}
        <div className="flex items-center gap-1.5 mb-4">
          <span className="w-2.5 h-2.5 rounded-full bg-[#e5e0d4]" />
          <span className="w-2.5 h-2.5 rounded-full bg-[#e5e0d4]" />
          <span className="w-2.5 h-2.5 rounded-full bg-[#e5e0d4]" />
          <span className="ml-3 text-[10.5px] tracking-wider uppercase text-[var(--m-ink-4)]">
            Team Pulse
          </span>
          <span className="ml-auto inline-flex items-center gap-1 text-[10px] text-[var(--m-good)] font-medium">
            <span className="relative inline-flex">
              <span className="absolute inset-0 rounded-full bg-[var(--m-good)]/40 animate-ping" />
              <span className="relative inline-block w-1.5 h-1.5 rounded-full bg-[var(--m-good)]" />
            </span>
            live · <span className="tabular-nums text-[var(--m-ink-4)]">{tickerTimes[step]}</span>
          </span>
        </div>

        {/* Greeting */}
        <p className="font-display text-[18px] text-[var(--m-ink)] leading-tight">
          Good morning, Tanish
        </p>
        <p className="text-[11.5px] text-[var(--m-ink-3)] mt-0.5 transition-opacity duration-500">
          {state.blocked === 1
            ? '1 blocker · most of the team is shipping'
            : `${state.blocked} blockers in the last hour · check in`}
        </p>

        {/* Inline stats */}
        <div className="flex items-baseline gap-6 mt-4 pb-4 border-b border-[var(--m-border-soft)]">
          <Stat n={state.blocked} label="blocked" tone="bad" />
          <Stat n={state.shipping} label="shipping" tone="good" />
          <Stat n={state.leave} label="on leave" tone="warn" />
        </div>

        {/* Blocker card — animates in/out based on count */}
        <div
          className={`mt-4 rounded-lg border border-[#f1d5d6] bg-[#fbf2f2]/60 p-3 relative overflow-hidden transition-all duration-500 ${
            state.blockerCount > 0 ? 'opacity-100 max-h-40' : 'opacity-0 max-h-0 p-0 mt-0 border-0'
          }`}
        >
          <div className="flex items-center justify-between">
            <p className="text-[11px] tracking-wider uppercase text-[var(--m-bad)] font-semibold flex items-center gap-1.5">
              <span className="relative inline-flex">
                <span className="absolute inset-0 rounded-full bg-[var(--m-bad)]/40 animate-ping" />
                <span className="relative inline-block w-1.5 h-1.5 rounded-full bg-[var(--m-bad)]" />
              </span>
              Active blocker
              {state.blockerCount > 1 && (
                <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-[var(--m-bad)] text-white">
                  +1 new
                </span>
              )}
            </p>
            <span className="text-[10.5px] text-[var(--m-bad)] tabular-nums font-medium">
              {step === 1 ? '2 min' : step === 2 ? '47 min · nudged' : '47 min'}
            </span>
          </div>
          <p className="mt-1.5 text-[13px] text-[var(--m-ink)]">
            <span className="font-medium">Priya</span>
            <span className="text-[var(--m-ink-3)]"> waiting on </span>
            <span className="font-medium">@arjun</span>
          </p>
          <p className="text-[11.5px] text-[var(--m-ink-3)] mt-0.5">
            Brand review pending sign-off · marketing
          </p>
        </div>

        {/* Member row — designer; focus bar grows over time */}
        <div className="mt-3 rounded-lg border border-[var(--m-border)] bg-white p-3">
          <div className="flex items-center gap-3 mb-2">
            <span className="inline-flex w-8 h-8 rounded-md bg-[var(--m-clay-soft)] items-center justify-center text-[var(--m-clay-deep)] text-[11.5px] font-semibold">
              A
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-[12.5px] font-medium text-[var(--m-ink)] truncate flex items-center gap-1.5 flex-wrap">
                Anika Roy
                <span className="text-[10px] text-[var(--m-ink-4)] uppercase tracking-wider">Design</span>
                <span className="ml-1 inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-[var(--m-good-soft)] text-[var(--m-good)]">
                  <span className="inline-block w-1 h-1 rounded-full bg-[var(--m-good)]" />
                  Working
                </span>
              </p>
            </div>
          </div>
          <p className="text-[11.5px] text-[var(--m-ink-2)] mb-1.5 flex items-center gap-1.5">
            <span className="relative inline-flex">
              <span className="absolute inset-0 rounded-full bg-[var(--m-good)]/40 animate-ping" />
              <span className="relative inline-block w-1.5 h-1.5 rounded-full bg-[var(--m-good)]" />
            </span>
            <span className="text-[var(--m-ink-3)]">Right now</span>
            <svg width={11} height={11} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className="text-[var(--m-accent)]">
              <path d="M8 8l-4 4 4 4M16 8l4 4-4 4" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <span className="font-medium truncate">Designing onboarding screens</span>
          </p>
          <div className="h-1 rounded-full overflow-hidden flex bg-[var(--m-bg-soft)]">
            <div
              className="h-full bg-[var(--m-accent)] transition-all duration-700 ease-out"
              style={{ width: `${state.anikaPct}%` }}
            />
            <div className="h-full bg-[var(--m-ink-5)]" style={{ width: '22%' }} />
          </div>
        </div>

        {/* Sales row — call wraps, label changes */}
        <div className="mt-2.5 rounded-lg border border-[var(--m-border)] bg-white p-2.5 flex items-center gap-3">
          <span className="inline-flex w-7 h-7 rounded-md bg-[var(--m-info-soft)] items-center justify-center text-[var(--m-info)] text-[11px] font-semibold">
            V
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-[12px] font-medium text-[var(--m-ink)] truncate flex items-center gap-1.5">
              Vikram Shah
              <span className="text-[9.5px] text-[var(--m-ink-4)] uppercase tracking-wider">Sales</span>
            </p>
            <p className="text-[10.5px] text-[var(--m-ink-3)] truncate transition-opacity duration-500">
              {state.vikramLine}
            </p>
          </div>
          <span
            className={`shrink-0 text-[10px] font-medium px-1.5 py-0.5 rounded-full transition-colors duration-500 ${
              state.vikramTone === 'good'
                ? 'bg-[var(--m-good-soft)] text-[var(--m-good)]'
                : 'bg-[var(--m-info-soft)] text-[var(--m-info)]'
            }`}
          >
            {state.vikramTag}
          </span>
        </div>

        <p className="mt-3 text-[10.5px] text-[var(--m-ink-4)] text-center">
          Live preview · re-renders every 45 seconds in the real app
        </p>
      </div>
    </div>
  )
}

function Stat({ n, label, tone }: { n: number; label: string; tone: 'good' | 'bad' | 'warn' }) {
  const colorClass =
    tone === 'good'
      ? 'text-[var(--m-good)]'
      : tone === 'bad'
        ? 'text-[var(--m-bad)]'
        : 'text-[var(--m-warn)]'
  return (
    <div className="flex items-baseline gap-1.5">
      <span
        key={n}
        className={`text-[22px] font-semibold tabular-nums tracking-tight ${colorClass} inline-block animate-[fadeUp_0.4s_ease-out]`}
      >
        {n}
      </span>
      <span className="text-[11.5px] text-[var(--m-ink-3)]">{label}</span>
    </div>
  )
}
