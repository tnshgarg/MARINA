'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

/** Manager/admin announcement composer. POSTs to the org announcements endpoint
 *  (which broadcasts to #all-marina + everyone's inbox), then refreshes the feed. */
export default function ComposeAnnouncement({ orgId }: { orgId: number }) {
  const router = useRouter()
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function submit() {
    if (!body.trim()) {
      setError('Write something to announce.')
      return
    }
    setBusy(true)
    setError('')
    try {
      const r = await fetch(`/api/orgs/${orgId}/announcements`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ title, body }),
      })
      if (!r.ok) {
        const d = await r.json().catch(() => ({}))
        setError(d.error ?? 'Could not post.')
        setBusy(false)
        return
      }
      setTitle('')
      setBody('')
      setBusy(false)
      router.refresh()
    } catch {
      setError('Could not post.')
      setBusy(false)
    }
  }

  return (
    <div className="rounded-xl border border-[var(--m-border)] bg-white p-4">
      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Title (optional)"
        maxLength={140}
        className="input w-full text-[13.5px] mb-2"
      />
      <textarea
        value={body}
        onChange={(e) => {
          setBody(e.target.value)
          setError('')
        }}
        placeholder="What's the update? Marina will post it to #all-marina and everyone's inbox."
        rows={3}
        maxLength={4000}
        className="input w-full text-[13.5px] resize-y"
      />
      {error && <p className="mt-1.5 text-[12px] text-[var(--m-bad)]">{error}</p>}
      <div className="mt-2 flex justify-end">
        <button type="button" onClick={submit} disabled={busy || !body.trim()} className="btn-sage text-[13px] disabled:opacity-50">
          {busy ? 'Posting…' : 'Post announcement'}
        </button>
      </div>
    </div>
  )
}
