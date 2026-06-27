'use client'

import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { useRouter } from 'next/navigation'
import { useToast } from '@/components/toast'

export type Sentiment = 'great' | 'ok' | 'concern'

const SENTIMENT_OPTIONS: { key: Sentiment; label: string; hint: string }[] = [
  { key: 'great', label: '😀 Great', hint: 'Energised, on track' },
  { key: 'ok', label: '😐 OK', hint: 'Steady, nothing pressing' },
  { key: 'concern', label: '😟 Concern', hint: 'Needs follow-up' },
]

/**
 * Manager dialog to debrief a past 1:1: notes, a coarse sentiment, and a
 * short action-item list. Saving marks the meeting completed. Posts to
 * POST /api/orgs/[orgId]/one-on-ones/[meetingId]/log and refreshes the page.
 *
 * Reused across the reviews/cadence surface — open it for whichever meeting
 * the manager wants to log.
 */
export function OneOnOneLogDialog({
  open,
  onClose,
  orgId,
  meetingId,
  reportName,
  meetingTitle,
  initial,
}: {
  open: boolean
  onClose: () => void
  orgId: number
  meetingId: number
  reportName: string
  meetingTitle: string
  initial?: {
    notes: string | null
    sentiment: Sentiment | null
    actionItems: string[]
  }
}) {
  const router = useRouter()
  const toast = useToast()

  const [notes, setNotes] = useState(initial?.notes ?? '')
  const [sentiment, setSentiment] = useState<Sentiment | null>(initial?.sentiment ?? null)
  // Action items live as a single textarea (one per line) — simplest UX that
  // still maps cleanly to the string[] the API wants.
  const [itemsText, setItemsText] = useState((initial?.actionItems ?? []).join('\n'))
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])

  // Re-sync local state when the dialog is (re)opened for a different meeting.
  useEffect(() => {
    if (open) {
      setNotes(initial?.notes ?? '')
      setSentiment(initial?.sentiment ?? null)
      setItemsText((initial?.actionItems ?? []).join('\n'))
      setErr(null)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, meetingId])

  if (!open || !mounted) return null

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setErr(null)
    try {
      const actionItems = itemsText
        .split('\n')
        .map((s) => s.trim())
        .filter((s) => s.length > 0)
      const res = await fetch(`/api/orgs/${orgId}/one-on-ones/${meetingId}/log`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          notes: notes.trim() || null,
          sentiment,
          actionItems,
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data?.error || data?.message || `HTTP ${res.status}`)
      toast.push({ kind: 'success', title: `Logged 1:1 with ${reportName}` })
      onClose()
      router.refresh()
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      setErr(msg)
      toast.push({ kind: 'error', title: 'Could not save', body: msg })
    } finally {
      setBusy(false)
    }
  }

  return createPortal(
    <div
      className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-black/40"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !busy) onClose()
      }}
    >
      <div className="app-card-lg w-full max-w-lg max-h-[90vh] overflow-y-auto bg-[color:var(--m-bg)] shadow-xl">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-[15px] font-semibold text-[color:var(--m-ink)]">How did the 1:1 go?</h2>
            <p className="text-[12px] text-[color:var(--m-ink-4)] mt-0.5">
              {meetingTitle} · with {reportName}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="text-[color:var(--m-ink-4)] hover:text-[color:var(--m-ink)] text-lg leading-none disabled:opacity-50"
            aria-label="Close"
          >
            ×
          </button>
        </div>

        <form onSubmit={submit} className="mt-4 space-y-4">
          {/* Sentiment chips. */}
          <div>
            <label className="block text-[12px] font-medium text-[color:var(--m-ink-2)] mb-1.5">
              Overall read
            </label>
            <div className="grid grid-cols-3 gap-2">
              {SENTIMENT_OPTIONS.map((o) => {
                const active = sentiment === o.key
                return (
                  <button
                    key={o.key}
                    type="button"
                    onClick={() => setSentiment(active ? null : o.key)}
                    disabled={busy}
                    title={o.hint}
                    className={`rounded-lg border px-2 py-2 text-[12.5px] font-medium transition disabled:opacity-50 ${
                      active
                        ? 'border-[color:var(--m-accent)] bg-[color:var(--m-accent-soft)] text-[color:var(--m-ink)]'
                        : 'border-[color:var(--m-border)] bg-white text-[color:var(--m-ink-2)] hover:bg-[color:var(--m-bg-soft)]'
                    }`}
                  >
                    {o.label}
                  </button>
                )
              })}
            </div>
          </div>

          {/* Notes. */}
          <div>
            <label
              htmlFor="oo-notes"
              className="block text-[12px] font-medium text-[color:var(--m-ink-2)] mb-1.5"
            >
              Notes
            </label>
            <textarea
              id="oo-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              disabled={busy}
              rows={5}
              maxLength={5000}
              placeholder="What did you talk about? How are they feeling? Any wins or worries?"
              className="input w-full resize-y"
            />
          </div>

          {/* Action items — one per line. */}
          <div>
            <label
              htmlFor="oo-items"
              className="block text-[12px] font-medium text-[color:var(--m-ink-2)] mb-1.5"
            >
              Action items{' '}
              <span className="font-normal text-[color:var(--m-ink-4)]">— one per line</span>
            </label>
            <textarea
              id="oo-items"
              value={itemsText}
              onChange={(e) => setItemsText(e.target.value)}
              disabled={busy}
              rows={3}
              placeholder={'Follow up on the migration plan\nIntro to the design team'}
              className="input w-full resize-y"
            />
          </div>

          {err && <p className="text-[12px] text-[color:var(--m-bad)]">{err}</p>}

          <div className="flex items-center justify-end gap-2 pt-1">
            <button type="button" onClick={onClose} disabled={busy} className="btn-secondary disabled:opacity-50">
              Cancel
            </button>
            <button type="submit" disabled={busy} className="btn-primary disabled:opacity-50">
              {busy ? 'Saving…' : 'Save & mark done'}
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body,
  )
}
