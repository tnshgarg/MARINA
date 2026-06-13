'use client'

import { useEffect, useState } from 'react'
import { CharacterAvatar } from '@/components/character-avatar'

type ThreadItem = {
  id: number
  kind: 'nudge' | 'suggestion' | 'note' | 'resolution'
  body: string
  createdAt: string
  author: {
    id: number
    login: string
    name: string | null
    characterKey: string | null
    avatarUrl: string | null
  } | null
}

type ActiveBlocker = {
  id: number
  startedAt: string
  reason: string
  waitingOnExternal: string | null
  thread: ThreadItem[]
}

/**
 * Live "Manager coaching" card for the employee dashboard. Shows the
 * latest items from the blocker thread — nudges sent on the user's behalf,
 * suggested workarounds, notes routed to a teammate for help — so the
 * employee can act on them WITHOUT digging into the notification bell.
 *
 * Polls `/api/me/active-blocker` every 30s while the user is blocked.
 * Auto-hides when the blocker resolves.
 */
export function BlockerCoaching() {
  const [data, setData] = useState<ActiveBlocker | null>(null)

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      try {
        const res = await fetch('/api/me/active-blocker')
        if (!res.ok) return
        const json = await res.json()
        if (!cancelled) setData(json.blocker ?? null)
      } catch {
        /* noop */
      }
    }
    load()
    const id = setInterval(load, 30_000)
    return () => {
      cancelled = true
      clearInterval(id)
    }
  }, [])

  if (!data || data.thread.length === 0) return null

  // Show the most recent 3 items so the card stays compact. Reverse so
  // the newest sits at the top — that's what the employee should react to.
  const items = [...data.thread].reverse().slice(0, 3)

  return (
    <section className="col-span-12 rounded-xl border border-[var(--m-accent)]/30 bg-[var(--m-accent-soft)]/40 p-4">
      <div className="flex items-baseline justify-between gap-3 mb-2">
        <p className="text-[11px] uppercase tracking-wider font-semibold text-[var(--m-accent-2)]">
          Coaching from your manager
        </p>
        <span className="text-[11px] text-slate-500">{data.thread.length} message{data.thread.length === 1 ? '' : 's'}</span>
      </div>
      <ul className="space-y-2">
        {items.map((t) => (
          <li
            key={t.id}
            className="flex items-start gap-2.5 rounded-lg bg-white border border-slate-200 px-3 py-2"
          >
            {t.author ? (
              <CharacterAvatar
                characterKey={t.author.characterKey} name={t.author.name} login={t.author.login}
                imageUrl={t.author.avatarUrl}
                size={28}
              />
            ) : (
              <div className="w-7 h-7 rounded-full bg-slate-100" />
            )}
            <div className="min-w-0 flex-1">
              <p className="text-[12px] text-slate-500">
                <span className="font-medium text-slate-800">
                  {t.author?.name ?? `@${t.author?.login ?? 'manager'}`}
                </span>{' '}
                <span className="text-slate-400">·</span>{' '}
                <KindLabel kind={t.kind} />
                <span className="text-slate-400"> · {timeAgo(t.createdAt)}</span>
              </p>
              <p className="mt-0.5 text-[13px] text-slate-800 leading-snug">{t.body}</p>
            </div>
          </li>
        ))}
      </ul>
    </section>
  )
}

function KindLabel({ kind }: { kind: ThreadItem['kind'] }) {
  switch (kind) {
    case 'suggestion':
      return <span className="text-[var(--m-accent-2)] font-medium">suggested a workaround</span>
    case 'nudge':
      return <span className="text-amber-700 font-medium">sent a nudge</span>
    case 'note':
      return <span className="text-slate-600 font-medium">added a note</span>
    case 'resolution':
      return <span className="text-[var(--m-good)] font-medium">resolved this</span>
  }
}

function timeAgo(iso: string): string {
  const m = Math.floor((Date.now() - new Date(iso).getTime()) / 60_000)
  if (m < 1) return 'just now'
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  return `${Math.floor(h / 24)}d ago`
}
