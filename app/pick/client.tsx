'use client'

import { useState } from 'react'
import { CharacterAvatar } from '@/components/character-avatar'

type Choice = {
  key: string
  name: string
  codename: string
  tagline: string
  color: string
  glow: string
}

export default function PickClient({ characters }: { characters: Choice[] }) {
  const [selected, setSelected] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function claim() {
    if (!selected) {
      setError('Pick a hero first.')
      return
    }
    setBusy(true)
    setError(null)
    try {
      const res = await fetch('/api/me/character', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ characterKey: selected }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        // Surface the precise reason instead of a silent stuck-state.
        const msg =
          res.status === 401
            ? 'Your session expired — please sign in again.'
            : (data as { error?: string })?.error ?? `Server returned ${res.status}.`
        throw new Error(msg)
      }
      // HARD navigation — bypasses Next.js router transition edge cases that can
      // silently no-op when paired with router.refresh. This always works.
      window.location.assign('/')
    } catch (e) {
      console.error('[pick] claim failed', e)
      setError(e instanceof Error ? e.message : String(e))
      setBusy(false)
    }
  }

  const selectedChar = characters.find((c) => c.key === selected)

  return (
    <div className="mt-8">
      <div className="grid gap-3 grid-cols-2 sm:grid-cols-3 md:grid-cols-5">
        {characters.map((c) => {
          const isActive = selected === c.key
          return (
            <button
              key={c.key}
              onClick={() => setSelected(c.key)}
              disabled={busy}
              className={`app-card p-4 text-left transition transform-gpu hover:-translate-y-0.5 ${
                isActive ? 'ring-2 ring-offset-2' : ''
              }`}
              style={isActive ? { boxShadow: `0 0 0 2px ${c.color}` } : undefined}
              aria-pressed={isActive}
            >
              <div className="flex items-center justify-center mb-3">
                <CharacterAvatar characterKey={c.key} size={72} ring={isActive} />
              </div>
              <p className="text-[10px] uppercase tracking-widest text-slate-500 font-medium">
                {c.codename}
              </p>
              <p className="text-[14px] font-semibold text-slate-900" style={{ color: isActive ? c.color : undefined }}>
                {c.name}
              </p>
              <p className="mt-1 text-[11px] text-slate-500 leading-snug">{c.tagline}</p>
            </button>
          )
        })}
      </div>

      <div className="mt-8 flex items-center justify-between gap-4 flex-wrap">
        <div className="text-[13px] text-slate-600">
          {selectedChar ? (
            <span>
              Suiting up as{' '}
              <strong className="text-slate-900" style={{ color: selectedChar.color }}>
                {selectedChar.name}
              </strong>
            </span>
          ) : (
            <span>Pick a hero to continue.</span>
          )}
        </div>
        <button onClick={claim} disabled={!selected || busy} className="btn-primary">
          {busy ? 'Suiting up…' : 'Claim hero →'}
        </button>
      </div>
      {error && <p className="mt-3 text-[12px] text-rose-600">{error}</p>}
    </div>
  )
}
