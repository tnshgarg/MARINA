'use client'

import { useState } from 'react'
import { useToast } from '@/components/toast'

/**
 * Manager-side nudge for a stagnant pause. Hidden unless the pause is older
 * than the per-category threshold (lunch tolerates a longer break than focus).
 */
export function CheckInButton({
  orgId,
  breakId,
  startedAt,
  category,
  userName,
}: {
  orgId: number
  breakId: number
  startedAt: string
  category: string
  userName: string
}) {
  const toast = useToast()
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(false)

  const minsSince = Math.floor((Date.now() - new Date(startedAt).getTime()) / 60_000)
  // Threshold by category. Lunch and personal allow longer; focus/blocked/meeting/errand alert sooner.
  const threshold =
    category === 'lunch'    ? 90
    : category === 'personal' ? 90
    : category === 'errand'   ? 60
    : 45
  if (minsSince < threshold) return null

  async function ping() {
    setBusy(true)
    try {
      const res = await fetch(`/api/orgs/${orgId}/breaks/${breakId}/ping`, { method: 'POST' })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error((data as { error?: string })?.error || `HTTP ${res.status}`)
      setDone(true)
      toast.push({
        kind: 'success',
        title: `Checked in on ${userName}`,
        body: "They'll get a friendly nudge.",
      })
    } catch (e) {
      toast.push({
        kind: 'error',
        title: 'Check-in failed',
        body: e instanceof Error ? e.message : String(e),
      })
    } finally {
      setBusy(false)
    }
  }

  if (done) {
    return <span className="text-[11px] text-emerald-700 font-medium">Pinged</span>
  }

  return (
    <button
      type="button"
      onClick={ping}
      disabled={busy}
      className="px-2.5 py-1 rounded-md bg-white border border-amber-300 hover:bg-amber-50 text-amber-800 text-[11.5px] font-medium disabled:opacity-50 transition shrink-0"
    >
      {busy ? '…' : 'Check in'}
    </button>
  )
}
