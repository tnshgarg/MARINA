'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

export default function AcceptInviteClient({ token, orgId }: { token: string; orgId: number }) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function accept() {
    setBusy(true)
    setError(null)
    try {
      const res = await fetch('/api/invites/accept', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data?.message || data?.error || 'failed')
      router.push(`/org/${orgId}`)
    } catch (e) {
      setError(String(e))
      setBusy(false)
    }
  }

  return (
    <div>
      <button onClick={accept} disabled={busy} className="btn-primary">
        {busy ? 'Joining…' : 'Accept and join →'}
      </button>
      {error && <p className="mt-2 text-[12px] text-rose-600">{error}</p>}
    </div>
  )
}
