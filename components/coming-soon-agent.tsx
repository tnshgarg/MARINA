'use client'

import { useSyncExternalStore, useCallback } from 'react'

/**
 * Dismissible "Marina desktop agent — Coming soon" card. The agent is on hold,
 * so instead of pushing a download we tease it. Dismissal persists in
 * localStorage so it doesn't nag. Replaces the old DownloadAgent card on the
 * employee + manager dashboards while everyone punches from the web.
 */

const KEY = 'marina:agent-comingsoon-dismissed'
const listeners = new Set<() => void>()

function read(): boolean {
  if (typeof window === 'undefined') return false
  try {
    return window.localStorage.getItem(KEY) === '1'
  } catch {
    return false
  }
}
function subscribe(cb: () => void): () => void {
  listeners.add(cb)
  const onStorage = (e: StorageEvent) => {
    if (e.key === KEY) cb()
  }
  if (typeof window !== 'undefined') window.addEventListener('storage', onStorage)
  return () => {
    listeners.delete(cb)
    if (typeof window !== 'undefined') window.removeEventListener('storage', onStorage)
  }
}
function dismissNow(): void {
  try {
    window.localStorage.setItem(KEY, '1')
  } catch {
    /* ignore */
  }
  for (const cb of listeners) cb()
}

export function ComingSoonAgent({ variant = 'employee' }: { variant?: 'employee' | 'manager' }) {
  const dismissed = useSyncExternalStore(subscribe, read, () => false)
  const dismiss = useCallback(() => dismissNow(), [])
  if (dismissed) return null

  const copy =
    variant === 'manager'
      ? 'The Marina desktop agent adds automatic activity & focus tracking for your team. It’s in the works — for now everyone punches in from the web.'
      : 'The Marina desktop agent will track your focus time automatically — no manual punching. It’s on the way. For now, punch in/out right here from the web.'

  return (
    <div className="app-card relative overflow-hidden border border-[var(--m-border)] bg-gradient-to-br from-[var(--m-accent-soft)] to-white p-4 sm:p-5">
      <button
        type="button"
        onClick={dismiss}
        aria-label="Dismiss"
        className="absolute top-2.5 right-2.5 w-7 h-7 inline-flex items-center justify-center rounded-md text-[var(--m-ink-4)] hover:text-[var(--m-ink-2)] hover:bg-white/70 transition"
      >
        <svg width={15} height={15} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden>
          <path d="M6 6l12 12M18 6L6 18" strokeLinecap="round" />
        </svg>
      </button>
      <div className="flex items-start gap-3.5 pr-6">
        <span className="shrink-0 w-10 h-10 rounded-xl bg-white border border-[var(--m-border)] inline-flex items-center justify-center text-[var(--m-accent-2)]">
          <svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} aria-hidden>
            <rect x="2.5" y="4" width="19" height="13" rx="2" />
            <path d="M8 21h8M12 17v4" strokeLinecap="round" />
          </svg>
        </span>
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="text-[14px] font-semibold text-[var(--m-ink)]">Marina desktop agent</p>
            <span className="text-[10.5px] uppercase tracking-wider font-semibold px-1.5 py-0.5 rounded bg-[var(--m-accent)] text-white">
              Coming soon
            </span>
          </div>
          <p className="mt-1 text-[12.5px] text-[var(--m-ink-3)] leading-relaxed">{copy}</p>
        </div>
      </div>
    </div>
  )
}
