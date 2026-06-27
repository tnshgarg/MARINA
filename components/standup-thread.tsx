'use client'

import { useEffect, useRef, useState } from 'react'
import { CharacterAvatar } from '@/components/character-avatar'
import { MentionText } from '@/components/mention-text'

type Comment = {
  id: number
  body: string
  createdAt: string
  authorUserId: number
  authorName: string
  authorLogin: string
}

type Teammate = { userId: number; name: string | null; login: string }

/**
 * Standup discussion thread — Trello-style replies on a day's standups so the
 * team can follow up on tasks and blockers together. Visible to all teammates.
 * Type "@" to mention a teammate; mentions render in green.
 */
export function StandupThread({ orgId, day, teammates = [] }: { orgId: number; day: string; teammates?: Teammate[] }) {
  const [comments, setComments] = useState<Comment[]>([])
  const [loading, setLoading] = useState(true)
  const [draft, setDraft] = useState('')
  const [busy, setBusy] = useState(false)
  const [query, setQuery] = useState<string | null>(null)
  const ref = useRef<HTMLTextAreaElement>(null)

  const matches =
    query !== null
      ? teammates
          .filter((t) => (t.name ?? t.login).toLowerCase().includes(query.toLowerCase()) || t.login.toLowerCase().includes(query.toLowerCase()))
          .slice(0, 6)
      : []

  function onDraftChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    setDraft(e.target.value)
    const before = e.target.value.slice(0, e.target.selectionStart ?? e.target.value.length)
    const m = /(?:^|\s)@(\w*)$/.exec(before)
    setQuery(m ? m[1] : null)
  }

  function pick(t: Teammate) {
    const el = ref.current
    if (!el) return
    const caret = el.selectionStart
    const before = draft.slice(0, caret)
    const display = (t.name ?? t.login).split(' ')[0]
    const replaced = before.replace(/@(\w*)$/, `@${display} `)
    setDraft(replaced + draft.slice(caret))
    setQuery(null)
    requestAnimationFrame(() => {
      el.focus()
      const pos = replaced.length
      el.selectionStart = el.selectionEnd = pos
    })
  }

  useEffect(() => {
    let cancelled = false
    fetch(`/api/orgs/${orgId}/standup/comments?day=${day}`)
      .then((r) => r.json())
      .then((d) => {
        if (!cancelled) setComments(d.comments ?? [])
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [orgId, day])

  async function post() {
    const text = draft.trim()
    if (!text) return
    setBusy(true)
    try {
      const res = await fetch(`/api/orgs/${orgId}/standup/comments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ day, body: text }),
      })
      if (res.ok) {
        setDraft('')
        const d = await fetch(`/api/orgs/${orgId}/standup/comments?day=${day}`).then((r) => r.json())
        setComments(d.comments ?? [])
      }
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="app-card app-card-lg">
      <h2 className="app-h2">Discussion</h2>
      <p className="app-sub mt-0.5 mb-3">Follow up on today&apos;s standups — tasks, blockers, anything the team should know.</p>

      {loading ? (
        <p className="text-[12.5px] text-[var(--m-ink-4)]">Loading…</p>
      ) : comments.length === 0 ? (
        <p className="text-[12.5px] text-[var(--m-ink-3)] py-1">No messages yet. Start the conversation.</p>
      ) : (
        <ul className="space-y-3 mb-3">
          {comments.map((c) => (
            <li key={c.id} className="flex items-start gap-2.5">
              <CharacterAvatar name={c.authorName} login={c.authorLogin} characterKey={null} size={28} />
              <div className="min-w-0 flex-1">
                <p className="text-[12.5px] leading-tight">
                  <span className="font-semibold text-[var(--m-ink)]">{c.authorName}</span>
                  <span className="ml-2 text-[11px] text-[var(--m-ink-4)]">{timeAgo(c.createdAt)}</span>
                </p>
                <p className="text-[13px] text-[var(--m-ink-2)] whitespace-pre-wrap break-words leading-snug mt-0.5"><MentionText text={c.body} /></p>
              </div>
            </li>
          ))}
        </ul>
      )}

      <div className="flex items-end gap-2">
        <div className="relative flex-1">
          <textarea
            ref={ref}
            value={draft}
            onChange={onDraftChange}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) post()
            }}
            onBlur={() => setTimeout(() => setQuery(null), 150)}
            rows={2}
            placeholder="Write a message… type @ to mention · ⌘/Ctrl+Enter to send"
            className="input w-full resize-none"
            maxLength={2000}
          />
          {query !== null && matches.length > 0 && (
            <ul className="absolute z-20 left-2 right-2 bottom-full mb-1 bg-white border border-[var(--m-border)] rounded-lg shadow-lg overflow-hidden">
              {matches.map((t) => (
                <li key={t.userId}>
                  <button
                    type="button"
                    onMouseDown={(e) => {
                      e.preventDefault()
                      pick(t)
                    }}
                    className="w-full text-left px-3 py-1.5 text-[12.5px] text-[var(--m-ink)] hover:bg-[var(--m-good)]/10"
                  >
                    {t.name ?? `@${t.login}`} <span className="text-[var(--m-ink-4)]">@{t.login}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
        <button
          type="button"
          onClick={post}
          disabled={busy || draft.trim().length === 0}
          className="btn-sage text-[13px] disabled:opacity-50 shrink-0"
        >
          {busy ? '…' : 'Send'}
        </button>
      </div>
    </section>
  )
}

function timeAgo(iso: string): string {
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const h = Math.floor(mins / 60)
  if (h < 24) return `${h}h ago`
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}
