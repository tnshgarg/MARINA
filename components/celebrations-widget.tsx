'use client'

import { useEffect, useState } from 'react'
import { CharacterAvatar } from '@/components/character-avatar'

type Item = {
  userId: number
  name: string
  login: string
  characterKey: string | null
  kind: 'birthday' | 'anniversary'
  whenIso: string
  yearsAtCompany?: number
}

/**
 * "Coming up" — birthdays + work anniversaries in the next 30 days.
 * Shown on the org dashboard. Drives small culture moments without
 * adding a separate "HR rituals" page.
 *
 * Renders nothing when there's nothing to show — empty states feel
 * worse than absence for this kind of feature.
 */
export function CelebrationsWidget({ orgId }: { orgId: number }) {
  const [items, setItems] = useState<Item[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const res = await fetch(`/api/orgs/${orgId}/celebrations`)
        if (!cancelled && res.ok) {
          const data = await res.json()
          setItems(data.items ?? [])
        }
      } catch {
        // silent — feature is optional
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [orgId])

  if (loading) return null

  // Empty state — instead of hiding entirely, prompt the manager to set
  // birthday + joining-on dates. Otherwise the feature is invisible.
  if (items.length === 0) {
    return (
      <section className="rounded-xl border border-dashed border-[var(--m-border)] bg-white p-4">
        <div className="flex items-baseline justify-between gap-2 mb-1.5">
          <h3 className="text-[12.5px] font-semibold text-[var(--m-ink)]">Coming up</h3>
          <span className="text-[10.5px] uppercase tracking-wider text-[var(--m-ink-4)]">
            birthdays · anniversaries
          </span>
        </div>
        <p className="text-[12px] text-[var(--m-ink-3)] leading-snug">
          Nothing on the calendar yet. Open any teammate's profile to set their birthday and
          joining date — MARINA will remind you here when one's coming up.
        </p>
      </section>
    )
  }

  return (
    <section className="rounded-xl border border-[var(--m-border)] bg-white p-4">
      <div className="flex items-baseline justify-between gap-2 mb-2.5">
        <h3 className="text-[12.5px] font-semibold text-[var(--m-ink)]">
          Coming up
        </h3>
        <span className="text-[10.5px] uppercase tracking-wider text-[var(--m-ink-4)]">
          next 30 days
        </span>
      </div>
      <ul className="space-y-1.5">
        {items.slice(0, 6).map((it, i) => (
          <li
            key={`${it.userId}-${it.kind}-${i}`}
            className="flex items-center gap-2.5 text-[12.5px]"
          >
            <CharacterAvatar characterKey={it.characterKey} size={24} />
            <div className="flex-1 min-w-0">
              <p className="text-[var(--m-ink)] truncate">
                <span className="font-medium">{it.name}</span>
                {it.kind === 'birthday' ? (
                  <span className="text-[var(--m-ink-3)]"> · birthday</span>
                ) : (
                  <span className="text-[var(--m-ink-3)]">
                    {' '}· {it.yearsAtCompany} year{it.yearsAtCompany === 1 ? '' : 's'} at the company
                  </span>
                )}
              </p>
            </div>
            <span className="shrink-0 text-[11px] text-[var(--m-ink-3)] tabular-nums">
              {formatWhen(it.whenIso)}
            </span>
            <span aria-hidden className="shrink-0 text-[14px]">
              {it.kind === 'birthday' ? '🎂' : '🎉'}
            </span>
          </li>
        ))}
      </ul>
    </section>
  )
}

function formatWhen(iso: string): string {
  const d = new Date(iso + 'T00:00:00')
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const diffDays = Math.round((d.getTime() - today.getTime()) / (24 * 60 * 60 * 1000))
  if (diffDays === 0) return 'Today'
  if (diffDays === 1) return 'Tomorrow'
  if (diffDays <= 7) return `${diffDays}d away`
  return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' })
}
