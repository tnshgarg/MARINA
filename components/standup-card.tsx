'use client'

import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'

type Teammate = { userId: number; name: string | null; login: string }

/**
 * File today's standup from the web. Yesterday/Today are list-style inputs
 * (Enter starts a new bullet) so updates stay scannable, and typing "@" lets you
 * mention a teammate — they'll see they were tagged and can reply in the thread.
 */
export function StandupCard({
  orgId,
  prefill,
  existing,
  teammates = [],
}: {
  orgId: number
  prefill: { yesterday: string; blockers: string }
  existing: { yesterday: string; today: string; blockers: string } | null
  teammates?: Teammate[]
}) {
  const router = useRouter()
  const [yesterday, setYesterday] = useState(existing?.yesterday || prefill.yesterday)
  const [today, setToday] = useState(existing?.today || '')
  const [blockers, setBlockers] = useState(existing?.blockers || prefill.blockers)
  const [mentions, setMentions] = useState<Set<number>>(new Set())
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState<{ kind: 'idle' | 'ok' | 'error'; text?: string }>(
    existing ? { kind: 'ok', text: 'Filed for today — edit and re-post anytime.' } : { kind: 'idle' },
  )

  function addMention(id: number) {
    setMentions((prev) => new Set(prev).add(id))
  }

  async function submit() {
    if (!today.trim()) {
      setStatus({ kind: 'error', text: "Add what you're working on today." })
      return
    }
    setBusy(true)
    setStatus({ kind: 'idle' })
    try {
      const r = await fetch(`/api/orgs/${orgId}/standup`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ yesterday, today, blockers, mentions: Array.from(mentions) }),
      })
      if (!r.ok) {
        const d = await r.json().catch(() => ({}))
        setStatus({ kind: 'error', text: d.error ?? 'Could not post.' })
        setBusy(false)
        return
      }
      setBusy(false)
      setStatus({ kind: 'ok', text: 'Posted — your team can see it.' })
      router.refresh()
    } catch {
      setStatus({ kind: 'error', text: 'Could not post.' })
      setBusy(false)
    }
  }

  const statusColor =
    status.kind === 'ok' ? 'text-[var(--m-good)]' : status.kind === 'error' ? 'text-[var(--m-bad)]' : 'text-transparent'

  return (
    <div className="rounded-xl border border-[var(--m-border)] bg-white p-4">
      <p className="text-[13px] font-semibold text-[var(--m-ink)]">Today&apos;s standup</p>
      <p className="text-[11.5px] text-[var(--m-ink-4)] mb-2.5">
        Press Enter for a new point · type <span className="font-mono">@</span> to mention a teammate.
      </p>

      <label className="block text-[11px] font-medium text-[var(--m-ink-3)] mb-0.5">Yesterday</label>
      <ListInput value={yesterday} onChange={setYesterday} teammates={teammates} onMention={addMention} placeholder="What you shipped" />

      <label className="block text-[11px] font-medium text-[var(--m-ink-3)] mb-0.5 mt-2">Today</label>
      <ListInput
        value={today}
        onChange={(v) => {
          setToday(v)
          setStatus({ kind: 'idle' })
        }}
        teammates={teammates}
        onMention={addMention}
        placeholder="What you're focusing on"
      />

      <label className="block text-[11px] font-medium text-[var(--m-ink-3)] mb-0.5 mt-2">Blockers (optional)</label>
      <input value={blockers} onChange={(e) => setBlockers(e.target.value)} placeholder="Anything in your way?" className="input w-full text-[13px]" />

      <div className="mt-2.5 flex items-center justify-between gap-2">
        <span className={`text-[12px] ${statusColor}`}>{status.text ?? '·'}</span>
        <button type="button" onClick={submit} disabled={busy || !today.trim()} className="btn-sage text-[12.5px] disabled:opacity-50 shrink-0">
          {busy ? 'Posting…' : existing ? 'Update standup' : 'Post standup'}
        </button>
      </div>
    </div>
  )
}

/**
 * A list-style textarea: Enter inserts a new "• " bullet, and typing "@" opens a
 * teammate picker. Selecting one inserts "@Name " and records the mention.
 */
function ListInput({
  value,
  onChange,
  teammates,
  onMention,
  placeholder,
}: {
  value: string
  onChange: (v: string) => void
  teammates: Teammate[]
  onMention: (id: number) => void
  placeholder: string
}) {
  const ref = useRef<HTMLTextAreaElement>(null)
  const [query, setQuery] = useState<string | null>(null) // active @query, or null

  const matches =
    query !== null
      ? teammates
          .filter((t) => (t.name ?? t.login).toLowerCase().includes(query.toLowerCase()) || t.login.toLowerCase().includes(query.toLowerCase()))
          .slice(0, 6)
      : []

  function detectMention(text: string, caret: number) {
    const before = text.slice(0, caret)
    const m = /(?:^|\s)@(\w*)$/.exec(before)
    setQuery(m ? m[1] : null)
  }

  function handleChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    onChange(e.target.value)
    detectMention(e.target.value, e.target.selectionStart ?? e.target.value.length)
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && query === null) {
      e.preventDefault()
      const el = ref.current
      if (!el) return
      const caret = el.selectionStart
      const next = value.slice(0, caret) + '\n• ' + value.slice(el.selectionEnd)
      onChange(next)
      requestAnimationFrame(() => {
        const pos = caret + 3
        el.selectionStart = el.selectionEnd = pos
        el.focus()
      })
    }
  }

  function handleFocus() {
    if (value.trim() === '') onChange('• ')
  }
  function handleBlur() {
    if (value.trim() === '•' || value.trim() === '') onChange('')
    setTimeout(() => setQuery(null), 150) // allow click on dropdown
  }

  function pick(t: Teammate) {
    const el = ref.current
    if (!el) return
    const caret = el.selectionStart
    const before = value.slice(0, caret)
    const display = (t.name ?? t.login).split(' ')[0]
    const replaced = before.replace(/@(\w*)$/, `@${display} `)
    const next = replaced + value.slice(caret)
    onChange(next)
    onMention(t.userId)
    setQuery(null)
    requestAnimationFrame(() => {
      const pos = replaced.length
      el.selectionStart = el.selectionEnd = pos
      el.focus()
    })
  }

  return (
    <div className="relative">
      <textarea
        ref={ref}
        value={value}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        onFocus={handleFocus}
        onBlur={handleBlur}
        rows={3}
        placeholder={`• ${placeholder}`}
        className="input w-full text-[13px] resize-y leading-relaxed"
      />
      {query !== null && matches.length > 0 && (
        <ul className="absolute z-20 left-2 right-2 mt-1 bg-white border border-[var(--m-border)] rounded-lg shadow-lg overflow-hidden">
          {matches.map((t) => (
            <li key={t.userId}>
              <button
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault()
                  pick(t)
                }}
                className="w-full text-left px-3 py-1.5 text-[12.5px] text-[var(--m-ink)] hover:bg-[var(--m-accent-soft)]"
              >
                {t.name ?? `@${t.login}`} <span className="text-[var(--m-ink-4)]">@{t.login}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
