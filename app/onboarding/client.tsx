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
      router.push(`/org/${data.org.id}`)
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
    <div className="mt-8 space-y-6">
      {pendingInvites.length > 0 && (
        <section className="rounded-lg border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-950">
          <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
            Pending invites for {email}
          </h2>
          <ul className="mt-3 space-y-2">
            {pendingInvites.map((i) => (
              <li
                key={i.id}
                className="flex items-center justify-between rounded border border-zinc-100 px-3 py-2 dark:border-zinc-900"
              >
                <div>
                  <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100">{i.orgName}</p>
                  <p className="text-xs text-zinc-500">as {i.role}</p>
                </div>
                <button
                  disabled={busy !== null}
                  onClick={() => acceptInvite(i)}
                  className="text-xs rounded bg-zinc-900 px-3 py-1.5 font-medium text-white hover:bg-zinc-800 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900"
                >
                  {busy === i.id ? 'Joining…' : 'Accept'}
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="rounded-lg border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-950">
        <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">Create an organization</h2>
        <p className="mt-1 text-xs text-zinc-500">You&apos;ll be the owner.</p>
        <form onSubmit={createOrg} className="mt-3 flex gap-2">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Acme Engineering"
            className="flex-1 rounded border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
            disabled={busy !== null}
            maxLength={200}
          />
          <button
            type="submit"
            disabled={busy !== null || name.trim().length === 0}
            className="rounded-md bg-zinc-900 px-3 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900"
          >
            {busy === 'create' ? 'Creating…' : 'Create'}
          </button>
        </form>
      </section>

      {error && <p className="text-xs text-rose-600">{error}</p>}
    </div>
  )
}
