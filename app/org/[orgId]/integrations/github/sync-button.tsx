'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useToast } from '@/components/toast'

/** Triggers the org-wide GitHub App sync, then refreshes the page. */
export default function GithubSyncButton({ orgId }: { orgId: number }) {
  const router = useRouter()
  const toast = useToast()
  const [busy, setBusy] = useState(false)

  async function sync() {
    setBusy(true)
    try {
      const res = await fetch(`/api/orgs/${orgId}/github-app/sync`, { method: 'POST' })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error((data as { error?: string })?.error || `HTTP ${res.status}`)
      const bt = (data.byType ?? {}) as Record<string, number>
      const seg = [
        bt.commit ? `${bt.commit} commits` : '',
        bt.pr_opened ? `${bt.pr_opened} PRs` : '',
        bt.pr_reviewed ? `${bt.pr_reviewed} reviews` : '',
      ].filter(Boolean).join(', ')
      toast.push({
        kind: 'success',
        title: `Synced ${data.repos ?? 0} repo(s)`,
        body: `${data.inserted ?? 0} new${seg ? ` · ${seg}` : ''}`,
      })
      router.refresh()
    } catch (e) {
      toast.push({ kind: 'error', title: 'Sync failed', body: e instanceof Error ? e.message : String(e) })
    } finally {
      setBusy(false)
    }
  }

  return (
    <button
      type="button"
      onClick={sync}
      disabled={busy}
      className="px-3 py-1.5 rounded-md bg-white border border-[var(--m-border)] hover:bg-[var(--m-bg-soft)] text-[var(--m-ink-2)] text-[12.5px] font-medium disabled:opacity-50 transition"
    >
      {busy ? 'Syncing…' : 'Sync now'}
    </button>
  )
}
