'use client'

import { useState } from 'react'

type Highlight = { title: string; detail: string }
type Packet = {
  rangeDays: number
  headline: string
  summary: string
  highlights: Highlight[]
  themes: string[]
  stats: { commits: number; prs: number; merged: number; reviews: number; repos: number }
  empty: boolean
}

const RANGES: { label: string; days: number }[] = [
  { label: '30 days', days: 30 },
  { label: '90 days', days: 90 },
  { label: '6 months', days: 180 },
  { label: '1 year', days: 365 },
]

/**
 * "Get credit for your work" — the brag-doc / review packet.
 *
 * The employee picks a window; Marina turns their REAL GitHub activity into an
 * evidence-backed accomplishments summary they can paste into a review or 1:1.
 * Works for any signed-in user (org or solo). Numbers come straight from their
 * activity; the prose is generated server-side and never invents work.
 */
export function ReviewPacket({ hasGithub }: { hasGithub: boolean }) {
  const [days, setDays] = useState(90)
  const [busy, setBusy] = useState(false)
  const [packet, setPacket] = useState<Packet | null>(null)
  const [markdown, setMarkdown] = useState('')
  const [name, setName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  async function generate(d: number) {
    setBusy(true)
    setError(null)
    setCopied(false)
    try {
      const res = await fetch('/api/me/review-packet', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ days: d }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data?.error ?? 'failed')
      setPacket(data.packet)
      setMarkdown(data.markdown ?? '')
      setName(data.name ?? '')
    } catch (e) {
      setError(String(e))
    } finally {
      setBusy(false)
    }
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(markdown)
      setCopied(true)
      setTimeout(() => setCopied(false), 1800)
    } catch {
      /* clipboard unavailable */
    }
  }

  return (
    <section className="app-card app-card-lg">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="min-w-0">
          <p className="app-eyebrow">Get credit for your work</p>
          <h2 className="app-h2 mt-0.5">Your review &amp; 1:1 packet</h2>
          <p className="app-sub mt-1 max-w-md">
            Marina turns your real activity into an evidence-backed summary — paste it straight into a
            performance review, a 1:1, or a weekly update.
          </p>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {RANGES.map((r) => (
            <button
              key={r.days}
              type="button"
              onClick={() => setDays(r.days)}
              className={`text-[12px] px-2.5 py-1 rounded-md transition-colors ${
                days === r.days
                  ? 'bg-[var(--m-accent-soft)] text-[var(--m-accent-2)] font-medium'
                  : 'text-[var(--m-ink-3)] hover:text-[var(--m-ink)] hover:bg-[var(--m-bg-soft)]'
              }`}
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-4">
        <button
          type="button"
          onClick={() => generate(days)}
          disabled={busy}
          className="btn-sage text-[13px] disabled:opacity-60"
        >
          {busy ? 'Writing your packet…' : packet ? 'Regenerate' : 'Generate my packet'}
        </button>
        {!hasGithub && (
          <p className="text-[12px] text-[var(--m-ink-3)] mt-2">
            Tip: connect &amp; sync GitHub above so this is built from your commits, PRs and reviews.
          </p>
        )}
      </div>

      {error && <p className="mt-3 text-[12px] text-rose-600">Couldn&apos;t generate — {error}</p>}

      {packet && packet.empty && (
        <div className="mt-4 rounded-xl border border-[var(--m-border)] bg-[var(--m-bg-soft)]/60 p-4 text-[13px] text-[var(--m-ink-2)]">
          No activity found in this window yet. Connect &amp; sync GitHub (or pick a wider range) and Marina
          will have something to write about.
        </div>
      )}

      {packet && !packet.empty && (
        <div className="mt-4 rounded-xl border border-[var(--m-border)] bg-white p-5">
          <div className="flex items-start justify-between gap-3 mb-3">
            <p className="text-[11px] uppercase tracking-wider text-[var(--m-ink-4)] font-semibold">
              Last {packet.rangeDays} days{name ? ` · ${name}` : ''}
            </p>
            <button
              type="button"
              onClick={copy}
              className="text-[12px] font-medium px-2.5 py-1 rounded-md border border-[var(--m-border)] text-[var(--m-ink-2)] hover:border-[var(--m-accent)] hover:text-[var(--m-accent)] transition-colors shrink-0"
            >
              {copied ? 'Copied ✓' : 'Copy as markdown'}
            </button>
          </div>

          {packet.headline && (
            <p className="font-display text-[20px] leading-snug text-[var(--m-ink)]">{packet.headline}</p>
          )}
          {packet.summary && (
            <p className="text-[13.5px] text-[var(--m-ink-2)] leading-relaxed mt-2">{packet.summary}</p>
          )}

          {packet.highlights.length > 0 && (
            <ul className="mt-4 space-y-2.5">
              {packet.highlights.map((h, i) => (
                <li key={i} className="flex items-start gap-2.5">
                  <span className="mt-1.5 shrink-0 w-1.5 h-1.5 rounded-full bg-[var(--m-accent)]" />
                  <p className="text-[13px] text-[var(--m-ink)] leading-snug">
                    <span className="font-semibold">{h.title}</span>
                    {h.detail ? <span className="text-[var(--m-ink-3)]"> — {h.detail}</span> : null}
                  </p>
                </li>
              ))}
            </ul>
          )}

          {packet.themes.length > 0 && (
            <div className="mt-4 flex flex-wrap gap-1.5">
              {packet.themes.map((t) => (
                <span
                  key={t}
                  className="text-[11px] px-2 py-0.5 rounded-full bg-[var(--m-clay-soft)] text-[var(--m-clay-deep)]"
                >
                  {t}
                </span>
              ))}
            </div>
          )}

          <div className="mt-4 pt-3 border-t border-[var(--m-border-soft)] flex flex-wrap gap-x-4 gap-y-1 text-[12px] text-[var(--m-ink-3)] tabular-nums">
            <span><span className="font-semibold text-[var(--m-ink-2)]">{packet.stats.commits}</span> commits</span>
            <span><span className="font-semibold text-[var(--m-ink-2)]">{packet.stats.prs}</span> PRs ({packet.stats.merged} merged)</span>
            <span><span className="font-semibold text-[var(--m-ink-2)]">{packet.stats.reviews}</span> reviews</span>
            <span><span className="font-semibold text-[var(--m-ink-2)]">{packet.stats.repos}</span> repos</span>
          </div>
        </div>
      )}
    </section>
  )
}
