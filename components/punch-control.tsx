'use client'

import { useState } from 'react'

/**
 * Web punch in/out — in the employee navbar. No desktop agent needed; a solo
 * employee tracks their own working time right here.
 */
export function PunchControl({ activeSince }: { activeSince: string | null }) {
  const [busy, setBusy] = useState(false)
  const onShift = !!activeSince

  async function go(action: 'in' | 'out') {
    setBusy(true)
    try {
      const res = await fetch('/api/me/punch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      })
      if (res.ok) window.location.reload()
      else setBusy(false)
    } catch {
      setBusy(false)
    }
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
          onClick={() => go('out')}
          disabled={busy}
          className="text-[12.5px] px-2.5 py-1.5 rounded-lg border border-[var(--m-border)] text-[var(--m-ink-2)] hover:border-[var(--m-clay)] hover:text-[var(--m-clay-deep)] transition-colors disabled:opacity-50"
        >
          {busy ? '…' : 'Punch out'}
        </button>
      </div>
    )
  }

  return (
    <button
      type="button"
      onClick={() => go('in')}
      disabled={busy}
      className="inline-flex items-center gap-1.5 text-[12.5px] px-3 py-1.5 rounded-lg bg-[var(--m-accent)] text-white hover:bg-[var(--m-accent-2)] font-medium transition-colors disabled:opacity-50"
    >
      <svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.4} aria-hidden>
        <path d="M5 3v18l15-9L5 3Z" strokeLinejoin="round" />
      </svg>
      {busy ? '…' : 'Punch in'}
    </button>
  )
}
