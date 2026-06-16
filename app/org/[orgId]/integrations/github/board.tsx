'use client'

import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'

export type GhPerson = {
  id: number
  name: string
  commits: number
  reviewCount: number
  prs: Array<{ title: string; url: string; status: string }>
  reviewing: string[]
  reviewedBy: string[]
  recentCommitTitles: string[]
  total: number
}

const STATUS: Record<string, { bg: string; fg: string; label: string }> = {
  in_review: { bg: 'var(--m-warn-soft)', fg: 'var(--m-warn)', label: 'review' },
  open: { bg: 'var(--m-bg-soft)', fg: 'var(--m-ink-3)', label: 'open' },
  merged: { bg: 'var(--m-clay-soft)', fg: 'var(--m-clay-deep)', label: 'merged' },
  closed: { bg: 'var(--m-bad-soft)', fg: 'var(--m-bad)', label: 'closed' },
  draft: { bg: 'var(--m-bg-soft)', fg: 'var(--m-ink-4)', label: 'draft' },
}

function Pill({ status }: { status: string }) {
  const c = STATUS[status] ?? STATUS.open
  return (
    <span className="shrink-0 text-[9px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded" style={{ background: c.bg, color: c.fg }}>
      {c.label}
    </span>
  )
}

export default function GithubBoard({ people }: { people: GhPerson[] }) {
  const [mode, setMode] = useState<'collab' | 'all'>('collab')
  const [selected, setSelected] = useState<GhPerson | null>(null)
  const shown = useMemo(() => {
    const list = mode === 'collab' ? people.filter((p) => p.prs.length > 0 || p.reviewing.length > 0 || p.reviewedBy.length > 0) : people
    return [...list].sort((a, b) => b.total - a.total)
  }, [people, mode])

  return (
    <div>
      <div className="flex items-center justify-between gap-2 mb-2.5 flex-wrap">
        <p className="text-[11.5px] text-[var(--m-ink-4)]">
          {shown.length} {mode === 'collab' ? 'active collaborator' : 'person'}{shown.length === 1 ? '' : 's'} · click anyone for detail
        </p>
        <div className="inline-flex rounded-lg border border-[var(--m-border)] overflow-hidden text-[11.5px]">
          {(['collab', 'all'] as const).map((m, i) => (
            <button
              key={m}
              type="button"
              onClick={() => setMode(m)}
              className={`px-2.5 py-1 transition ${i ? 'border-l border-[var(--m-border)]' : ''} ${
                mode === m ? 'bg-[var(--m-accent-soft)] text-[var(--m-accent-2)] font-medium' : 'text-[var(--m-ink-3)] hover:bg-[var(--m-bg-soft)]'
              }`}
            >
              {m === 'collab' ? 'Collaborators' : 'Everyone'}
            </button>
          ))}
        </div>
      </div>

      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {shown.map((p) => (
          <Card key={p.id} p={p} onOpen={() => setSelected(p)} />
        ))}
      </div>

      <PersonModal person={selected} onClose={() => setSelected(null)} />
    </div>
  )
}

function Card({ p, onOpen }: { p: GhPerson; onOpen: () => void }) {
  const hasCollab = p.reviewing.length > 0 || p.reviewedBy.length > 0
  return (
    <button type="button" onClick={onOpen} className="text-left rounded-xl border border-[var(--m-border)] bg-white p-3.5 flex flex-col hover:border-[var(--m-ink-5)] hover:shadow-[var(--m-shadow-sm)] transition">
      <div className="flex items-baseline justify-between gap-2">
        <p className="text-[13px] font-semibold text-[var(--m-ink)] truncate">{p.name}</p>
        <span className="shrink-0 text-[10px] text-[var(--m-ink-4)] tabular-nums">{p.total} acts</span>
      </div>
      <p className="mt-0.5 text-[11px] text-[var(--m-ink-4)] tabular-nums">
        {p.commits} commits · {p.prs.length} PRs · {p.reviewCount} reviews
      </p>

      <div className="mt-2.5">
        {p.prs.length > 0 ? (
          <ul className="space-y-1">
            {p.prs.slice(0, 3).map((pr) => (
              <li key={pr.url} className="flex items-baseline gap-1.5">
                <Pill status={pr.status} />
                <span className="text-[12px] text-[var(--m-ink)] truncate">{pr.title}</span>
              </li>
            ))}
            {p.prs.length > 3 && <li className="text-[11px] font-medium text-[var(--m-accent)]">+{p.prs.length - 3} more PRs</li>}
          </ul>
        ) : p.recentCommitTitles.length > 0 ? (
          <ul className="space-y-0.5">
            {p.recentCommitTitles.slice(0, 2).map((t, i) => (
              <li key={i} className="text-[12px] text-[var(--m-ink-2)] truncate">· {t}</li>
            ))}
          </ul>
        ) : (
          <p className="text-[11.5px] text-[var(--m-ink-4)] italic">No PRs or commits.</p>
        )}
      </div>

      {hasCollab ? (
        <div className="mt-2.5 pt-2.5 border-t border-[var(--m-border-soft)] space-y-1">
          {p.reviewing.length > 0 && (
            <p className="text-[11.5px] text-[var(--m-ink-3)] truncate">
              <span className="text-[var(--m-accent-2)] font-medium">Reviewing</span> → {p.reviewing.slice(0, 4).join(', ')}
              {p.reviewing.length > 4 ? ` +${p.reviewing.length - 4}` : ''}
            </p>
          )}
          {p.reviewedBy.length > 0 && (
            <p className="text-[11.5px] text-[var(--m-ink-3)] truncate">
              <span className="text-[var(--m-clay-deep)] font-medium">Reviewed by</span> → {p.reviewedBy.slice(0, 4).join(', ')}
              {p.reviewedBy.length > 4 ? ` +${p.reviewedBy.length - 4}` : ''}
            </p>
          )}
        </div>
      ) : (
        <p className="mt-2.5 pt-2.5 border-t border-[var(--m-border-soft)] text-[11px] text-[var(--m-ink-4)] italic">Working solo — no reviews exchanged.</p>
      )}
    </button>
  )
}

function PersonModal({ person, onClose }: { person: GhPerson | null; onClose: () => void }) {
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])
  if (!person || !mounted) return null
  const p = person
  return createPortal(
    <div className="fixed inset-0 z-[120] flex items-center justify-center px-4 bg-[var(--m-ink)]/40" onClick={onClose}>
      <div className="w-full max-w-md max-h-[85vh] overflow-y-auto bg-white rounded-2xl shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="sticky top-0 bg-white px-5 py-3.5 border-b border-[var(--m-border)] flex items-start justify-between gap-3">
          <div>
            <p className="text-[15px] font-semibold text-[var(--m-ink)]">{p.name}</p>
            <p className="text-[11.5px] text-[var(--m-ink-4)] tabular-nums">{p.commits} commits · {p.prs.length} PRs · {p.reviewCount} reviews · last 14 days</p>
          </div>
          <button onClick={onClose} aria-label="Close" className="shrink-0 text-[var(--m-ink-4)] hover:text-[var(--m-ink)] text-[15px]">✕</button>
        </div>
        <div className="px-5 py-4 space-y-4">
          {p.prs.length > 0 && (
            <div>
              <h4 className="text-[10.5px] uppercase tracking-wider font-semibold text-[var(--m-ink-4)] mb-1.5">Pull requests</h4>
              <ul className="space-y-1.5">
                {p.prs.map((pr) => (
                  <li key={pr.url}>
                    <a href={pr.url} target="_blank" rel="noreferrer" className="flex items-baseline gap-1.5 group">
                      <Pill status={pr.status} />
                      <span className="text-[12.5px] text-[var(--m-ink)] group-hover:text-[var(--m-accent)]">{pr.title}</span>
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {p.reviewing.length > 0 && (
            <div>
              <h4 className="text-[10.5px] uppercase tracking-wider font-semibold text-[var(--m-ink-4)] mb-1.5">Reviewing others' work</h4>
              <div className="flex flex-wrap gap-1.5">
                {p.reviewing.map((n, i) => (
                  <span key={i} className="text-[11.5px] rounded-md bg-[var(--m-accent-soft)] text-[var(--m-accent-2)] px-2 py-0.5">{n}</span>
                ))}
              </div>
            </div>
          )}
          {p.reviewedBy.length > 0 && (
            <div>
              <h4 className="text-[10.5px] uppercase tracking-wider font-semibold text-[var(--m-ink-4)] mb-1.5">Their work reviewed by</h4>
              <div className="flex flex-wrap gap-1.5">
                {p.reviewedBy.map((n, i) => (
                  <span key={i} className="text-[11.5px] rounded-md bg-[var(--m-clay-soft)] text-[var(--m-clay-deep)] px-2 py-0.5">{n}</span>
                ))}
              </div>
            </div>
          )}
          {p.recentCommitTitles.length > 0 && (
            <div>
              <h4 className="text-[10.5px] uppercase tracking-wider font-semibold text-[var(--m-ink-4)] mb-1.5">Recent commits</h4>
              <ul className="space-y-0.5">
                {p.recentCommitTitles.map((t, i) => (
                  <li key={i} className="text-[12.5px] text-[var(--m-ink-2)]">· {t}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body,
  )
}
