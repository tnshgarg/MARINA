'use client'

import { useState } from 'react'

/**
 * Google Calendar connect/disconnect for the employee settings page.
 * Connect 302s through the OAuth start endpoint; sync + disconnect are POSTs.
 */
export function CalendarConnect({ connected, returnTo = '/settings' }: { connected: boolean; returnTo?: string }) {
  const [busy, setBusy] = useState<'sync' | 'disconnect' | null>(null)
  const [msg, setMsg] = useState<string | null>(null)

  async function call(path: string, kind: 'sync' | 'disconnect') {
    setBusy(kind)
    setMsg(null)
    try {
      const res = await fetch(path, { method: 'POST' })
      if (!res.ok) throw new Error('failed')
      if (kind === 'disconnect') {
        window.location.reload()
        return
      }
      setMsg('Synced ✓')
      setTimeout(() => setMsg(null), 2000)
    } catch {
      setMsg('Something went wrong')
    } finally {
      setBusy(null)
    }
  }

  if (!connected) {
    return (
      <a href={`/api/connect/google/start?return_to=${encodeURIComponent(returnTo)}`} className="btn-sage text-[13px] inline-flex">
        Connect Google Calendar
      </a>
    )
  }

  return (
    <div className="flex items-center gap-2 flex-wrap">
      <span className="pill pill-good">Connected</span>
      <button type="button" onClick={() => call('/api/me/calendar/sync', 'sync')} disabled={!!busy} className="btn-secondary text-[12.5px] disabled:opacity-50">
        {busy === 'sync' ? 'Syncing…' : 'Sync now'}
      </button>
      <button
        type="button"
        onClick={() => call('/api/me/calendar/disconnect', 'disconnect')}
        disabled={!!busy}
        className="btn-ghost text-[12.5px] !text-[var(--m-bad)] disabled:opacity-50"
      >
        {busy === 'disconnect' ? '…' : 'Disconnect'}
      </button>
      {msg && <span className="text-[12px] text-[var(--m-ink-3)]">{msg}</span>}
    </div>
  )
}
