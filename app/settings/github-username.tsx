'use client'

import { useState } from 'react'
import { useToast } from '@/components/toast'

/**
 * Self-serve GitHub username. With the org's GitHub App installed, this single
 * field is enough to attribute a teammate's commits & PRs — no OAuth dance.
 */
export default function GithubUsernameField({ initialValue }: { initialValue: string | null }) {
  const toast = useToast()
  const [value, setValue] = useState(initialValue ?? '')
  const [saved, setSaved] = useState(initialValue ?? '')
  const [busy, setBusy] = useState(false)

  const dirty = value.trim() !== (saved ?? '')

  async function save() {
    setBusy(true)
    try {
      const res = await fetch('/api/me/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ githubLogin: value.trim() === '' ? null : value.trim() }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`)
      const next = (data.githubLogin as string | null) ?? ''
      setValue(next)
      setSaved(next)
      toast.push({ kind: 'success', title: 'Saved', body: next ? `Linked as @${next}` : 'GitHub username cleared' })
    } catch (e) {
      toast.push({ kind: 'error', title: 'Could not save', body: e instanceof Error ? e.message : String(e) })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="mb-5 rounded-xl border border-[var(--m-border)] bg-white p-5 max-w-3xl">
      <h2 className="text-[13.5px] font-semibold text-[var(--m-ink)]">GitHub username</h2>
      <p className="mt-1 text-[12.5px] text-[var(--m-ink-2)] leading-relaxed">
        Your team shares its repositories with MARINA through the GitHub App. Adding your username
        attributes your commits, pull requests and reviews to you — no separate sign-in needed.
      </p>
      <div className="mt-3 flex items-center gap-2 max-w-sm">
        <div className="flex flex-1 items-center rounded-lg border border-[var(--m-border)] bg-white focus-within:border-[var(--m-accent)] overflow-hidden">
          <span className="pl-2.5 pr-1 text-[13px] text-[var(--m-ink-4)] select-none">@</span>
          <input
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder="octocat"
            autoComplete="off"
            autoCapitalize="off"
            spellCheck={false}
            disabled={busy}
            className="flex-1 py-2 pr-2.5 text-[13.5px] text-[var(--m-ink)] bg-transparent outline-none placeholder:text-[var(--m-ink-4)]"
          />
        </div>
        <button
          onClick={save}
          disabled={busy || !dirty}
          className="btn-primary text-[12.5px] px-3 py-2 disabled:opacity-50"
        >
          {busy ? 'Saving…' : 'Save'}
        </button>
      </div>
    </div>
  )
}
