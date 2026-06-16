'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useToast } from '@/components/toast'

/**
 * One-shot "tell us about yourself" prompt. Renders only when the signed-in
 * user is missing either their joining date or their birthday — once filled,
 * the card auto-hides and stays gone.
 *
 * Sits on the personal dashboard. Replaces the previous HR-fills-it model:
 * managers shouldn't have to type every teammate's birthday and join date,
 * the employee can fill them themselves from their console.
 */
export function ProfileCompletionCard() {
  const router = useRouter()
  const toast = useToast()
  const [loaded, setLoaded] = useState(false)
  const [needsBirthday, setNeedsBirthday] = useState(false)
  const [needsJoinedOn, setNeedsJoinedOn] = useState(false)
  const [birthdayInput, setBirthdayInput] = useState('') // "YYYY-MM-DD" via <input type="date">
  const [joinedOnInput, setJoinedOnInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [dismissed, setDismissed] = useState(false)

  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const res = await fetch('/api/me/profile', { cache: 'no-store' })
        if (!res.ok) return
        const data = (await res.json()) as { birthdayMmDd: string | null; joinedOn: string | null }
        if (cancelled) return
        setNeedsBirthday(!data.birthdayMmDd)
        setNeedsJoinedOn(!data.joinedOn)
      } finally {
        if (!cancelled) setLoaded(true)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  if (!loaded || dismissed || (!needsBirthday && !needsJoinedOn)) return null

  async function save() {
    const patch: { birthdayMmDd?: string; joinedOn?: string } = {}
    if (needsBirthday && birthdayInput) {
      // Convert YYYY-MM-DD → MM-DD; the year is intentionally discarded so we
      // never display the employee's age.
      const parts = birthdayInput.split('-')
      if (parts.length === 3) patch.birthdayMmDd = `${parts[1]}-${parts[2]}`
    }
    if (needsJoinedOn && joinedOnInput) {
      patch.joinedOn = joinedOnInput
    }
    if (Object.keys(patch).length === 0) {
      toast.push({ kind: 'error', title: 'Pick at least one date' })
      return
    }
    setBusy(true)
    try {
      const res = await fetch('/api/me/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data?.error || 'save failed')
      }
      toast.push({ kind: 'success', title: 'Profile saved' })
      setDismissed(true)
      router.refresh()
    } catch (e) {
      toast.push({
        kind: 'error',
        title: 'Save failed',
        body: e instanceof Error ? e.message : String(e),
      })
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="rounded-xl border border-[var(--m-accent)]/30 bg-[var(--m-accent-soft)]/30 px-4 py-4">
      <div className="flex items-start justify-between gap-3 mb-3">
        <div>
          <p className="text-[11px] uppercase tracking-wider text-[var(--m-accent-2)] font-semibold">
            One quick thing
          </p>
          <p className="mt-1 text-[14px] font-medium text-[var(--m-ink)]">
            Help us celebrate you
          </p>
          <p className="text-[12.5px] text-[var(--m-ink-2)] mt-0.5 leading-snug">
            Your manager doesn&apos;t need to enter these — fill in your dates once
            and MARINA handles the rest.
          </p>
        </div>
        <button
          onClick={() => setDismissed(true)}
          className="text-[var(--m-ink-4)] hover:text-[var(--m-ink-2)] text-[18px] leading-none px-1"
          aria-label="Dismiss"
        >
          ×
        </button>
      </div>
      <div className="grid sm:grid-cols-2 gap-3">
        {needsJoinedOn && (
          <label className="block">
            <span className="text-[11px] uppercase tracking-wider text-[var(--m-ink-3)] font-semibold">
              Joining date
            </span>
            <input
              type="date"
              value={joinedOnInput}
              onChange={(e) => setJoinedOnInput(e.target.value)}
              max={new Date().toISOString().slice(0, 10)}
              className="input mt-1 w-full"
            />
          </label>
        )}
        {needsBirthday && (
          <label className="block">
            <span className="text-[11px] uppercase tracking-wider text-[var(--m-ink-3)] font-semibold">
              Birthday <span className="text-[var(--m-ink-4)] font-normal normal-case">(only day + month shown)</span>
            </span>
            <input
              type="date"
              value={birthdayInput}
              onChange={(e) => setBirthdayInput(e.target.value)}
              className="input mt-1 w-full"
            />
          </label>
        )}
      </div>
      <div className="mt-3 flex items-center gap-2">
        <button
          onClick={save}
          disabled={busy}
          className="px-3 py-1.5 rounded-md bg-[var(--m-accent)] hover:bg-[var(--m-accent-2)] text-white text-[12.5px] font-medium disabled:opacity-50 transition"
        >
          {busy ? 'Saving…' : 'Save'}
        </button>
        <p className="text-[11px] text-[var(--m-ink-3)]">
          Your birthday year is never stored or shown.
        </p>
      </div>
    </section>
  )
}
