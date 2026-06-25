'use client'

import { useEffect, useRef, useState } from 'react'

/**
 * Choose which repos count toward your report — so personal side-projects stay
 * out of your work updates. Empty = include everything. Match is a loose
 * substring on "owner/name" (e.g. "acme" includes all acme repos).
 *
 * Input is a chip field: paste one or many GitHub links (or type "owner/name"),
 * each becomes a removable pill. URLs / SSH / trailing paths are normalised down
 * to "owner/name" (or "owner") so they match how we store events. Saves itself.
 */

/** Normalise a pasted GitHub repo reference to a tracked token. */
function normalizeRepo(raw: string): string {
  let s = raw.trim()
  if (!s) return ''
  s = s
    .replace(/^git@github\.com:/i, '')
    .replace(/^https?:\/\/(www\.)?github\.com\//i, '')
    .replace(/^github\.com\//i, '')
    .replace(/[?#].*$/, '') // drop query / hash
    .replace(/\.git$/i, '') // drop .git
    .replace(/\/+$/, '') // trailing slashes
  const parts = s.split('/').filter(Boolean)
  if (parts.length >= 2) return `${parts[0]}/${parts[1]}`.toLowerCase()
  return (parts[0] ?? '').toLowerCase()
}

/** Split a blob (commas / spaces / newlines / multiple links) into tokens. */
function tokenize(input: string): string[] {
  return input
    .split(/[\s,]+/)
    .map(normalizeRepo)
    .filter(Boolean)
}

export function TrackedRepos() {
  const [repos, setRepos] = useState<string[]>([])
  const [input, setInput] = useState('')
  const [loaded, setLoaded] = useState(false)
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved'>('idle')
  const skipSave = useRef(true)

  useEffect(() => {
    fetch('/api/me/tracked-repos')
      .then((r) => r.json())
      .then((d) => setRepos(Array.isArray(d.repos) ? d.repos : []))
      .catch(() => {})
      .finally(() => setLoaded(true))
  }, [])

  // Persist whenever the set changes — skipping the initial load.
  useEffect(() => {
    if (!loaded) return
    if (skipSave.current) {
      skipSave.current = false
      return
    }
    let cancelled = false
    setStatus('saving')
    fetch('/api/me/tracked-repos', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ repos }),
    })
      .then(() => {
        if (cancelled) return
        setStatus('saved')
        setTimeout(() => setStatus('idle'), 1600)
      })
      .catch(() => {
        if (!cancelled) setStatus('idle')
      })
    return () => {
      cancelled = true
    }
  }, [repos, loaded])

  function addTokens(text: string) {
    const next = tokenize(text)
    if (next.length === 0) return
    setRepos((prev) => {
      const seen = new Set(prev)
      const merged = [...prev]
      for (const t of next) {
        if (!seen.has(t)) {
          seen.add(t)
          merged.push(t)
        }
      }
      return merged.slice(0, 50)
    })
  }

  function commitInput() {
    if (input.trim()) {
      addTokens(input)
      setInput('')
    }
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault()
      commitInput()
    } else if (e.key === 'Backspace' && !input && repos.length) {
      setRepos((prev) => prev.slice(0, -1)) // delete last chip
    }
  }

  function onPaste(e: React.ClipboardEvent<HTMLInputElement>) {
    const text = e.clipboardData.getData('text')
    // Intercept multi-value / link pastes; let a plain single token type through.
    if (/[\s,]/.test(text) || /github\.com/i.test(text)) {
      e.preventDefault()
      addTokens((input ? input + ' ' : '') + text)
      setInput('')
    }
  }

  function remove(repo: string) {
    setRepos((prev) => prev.filter((r) => r !== repo))
  }

  return (
    <section className="app-card app-card-lg">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="app-eyebrow">Privacy</p>
          <h2 className="app-h2 mt-0.5">Which repos count?</h2>
        </div>
        {loaded && status !== 'idle' && (
          <span className="text-[11.5px] text-[var(--m-ink-4)] shrink-0 mt-0.5">
            {status === 'saving' ? 'Saving…' : 'Saved ✓'}
          </span>
        )}
      </div>
      <p className="app-sub mt-1 max-w-md">
        Keep personal projects out of your reports. Paste GitHub repo links or type{' '}
        <span className="text-[var(--m-ink-2)] font-medium">owner/name</span> &mdash; leave empty to include everything.
      </p>

      <div
        className="mt-3 rounded-lg border border-[var(--m-border)] bg-white px-2 py-1.5 flex flex-wrap items-center gap-1.5 transition focus-within:border-[var(--m-accent)] focus-within:ring-2 focus-within:ring-[var(--m-accent-glow)]"
        onMouseDown={(e) => {
          // Clicking the empty area focuses the input (chip-field affordance).
          if (e.target === e.currentTarget) {
            ;(e.currentTarget.querySelector('input') as HTMLInputElement | null)?.focus()
          }
        }}
      >
        {repos.map((r) => (
          <span
            key={r}
            className="inline-flex items-center gap-1 pl-2 pr-0.5 py-0.5 rounded-md bg-[var(--m-accent-soft)] text-[var(--m-accent-2)] text-[12.5px] font-medium max-w-full"
          >
            <span className="truncate">{r}</span>
            <button
              type="button"
              onClick={() => remove(r)}
              aria-label={`Remove ${r}`}
              className="shrink-0 w-4 h-4 inline-flex items-center justify-center rounded hover:bg-[var(--m-accent)]/20 transition-colors"
            >
              <svg width={9} height={9} viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth={1.8} aria-hidden>
                <path d="M1.5 1.5l7 7M8.5 1.5l-7 7" strokeLinecap="round" />
              </svg>
            </button>
          </span>
        ))}
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={onKeyDown}
          onPaste={onPaste}
          onBlur={commitInput}
          disabled={!loaded}
          placeholder={repos.length ? 'Add another…' : 'Paste github.com/acme/web, or type acme/api…'}
          className="flex-1 min-w-[150px] px-1.5 py-1 text-[13px] bg-transparent outline-none disabled:opacity-60"
        />
      </div>
      <p className="mt-2 text-[11.5px] text-[var(--m-ink-4)]">
        {repos.length === 0
          ? 'Tracking everything. Add a repo to narrow it down.'
          : `Tracking ${repos.length} ${repos.length === 1 ? 'repo' : 'repos'} · press Enter or paste links to add more`}
      </p>
    </section>
  )
}
