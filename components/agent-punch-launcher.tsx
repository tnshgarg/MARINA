'use client'

import { useState } from 'react'

/**
 * Web → desktop-agent punch launcher. Shown in the employee navbar when the
 * org uses the Marina agent. Clicking does NOT punch in the browser — it hands
 * off to the desktop agent via the `marina://` deep link so activity tracking
 * stays on. If the agent isn't installed yet, we route the user to the
 * download card instead. This is how "punch from the web" still funnels
 * everyone through the agent.
 */
export function AgentPunchLauncher({
  paired,
  activeSince,
}: {
  paired: boolean
  activeSince: string | null
}) {
  const [opening, setOpening] = useState(false)
  const onShift = !!activeSince

  function openAgent(action: 'in' | 'out') {
    setOpening(true)
    // Best-effort deep link. If the protocol is registered (agent installed),
    // the OS hands this to Marina. We can't observe success from the browser,
    // so we just show a transient hint and let the agent take over.
    window.location.href = `marina://punch/${action}`
    setTimeout(() => setOpening(false), 4000)
  }

  // Not installed yet → point them at the download card on this page.
  if (!paired) {
    return (
      <a
        href="#agent-download"
        className="inline-flex items-center gap-1.5 text-[12.5px] px-3 py-1.5 rounded-lg bg-[var(--m-accent)] text-white hover:bg-[var(--m-accent-2)] font-medium transition-colors"
      >
        <svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.4} aria-hidden>
          <path d="M5 3v18l15-9L5 3Z" strokeLinejoin="round" />
        </svg>
        Punch in
      </a>
    )
  }

  if (onShift) {
    const mins = Math.max(0, Math.round((Date.now() - new Date(activeSince!).getTime()) / 60000))
    const h = Math.floor(mins / 60)
    const label = h > 0 ? `${h}h ${mins % 60}m` : `${mins}m`
    return (
      <div className="flex items-center gap-2">
        <span className="hidden sm:inline-flex items-center gap-1.5 text-[12px] text-[var(--m-good)] font-medium">
          <span className="relative inline-flex">
            <span className="absolute inset-0 rounded-full bg-[var(--m-good)]/40 animate-ping" />
            <span className="relative inline-block w-1.5 h-1.5 rounded-full bg-[var(--m-good)]" />
          </span>
          Working · {label}
        </span>
        <button
          type="button"
          onClick={() => openAgent('out')}
          disabled={opening}
          className="text-[12.5px] px-2.5 py-1.5 rounded-lg border border-[var(--m-border)] text-[var(--m-ink-2)] hover:border-[var(--m-clay)] hover:text-[var(--m-clay-deep)] transition-colors disabled:opacity-50"
        >
          {opening ? 'Opening…' : 'Punch out'}
        </button>
      </div>
    )
  }

  return (
    <button
      type="button"
      onClick={() => openAgent('in')}
      disabled={opening}
      className="inline-flex items-center gap-1.5 text-[12.5px] px-3 py-1.5 rounded-lg bg-[var(--m-accent)] text-white hover:bg-[var(--m-accent-2)] font-medium transition-colors disabled:opacity-50"
    >
      <svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.4} aria-hidden>
        <path d="M5 3v18l15-9L5 3Z" strokeLinejoin="round" />
      </svg>
      {opening ? 'Opening Marina…' : 'Punch in'}
    </button>
  )
}
