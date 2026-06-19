'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'

export type OnboardingStep = {
  key: string
  done: boolean
  title: string
  body: string
  cta: string
  href: string
  external?: boolean
}

const HIDE_KEY = 'marina:onboarding:hidden'

/**
 * Employee setup checklist on the dashboard. Each step auto-completes from real
 * state (paired agent, Slack link, GitHub username), the card disappears once
 * everything's done, and "Hide" dismisses it for people who don't need it.
 * The same steps live in the Help section, so hiding never loses the guidance.
 */
export function EmployeeOnboarding({ steps }: { steps: OnboardingStep[] }) {
  const [hidden, setHidden] = useState(false)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    try {
      setHidden(localStorage.getItem(HIDE_KEY) === '1')
    } catch {
      /* storage unavailable */
    }
    setReady(true)
  }, [])

  const done = steps.filter((s) => s.done).length
  const total = steps.length
  if (total === 0 || done >= total) return null
  if (ready && hidden) return null

  function hide() {
    try {
      localStorage.setItem(HIDE_KEY, '1')
    } catch {
      /* ignore */
    }
    setHidden(true)
  }

  return (
    <div className="max-w-6xl mx-auto px-3 sm:px-6 pt-3 sm:pt-4">
      <section className="rounded-2xl border border-[var(--m-border)] bg-white p-5 shadow-sm">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[15px] font-semibold text-[var(--m-ink)]">Get the most out of Marina</p>
            <p className="text-[12.5px] text-[var(--m-ink-3)] mt-0.5">
              A couple of quick steps to set yourself up — {done} of {total} done.
            </p>
          </div>
          <button
            type="button"
            onClick={hide}
            className="text-[12px] text-[var(--m-ink-4)] hover:text-[var(--m-ink-2)] shrink-0"
          >
            Hide
          </button>
        </div>

        <div className="mt-3 h-1.5 rounded-full bg-[var(--m-bg-soft)] overflow-hidden">
          <div
            className="h-full rounded-full bg-[var(--m-accent)] transition-all"
            style={{ width: `${Math.round((done / total) * 100)}%` }}
          />
        </div>

        <ol className="mt-4 space-y-3">
          {steps.map((s, i) => (
            <li key={s.key} className="flex items-start gap-3">
              <span
                className={`shrink-0 mt-0.5 w-5 h-5 rounded-full flex items-center justify-center text-[11px] font-semibold ${
                  s.done
                    ? 'bg-[var(--m-good-soft)] text-[var(--m-good)]'
                    : 'bg-[var(--m-accent-soft)] text-[var(--m-accent)]'
                }`}
              >
                {s.done ? '✓' : i + 1}
              </span>
              <div className="min-w-0 flex-1">
                <p
                  className={`text-[13.5px] font-medium ${
                    s.done ? 'text-[var(--m-ink-4)] line-through' : 'text-[var(--m-ink)]'
                  }`}
                >
                  {s.title}
                </p>
                {!s.done && <p className="text-[12px] text-[var(--m-ink-3)] mt-0.5 leading-snug">{s.body}</p>}
              </div>
              {!s.done &&
                (s.external ? (
                  <a href={s.href} target="_blank" rel="noreferrer" className="btn-sage text-[12px] shrink-0">
                    {s.cta}
                  </a>
                ) : (
                  <Link href={s.href} className="btn-sage text-[12px] shrink-0">
                    {s.cta}
                  </Link>
                ))}
            </li>
          ))}
        </ol>
      </section>
    </div>
  )
}
