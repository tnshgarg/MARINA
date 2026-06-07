'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

type Result = {
  summary: { total: number; succeeded: number; skipped: number; failed: number }
  results: Array<{ login: string; inserted?: number; skipped?: string; error?: string }>
}

export function SyncTeamButton({ orgId }: { orgId: number }) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<Result | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function run() {
    setBusy(true)
    setError(null)
    setResult(null)
    try {
      const res = await fetch(`/api/orgs/${orgId}/sync-team`, { method: 'POST' })
      const data = await res.json()
      if (!res.ok) throw new Error(data?.error || 'failed')
      setResult({ summary: data.summary, results: data.results })
      router.refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <button
        onClick={run}
        disabled={busy}
        className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-[13px] font-medium disabled:opacity-60 disabled:cursor-not-allowed transition"
      >
        {busy ? (
          <>
            <span className="inline-block w-3 h-3 rounded-full border-2 border-white/40 border-t-white animate-spin" />
            Syncing…
          </>
        ) : (
          <>🔄 Sync team now</>
        )}
      </button>
      {error && <p className="text-[11px] text-rose-600">{error}</p>}
      {result && (
        <p className="text-[11px] text-emerald-700">
          ✓ {result.summary.succeeded} synced
          {result.summary.skipped > 0 && ` · ${result.summary.skipped} skipped (no GitHub)`}
          {result.summary.failed > 0 && ` · ${result.summary.failed} failed`}
        </p>
      )}
    </>
  )
}
