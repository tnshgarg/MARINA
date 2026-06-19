'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

export type Teammate = { userId: number; name: string }

/**
 * Give a teammate kudos. Marina posts it to #all-marina and their inbox.
 * Used on the member dashboard and the manager Recognitions page.
 */
export function GiveRecognition({ orgId, teammates }: { orgId: number; teammates: Teammate[] }) {
  const router = useRouter()
  const [to, setTo] = useState('')
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState<{ kind: 'idle' | 'ok' | 'error'; text?: string }>({ kind: 'idle' })

  async function submit() {
    if (!to || !message.trim()) {
      setStatus({ kind: 'error', text: 'Pick a teammate and add a note.' })
      return
    }
    setBusy(true)
    setStatus({ kind: 'idle' })
    try {
      const r = await fetch(`/api/orgs/${orgId}/recognitions`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ toUserId: Number(to), message }),
      })
      if (!r.ok) {
        const d = await r.json().catch(() => ({}))
        setStatus({ kind: 'error', text: d.error ?? 'Could not send.' })
        setBusy(false)
        return
      }
      setTo('')
      setMessage('')
      setBusy(false)
      setStatus({ kind: 'ok', text: 'Sent — nice one.' })
      router.refresh()
    } catch {
      setStatus({ kind: 'error', text: 'Could not send.' })
      setBusy(false)
    }
  }

  const statusColor =
    status.kind === 'ok' ? 'text-[var(--m-good)]' : status.kind === 'error' ? 'text-[var(--m-bad)]' : 'text-transparent'

  return (
    <div className="rounded-xl border border-[var(--m-border)] bg-white p-4">
      <p className="text-[13px] font-semibold text-[var(--m-ink)]">Give recognition</p>
      <p className="text-[11.5px] text-[var(--m-ink-4)] mb-2.5">Marina shares it in #all-marina and their inbox.</p>
      <select
        value={to}
        onChange={(e) => {
          setTo(e.target.value)
          setStatus({ kind: 'idle' })
        }}
        className="input w-full text-[13px] mb-2"
      >
        <option value="">Pick a teammate…</option>
        {teammates.map((t) => (
          <option key={t.userId} value={t.userId}>
            {t.name}
          </option>
        ))}
      </select>
      <textarea
        value={message}
        onChange={(e) => {
          setMessage(e.target.value)
          setStatus({ kind: 'idle' })
        }}
        rows={2}
        maxLength={1000}
        placeholder="What did they do well?"
        className="input w-full text-[13px] resize-y"
      />
      <div className="mt-2 flex items-center justify-between gap-2">
        <span className={`text-[12px] ${statusColor}`}>{status.text ?? '·'}</span>
        <button type="button" onClick={submit} disabled={busy || !to || !message.trim()} className="btn-sage text-[12.5px] disabled:opacity-50 shrink-0">
          {busy ? 'Sending…' : 'Send kudos'}
        </button>
      </div>
    </div>
  )
}
