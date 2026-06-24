'use client'

import { useEffect, useState } from 'react'

const KEY = 'marina:pin-tab:dismissed'

/** A one-time nudge to pin the tab so Marina is always one click away. */
export function PinTabHint() {
  const [show, setShow] = useState(false)
  useEffect(() => {
    try {
      setShow(localStorage.getItem(KEY) !== '1')
    } catch {
      /* storage unavailable */
    }
  }, [])
  if (!show) return null

  function dismiss() {
    try {
      localStorage.setItem(KEY, '1')
    } catch {
      /* ignore */
    }
    setShow(false)
  }

  return (
    <div className="mb-4 rounded-xl border border-[var(--m-accent)]/25 bg-[var(--m-accent-soft)]/50 px-4 py-2.5 flex items-center gap-3">
      <span className="text-[16px] leading-none">📌</span>
      <p className="text-[13px] text-[var(--m-ink-2)] flex-1 min-w-0">
        <span className="font-semibold text-[var(--m-ink)]">Pin this tab</span> so Marina is always one click away —
        right-click the browser tab → <span className="font-medium">Pin</span>.
      </p>
      <button type="button" onClick={dismiss} className="shrink-0 text-[12px] text-[var(--m-ink-4)] hover:text-[var(--m-ink-2)]">
        Got it
      </button>
    </div>
  )
}
