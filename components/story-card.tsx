'use client'

import { useEffect, useState } from 'react'

type Scene = {
  startAt: string
  endAt: string
  kind: string
  label: string
  detail?: string
  evidence?: Record<string, unknown>
}

type Story = {
  day: string
  narrative: string
  scenes: Scene[]
  provider: string
  model: string
  generatedAt?: string
}

const KIND_COLOR: Record<string, string> = {
  meeting: '#6366f1',     // indigo
  coding: '#10b981',      // emerald
  design: '#ec4899',      // pink
  comms: '#0ea5e9',       // sky
  reading: '#a855f7',     // purple
  browsing: '#94a3b8',    // slate
  media: '#f59e0b',       // amber
  break: '#f97316',       // orange
  leave: '#fbbf24',       // yellow
  idle: '#cbd5e1',        // slate-300
  mixed: '#64748b',       // slate-500
  unknown: '#cbd5e1',
  shift_start: '#22c55e',
  shift_end: '#ef4444',
}

const KIND_LABEL: Record<string, string> = {
  meeting: 'Meeting',
  coding: 'Coding',
  design: 'Design',
  comms: 'Messages',
  reading: 'Reading',
  browsing: 'Browsing',
  media: 'Media',
  break: 'Break',
  leave: 'On leave',
  idle: 'Idle',
  mixed: 'Working',
  unknown: 'Unknown',
}

export function StoryCard({ endpoint }: { endpoint: string }) {
  const [story, setStory] = useState<Story | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loadedFromCache, setLoadedFromCache] = useState(false)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const res = await fetch(endpoint, { method: 'GET' })
        if (!res.ok) return
        const data = await res.json()
        if (cancelled) return
        if (data.story) {
          setStory(data.story)
          setLoadedFromCache(true)
        }
      } catch {
        // ignore — user can generate manually
      }
    })()
    return () => {
      cancelled = true
    }
  }, [endpoint])

  async function generate() {
    setBusy(true)
    setError(null)
    try {
      const res = await fetch(endpoint, { method: 'POST' })
      const data = await res.json()
      if (!res.ok) throw new Error(data?.message || data?.error || 'failed')
      setStory(data.story)
      setLoadedFromCache(false)
    } catch (e) {
      setError(String(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="app-card app-card-lg hover-lift">
      <div className="section-title-row flex-wrap gap-3">
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center justify-center w-8 h-8 rounded-lg bg-gradient-to-br from-[var(--m-accent)] to-[var(--m-clay)] text-white text-[14px]">
            ✦
          </span>
          <div>
            <h2 className="app-h2">Today&apos;s story</h2>
            <p className="app-sub mt-0.5">An AI narrative of your day — meetings, code, breaks.</p>
          </div>
        </div>
        <button onClick={generate} disabled={busy} className="btn-primary">
          {busy ? 'Generating…' : story ? 'Regenerate' : 'Generate story'}
        </button>
      </div>

      {error && <p className="mt-3 text-[12px] text-rose-600">{error}</p>}

      {story ? (
        <div className="mt-5 space-y-5">
          <Timeline scenes={story.scenes} />
          <NarrativeBlock narrative={story.narrative} />
          <Legend scenes={story.scenes} />
          <p className="text-[11px] text-[var(--m-ink-4)]">
            {story.provider} · {story.model}
            {loadedFromCache && story.generatedAt
              ? ` · cached ${new Date(story.generatedAt).toLocaleString()}`
              : ''}
          </p>
        </div>
      ) : (
        <div className="mt-5 rounded-xl border border-dashed border-[var(--m-border)] px-4 py-8 text-center">
          <p className="text-[24px] mb-1">📖</p>
          <p className="text-[14px] font-medium text-[var(--m-ink)]">
            Your day, as told by MARINA
          </p>
          <p className="app-sub mt-1 max-w-md mx-auto">
            Generate to see a timeline + prose narrative of meetings, coding, breaks, and more —
            stitched from your agent activity, focus time, and GitHub events.
          </p>
        </div>
      )}
    </section>
  )
}

function Timeline({ scenes }: { scenes: Scene[] }) {
  if (scenes.length === 0) {
    return <p className="app-sub">No scenes yet — generate the story to see the timeline.</p>
  }

  const start = new Date(scenes[0].startAt).getTime()
  const end = new Date(scenes[scenes.length - 1].endAt).getTime()
  const totalMs = Math.max(1, end - start)

  return (
    <div>
      <div className="flex items-center justify-between text-[11px] text-[var(--m-ink-3)] mb-1.5">
        <span>{timeOf(scenes[0].startAt)}</span>
        <span>{timeOf(scenes[scenes.length - 1].endAt)}</span>
      </div>
      <div
        className="relative h-9 rounded-lg overflow-hidden border border-[var(--m-border)] bg-[var(--m-bg-soft)] flex"
        title="Hover scenes for details"
      >
        {scenes.map((s, i) => {
          const w = ((new Date(s.endAt).getTime() - new Date(s.startAt).getTime()) / totalMs) * 100
          const color = KIND_COLOR[s.kind] ?? KIND_COLOR.unknown
          return (
            <div
              key={i}
              className="h-full transition-opacity hover:opacity-80 cursor-default group relative"
              style={{ width: `${w}%`, background: color, minWidth: 2 }}
              title={`${KIND_LABEL[s.kind] ?? s.kind} · ${timeOf(s.startAt)}–${timeOf(s.endAt)}${s.detail ? `\n${s.detail}` : ''}`}
            />
          )
        })}
      </div>
      {/* Per-scene strip below the bar */}
      <div className="mt-3 max-h-48 overflow-y-auto space-y-1 pr-1">
        {scenes.map((s, i) => (
          <div
            key={i}
            className="grid grid-cols-[80px_1fr_auto] items-baseline gap-2 text-[12px] py-1 border-b border-[var(--m-border-soft)] last:border-0"
          >
            <span className="text-[var(--m-ink-3)] font-mono">
              {timeOf(s.startAt)}–{timeOf(s.endAt)}
            </span>
            <span className="text-[var(--m-ink)]">
              <span
                className="inline-block w-2 h-2 rounded-full mr-1.5"
                style={{ background: KIND_COLOR[s.kind] ?? KIND_COLOR.unknown }}
              />
              <strong className="font-medium text-[var(--m-ink)]">{s.label}</strong>
              {s.detail ? <span className="text-[var(--m-ink-3)]"> · {s.detail}</span> : null}
            </span>
            <span className="text-[var(--m-ink-4)] text-[11px]">{durationOf(s.startAt, s.endAt)}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

function NarrativeBlock({ narrative }: { narrative: string }) {
  if (!narrative.trim()) return null
  return (
    <div className="rounded-xl bg-gradient-to-br from-[var(--m-accent-soft)] via-[var(--m-clay-soft)] to-[var(--m-gold-soft)] border border-[var(--m-accent)]/20 p-4">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-[var(--m-accent-2)] mb-1.5">
        ✦ Narrative
      </p>
      <p className="text-[14px] leading-relaxed text-[var(--m-ink)] whitespace-pre-line">{narrative}</p>
    </div>
  )
}

function Legend({ scenes }: { scenes: Scene[] }) {
  const kinds = Array.from(new Set(scenes.map((s) => s.kind)))
  return (
    <div className="flex flex-wrap gap-2">
      {kinds.map((k) => (
        <span
          key={k}
          className="inline-flex items-center gap-1.5 text-[11px] text-[var(--m-ink-2)] px-2 py-0.5 rounded-full bg-[var(--m-bg-soft)]"
        >
          <span
            className="w-2 h-2 rounded-full"
            style={{ background: KIND_COLOR[k] ?? KIND_COLOR.unknown }}
          />
          {KIND_LABEL[k] ?? k}
        </span>
      ))}
    </div>
  )
}

function timeOf(iso: string): string {
  const d = new Date(iso)
  let h = d.getHours()
  const m = d.getMinutes()
  const ampm = h >= 12 ? 'PM' : 'AM'
  h = h % 12
  if (h === 0) h = 12
  return m === 0 ? `${h} ${ampm}` : `${h}:${String(m).padStart(2, '0')}${ampm}`
}

function durationOf(s: string, e: string): string {
  const m = Math.round((new Date(e).getTime() - new Date(s).getTime()) / 60000)
  if (m < 60) return `${m}m`
  return `${Math.floor(m / 60)}h ${m % 60}m`
}
