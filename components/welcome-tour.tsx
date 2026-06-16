'use client'

import { useState } from 'react'

type Props = {
  name: string
  orgId: number | null
  hasGitHub: boolean
  hasAgent: boolean
  hasActiveShift: boolean
  hasLeavesOrBreaks: boolean
  storyExists: boolean
  onOpenBreak: () => void
  onOpenLeave: () => void
  onRunSync: () => void
}

/**
 * Shows for new users (no shifts, no events, no story). Once any "real" data
 * lands the dashboard hides this and shows the actual story/today views.
 */
export function WelcomeTour({
  name,
  orgId,
  hasGitHub,
  hasAgent,
  hasActiveShift,
  hasLeavesOrBreaks,
  storyExists,
  onOpenBreak,
  onOpenLeave,
  onRunSync,
}: Props) {
  const [dismissed, setDismissed] = useState(false)

  // Don't show if user is dismissed OR clearly past first-run
  if (dismissed) return null
  const significantUse = hasActiveShift || storyExists || hasLeavesOrBreaks
  if (significantUse) return null

  const steps = [
    {
      id: 'agent',
      label: 'Install the desktop agent',
      done: hasAgent,
      cta: hasAgent ? null : {
        label: 'Get install instructions →',
        href: '/settings',
      },
      detail: 'Mac (Apple Silicon + Intel) or Windows. Required for punch in/out, breaks, and the AI story.',
    },
    {
      id: 'github',
      label: 'Connect GitHub',
      done: hasGitHub,
      cta: hasGitHub
        ? { label: 'Sync now', onClick: onRunSync }
        : null,
      detail: 'Pulls your commits, PRs, and reviews so MARINA can verify your work summaries.',
    },
    {
      id: 'punch',
      label: 'Punch in to start your shift',
      done: hasActiveShift,
      cta: null,
      detail: 'Open the MARINA tray icon and click "Punch in for today." Tracking only runs while you\'re on shift.',
    },
    {
      id: 'break',
      label: 'Try a break or a leave request',
      done: hasLeavesOrBreaks,
      cta: orgId
        ? {
            label: 'Request leave →',
            onClick: onOpenLeave,
          }
        : null,
      detail: 'Or click "Take a break" from the tray. Your manager sees the reason in real time.',
    },
  ]

  const completed = steps.filter((s) => s.done).length

  return (
    <section className="relative overflow-hidden rounded-3xl border border-[var(--m-accent)]/20 bg-gradient-to-br from-[var(--m-accent-soft)] via-white to-pink-50 p-6 sm:p-8">
      {/* Decorative blob */}
      <div
        className="absolute -top-20 -right-20 w-72 h-72 rounded-full pointer-events-none opacity-40 blur-3xl"
        style={{ background: 'radial-gradient(circle, rgba(139,92,246,0.4), transparent 70%)' }}
      />

      <button
        onClick={() => setDismissed(true)}
        className="absolute top-4 right-4 text-[var(--m-ink-4)] hover:text-[var(--m-ink-2)] text-[14px] transition"
        aria-label="Dismiss welcome"
        title="Dismiss"
      >
        ✕
      </button>

      <div className="relative">
        <div className="flex items-baseline gap-2 mb-1">
          <span className="text-[12px] font-semibold uppercase tracking-widest text-[var(--m-accent)]">
            Welcome
          </span>
          <span className="text-[11px] text-[var(--m-ink-3)] tabular">
            {completed}/{steps.length} done
          </span>
        </div>
        <h2 className="text-[24px] font-semibold tracking-tight text-[var(--m-ink)]">
          {firstWord(name)}, let&apos;s get you set up. 👋
        </h2>
        <p className="mt-2 text-[14px] text-[var(--m-ink-2)] max-w-xl">
          MARINA combines work signals from GitHub + your desktop into an honest story of your day.
          Three minutes to set up. Then you&apos;ll never write a status update again.
        </p>

        {/* Progress bar */}
        <div className="mt-5 h-1.5 rounded-full bg-[var(--m-bg-soft)] overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-[var(--m-accent)] via-[var(--m-clay)] to-[var(--m-gold)] transition-all duration-700 ease-out"
            style={{ width: `${(completed / steps.length) * 100}%` }}
          />
        </div>

        {/* Steps */}
        <ol className="mt-6 space-y-3">
          {steps.map((s, i) => (
            <li key={s.id} className="group flex items-start gap-3">
              <div
                className={`mt-0.5 flex-shrink-0 w-7 h-7 rounded-full inline-flex items-center justify-center text-[12px] font-semibold border transition-colors ${
                  s.done
                    ? 'bg-emerald-500 text-white border-emerald-500'
                    : 'bg-white text-[var(--m-ink-3)] border-[var(--m-border)]'
                }`}
              >
                {s.done ? '✓' : i + 1}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <p className={`text-[14px] font-medium ${s.done ? 'text-[var(--m-ink-3)] line-through' : 'text-[var(--m-ink)]'}`}>
                    {s.label}
                  </p>
                  {s.cta && !s.done && (
                    <CtaButton cta={s.cta} />
                  )}
                </div>
                <p className="text-[12px] text-[var(--m-ink-2)] mt-0.5">{s.detail}</p>
              </div>
            </li>
          ))}
        </ol>

        {/* Quick actions row */}
        <div className="mt-6 grid sm:grid-cols-3 gap-3">
          <QuickAction
            emoji="☕"
            label="Take a break"
            sub="Tell your team why"
            onClick={onOpenBreak}
            disabled={!orgId}
          />
          <QuickAction
            emoji="🌴"
            label="Request leave"
            sub="Pick dates & reason"
            onClick={onOpenLeave}
            disabled={!orgId}
          />
          <QuickAction
            emoji="🔄"
            label="Sync GitHub"
            sub="Pull last 7 days"
            onClick={onRunSync}
            disabled={!hasGitHub}
          />
        </div>
      </div>
    </section>
  )
}

function CtaButton({ cta }: { cta: { label: string; href?: string; onClick?: () => void } }) {
  if (cta.href) {
    return (
      <a
        href={cta.href}
        className="text-[12px] font-medium text-[var(--m-accent)] hover:text-[var(--m-accent-2)] inline-flex items-center gap-1 transition"
      >
        {cta.label}
      </a>
    )
  }
  return (
    <button
      onClick={cta.onClick}
      className="text-[12px] font-medium text-[var(--m-accent)] hover:text-[var(--m-accent-2)] inline-flex items-center gap-1 transition"
    >
      {cta.label}
    </button>
  )
}

function QuickAction({
  emoji,
  label,
  sub,
  onClick,
  disabled,
}: {
  emoji: string
  label: string
  sub: string
  onClick: () => void
  disabled?: boolean
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="group rounded-2xl border border-[var(--m-border)] bg-white p-4 text-left hover:border-[var(--m-accent)]/40 hover:shadow-md hover:-translate-y-0.5 transition-all disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:translate-y-0 disabled:hover:shadow-none"
    >
      <div className="text-[24px] mb-1.5">{emoji}</div>
      <p className="text-[13px] font-medium text-[var(--m-ink)]">{label}</p>
      <p className="text-[11px] text-[var(--m-ink-3)]">{sub}</p>
    </button>
  )
}

function firstWord(s: string): string {
  return s.split(/\s+/)[0] || s
}
