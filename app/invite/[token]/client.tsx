'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useToast } from '@/components/toast'

export default function AcceptInviteClient({
  token,
  orgId,
  showGithubField = false,
  prefillGithub = '',
}: {
  token: string
  orgId: number
  /** Ask for a GitHub username (only when the user has no GitHub identity yet). */
  showGithubField?: boolean
  prefillGithub?: string
}) {
  const router = useRouter()
  const toast = useToast()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [github, setGithub] = useState(prefillGithub)

  async function accept() {
    setBusy(true)
    setError(null)
    try {
      const res = await fetch('/api/invites/accept', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token,
          githubUsername: showGithubField ? github.trim() : undefined,
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data?.message || data?.error || `HTTP ${res.status}`)
      toast.push({ kind: 'success', title: 'Joined!', body: 'Welcome to your team.' })
      router.push(`/org/${orgId}`)
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      setError(msg)
      toast.push({ kind: 'error', title: 'Could not accept invite', body: msg })
      setBusy(false)
    }
  }

  return (
    <div>
      {showGithubField && (
        <div className="mb-4">
          <label htmlFor="gh-username" className="block text-[12px] font-medium text-[var(--m-ink-2)] mb-1.5">
            GitHub username <span className="text-[var(--m-ink-4)] font-normal">· optional</span>
          </label>
          <div className="flex items-center rounded-lg border border-[var(--m-border)] bg-white focus-within:border-[var(--m-accent)] overflow-hidden">
            <span className="pl-2.5 pr-1 text-[13px] text-[var(--m-ink-4)] select-none">@</span>
            <input
              id="gh-username"
              value={github}
              onChange={(e) => setGithub(e.target.value)}
              placeholder="octocat"
              autoComplete="off"
              autoCapitalize="off"
              spellCheck={false}
              disabled={busy}
              className="flex-1 py-2 pr-2.5 text-[13.5px] text-[var(--m-ink)] bg-transparent outline-none placeholder:text-[var(--m-ink-4)]"
            />
          </div>
          <p className="mt-1.5 text-[11.5px] text-[var(--m-ink-3)] leading-relaxed">
            Your team already shares its repos with MARINA — adding your username lets your commits and
            pull requests show up under your name. You can add it later in Settings.
          </p>
        </div>
      )}
      <button onClick={accept} disabled={busy} className="btn-primary">
        {busy ? 'Joining…' : 'Accept and join →'}
      </button>
      {error && <p className="mt-2 text-[12px] text-rose-600">{error}</p>}
    </div>
  )
}
