'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useToast } from '@/components/toast'

type Candidate = { membershipId: number; userId: number; name: string | null; login: string; role: string }

/**
 * Transfer-ownership card. Only renders for the owner of a workspace; lets them
 * hand the workspace to another member (e.g. before deleting their account).
 */
export function TransferOwnership() {
  const router = useRouter()
  const toast = useToast()
  const [org, setOrg] = useState<{ id: number; name: string } | null>(null)
  const [candidates, setCandidates] = useState<Candidate[]>([])
  const [pick, setPick] = useState<number | ''>('')
  const [busy, setBusy] = useState(false)
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    let cancelled = false
    void fetch('/api/me/account/transfer-ownership')
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (cancelled || !d) return
        setOrg(d.org)
        setCandidates(d.candidates ?? [])
      })
      .finally(() => {
        if (!cancelled) setLoaded(true)
      })
    return () => {
      cancelled = true
    }
  }, [])

  // Don't own a workspace, or no one to transfer to → render nothing.
  if (!loaded || !org || candidates.length === 0) return null

  async function transfer() {
    if (pick === '' || !org) return
    const target = candidates.find((c) => c.membershipId === pick)
    if (!target) return
    if (!confirm(`Transfer ownership of "${org.name}" to ${target.name ?? '@' + target.login}? They become the owner; you stay an admin.`)) return
    setBusy(true)
    try {
      const res = await fetch('/api/me/account/transfer-ownership', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orgId: org.id, toMembershipId: pick }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data?.error || 'failed')
      toast.push({ kind: 'success', title: 'Ownership transferred' })
      router.refresh()
      setOrg(null)
    } catch (e) {
      toast.push({ kind: 'error', title: 'Transfer failed', body: e instanceof Error ? e.message : String(e) })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="rounded-lg border border-[var(--m-border)] p-4">
      <h3 className="text-[13px] font-semibold text-[var(--m-ink)]">Transfer workspace ownership</h3>
      <p className="text-[12px] text-[var(--m-ink-3)] mt-1 leading-snug">
        Hand <span className="font-medium text-[var(--m-ink-2)]">{org.name}</span> to another member. They become the
        owner; you stay an admin and can then leave or delete your account.
      </p>
      <div className="mt-3 flex items-center gap-2 flex-wrap">
        <select
          value={pick}
          onChange={(e) => setPick(e.target.value ? Number(e.target.value) : '')}
          className="select max-w-xs"
          disabled={busy}
        >
          <option value="">Choose a member…</option>
          {candidates.map((c) => (
            <option key={c.membershipId} value={c.membershipId}>
              {c.name ?? `@${c.login}`} · {c.role}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={transfer}
          disabled={busy || pick === ''}
          className="px-3 py-1.5 rounded-md bg-[var(--m-ink)] hover:bg-[var(--m-ink-2)] text-white text-[12px] font-medium disabled:opacity-50 transition"
        >
          {busy ? 'Transferring…' : 'Transfer ownership'}
        </button>
      </div>
    </div>
  )
}
