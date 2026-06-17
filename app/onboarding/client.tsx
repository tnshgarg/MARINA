'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

type Pending = {
  id: number
  token: string
  role: string
  orgName: string
  orgId: number
}

export default function OnboardingClient({
  email,
  pendingInvites,
}: {
  email: string | null
  pendingInvites: Pending[]
}) {
  const router = useRouter()
  const [name, setName] = useState('')
  const [busy, setBusy] = useState<'create' | number | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function createOrg(e: React.FormEvent) {
    e.preventDefault()
    if (name.trim().length === 0) return
    setBusy('create')
    setError(null)
    try {
      const res = await fetch('/api/orgs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data?.message || data?.error || 'failed')
      // First-run: take the brand-new owner through Marina's welcome glance
      // (what the product does) → invite teammates → dashboard, instead of
      // dumping them on an empty HQ. Every step is skippable.
      router.push(`/org/${data.org.id}/setup/welcome`)
    } catch (e) {
      setError(String(e))
      setBusy(null)
    }
  }

  async function acceptInvite(invite: Pending) {
    setBusy(invite.id)
    setError(null)
    try {
      const res = await fetch('/api/invites/accept', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: invite.token }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data?.message || data?.error || 'failed')
      router.push(`/org/${invite.orgId}`)
    } catch (e) {
      setError(String(e))
      setBusy(null)
    }
  }

  return (
    <div className="mt-8 space-y-5">
      {pendingInvites.length > 0 && (
        <section className="app-card app-card-lg">
          <h2 className="app-h2">Pending invites · {email}</h2>
          <ul className="mt-3 space-y-2">
            {pendingInvites.map((i) => (
              <li
                key={i.id}
                className="flex items-center justify-between gap-3 rounded-xl border border-[var(--m-border-soft)] px-3 py-2"
              >
                <div>
                  <p className="text-[14px] font-medium text-[var(--m-ink)]">{i.orgName}</p>
                  <p className="text-[11px] text-[var(--m-ink-3)] uppercase tracking-widest">
                    Role · {i.role}
                  </p>
                </div>
                <button disabled={busy !== null} onClick={() => acceptInvite(i)} className="btn-primary">
                  {busy === i.id ? 'Joining…' : 'Accept →'}
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="app-card app-card-lg">
        <h2 className="app-h2">Spin up an HQ</h2>
        <p className="app-sub mt-1">You&apos;ll be the founding member. Invite your team next.</p>
        <form onSubmit={createOrg} className="mt-4 flex gap-2 flex-wrap">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Acme Engineering"
            className="input flex-1 min-w-[200px]"
            disabled={busy !== null}
            maxLength={200}
          />
          <button
            type="submit"
            disabled={busy !== null || name.trim().length === 0}
            className="btn-primary"
          >
            {busy === 'create' ? 'Creating…' : 'Create →'}
          </button>
        </form>
      </section>

      {error && <p className="text-[12px] text-rose-600">{error}</p>}
    </div>
  )
}
