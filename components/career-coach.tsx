'use client'

import { useState } from 'react'

type Win = { kind: string; title: string; detail: string; url?: string }
type Dimension = { name: string; status: 'at' | 'approaching' | 'below'; note: string }
type Gap = { title: string; how: string }
type Assessment = {
  empty: boolean
  currentLevel: string
  nextLevel: string
  standing: string
  dimensions: Dimension[]
  gaps: Gap[]
  thisMonth: string[]
}

const STATUS_META: Record<Dimension['status'], { label: string; cls: string }> = {
  at: { label: 'At next level', cls: 'bg-[var(--m-good-soft)] text-[var(--m-good)]' },
  approaching: { label: 'Approaching', cls: 'bg-[var(--m-gold-soft)] text-[var(--m-warn)]' },
  below: { label: 'Building', cls: 'bg-[var(--m-bg-soft)] text-[var(--m-ink-3)]' },
}

const WIN_ICON: Record<string, string> = { shipped: '🚢', fixed: '🔧', reviewed: '👀', drove: '⚡' }

/**
 * The career coach — the differentiated heart of the employee product. It reads
 * the user's OWN longitudinal activity (not a one-shot prompt) and tells them
 * where they stand vs. the next level and exactly what would move them up, with
 * their real wins as the evidence. This is the part a stateless chatbot can't be.
 */
export function CareerCoach({ hasWork }: { hasWork: boolean }) {
  const [busy, setBusy] = useState(false)
  const [wins, setWins] = useState<Win[] | null>(null)
  const [a, setA] = useState<Assessment | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function run() {
    setBusy(true)
    setError(null)
    try {
      const res = await fetch('/api/me/coach', { method: 'POST' })
      const data = await res.json()
      if (!res.ok) throw new Error(data?.error ?? 'failed')
      setWins(data.wins ?? [])
      setA(data.assessment ?? null)
    } catch (e) {
      setError(String(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="app-card app-card-lg relative overflow-hidden">
      <div
        aria-hidden
        className="absolute -top-16 -right-16 w-56 h-56 rounded-full blur-3xl opacity-30"
        style={{ background: 'var(--m-accent)' }}
      />
      <div className="relative flex items-start justify-between gap-3 flex-wrap">
        <div className="min-w-0">
          <p className="app-eyebrow">Career coach</p>
          <h2 className="font-display text-[24px] leading-tight text-[var(--m-ink)] mt-0.5">
            Your path to the next level
          </h2>
          <p className="app-sub mt-1 max-w-md">
            Grounded in <span className="font-medium text-[var(--m-ink-2)]">your</span> real work over the last 6 months —
            where you stand, and exactly what moves you up.
          </p>
        </div>
        <button type="button" onClick={run} disabled={busy} className="btn-sage text-[13px] shrink-0 disabled:opacity-60">
          {busy ? 'Reading your work…' : a ? 'Refresh' : 'Get my read'}
        </button>
      </div>

      {!hasWork && !a && (
        <p className="relative text-[12.5px] text-[var(--m-ink-3)] mt-3">
          Connect &amp; sync GitHub first — the coach reads your real commits, PRs and reviews.
        </p>
      )}
      {error && <p className="relative mt-3 text-[12px] text-rose-600">Couldn&apos;t generate — {error}</p>}

      {a && a.empty && (
        <div className="relative mt-4 rounded-xl border border-[var(--m-border)] bg-[var(--m-bg-soft)]/60 p-4 text-[13px] text-[var(--m-ink-2)]">
          Not enough visible activity yet to assess. Sync your GitHub work (or give it a little time) and the coach will
          have something to go on.
        </div>
      )}

      {a && !a.empty && (
        <div className="relative mt-5 space-y-5">
          {/* Standing + level */}
          <div>
            {(a.currentLevel || a.nextLevel) && (
              <div className="flex items-center gap-2 text-[12px] mb-2">
                {a.currentLevel && (
                  <span className="px-2 py-0.5 rounded-full bg-[var(--m-bg-soft)] text-[var(--m-ink-2)] font-medium">{a.currentLevel}</span>
                )}
                <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="text-[var(--m-ink-4)]">
                  <path d="M5 12h14M13 6l6 6-6 6" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                {a.nextLevel && (
                  <span className="px-2 py-0.5 rounded-full bg-[var(--m-accent-soft)] text-[var(--m-accent-2)] font-semibold">{a.nextLevel}</span>
                )}
              </div>
            )}
            {a.standing && <p className="font-display text-[18px] leading-snug text-[var(--m-ink)]">{a.standing}</p>}
          </div>

          {/* Dimensions */}
          {a.dimensions.length > 0 && (
            <div className="grid sm:grid-cols-2 gap-2.5">
              {a.dimensions.map((d) => {
                const m = STATUS_META[d.status]
                return (
                  <div key={d.name} className="rounded-xl border border-[var(--m-border)] bg-white p-3">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-[13px] font-semibold text-[var(--m-ink)]">{d.name}</p>
                      <span className={`shrink-0 text-[10px] font-medium px-1.5 py-0.5 rounded-full ${m.cls}`}>{m.label}</span>
                    </div>
                    <p className="text-[12px] text-[var(--m-ink-3)] mt-1 leading-snug">{d.note}</p>
                  </div>
                )
              })}
            </div>
          )}

          {/* Gaps */}
          {a.gaps.length > 0 && (
            <div>
              <p className="app-eyebrow mb-2">What&apos;s holding you back</p>
              <ul className="space-y-2.5">
                {a.gaps.map((g, i) => (
                  <li key={i} className="rounded-xl border border-[var(--m-clay)]/25 bg-[var(--m-clay-soft)]/30 p-3">
                    <p className="text-[13px] font-semibold text-[var(--m-ink)]">{g.title}</p>
                    <p className="text-[12.5px] text-[var(--m-ink-2)] mt-0.5 leading-snug">{g.how}</p>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* This month */}
          {a.thisMonth.length > 0 && (
            <div>
              <p className="app-eyebrow mb-2">Do this month</p>
              <ul className="space-y-1.5">
                {a.thisMonth.map((t, i) => (
                  <li key={i} className="flex items-start gap-2.5 text-[13px] text-[var(--m-ink-2)]">
                    <span className="mt-1 shrink-0 w-4 h-4 rounded-md border border-[var(--m-accent)]/40 bg-[var(--m-accent-soft)]" />
                    {t}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Wins reel */}
          {wins && wins.length > 0 && (
            <div className="pt-1">
              <p className="app-eyebrow mb-2">Your wins, captured</p>
              <ul className="space-y-1.5">
                {wins.map((w, i) => (
                  <li key={i} className="flex items-start gap-2 text-[13px]">
                    <span className="shrink-0 text-[13px] leading-5">{WIN_ICON[w.kind] ?? '•'}</span>
                    <p className="text-[var(--m-ink)] leading-snug">
                      <span className="font-medium">{w.title}</span>
                      {w.detail ? <span className="text-[var(--m-ink-3)]"> — {w.detail}</span> : null}
                    </p>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <p className="text-[11px] text-[var(--m-ink-4)] pt-1">
            An honest read of your <em>visible</em> work (GitHub) — a lens to act on, not a verdict.
          </p>
        </div>
      )}
    </section>
  )
}
