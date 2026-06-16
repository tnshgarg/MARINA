'use client'

import { CollaborationConstellation, type CNode, type CEdge } from '@/components/collaboration-constellation'

export type GhDetail = {
  name: string
  commits: number
  prs: Array<{ title: string; url: string; status: string }>
  reviewsGiven: Array<{ title: string; url: string; prAuthor: string | null; verdict: string | null }>
  reviewsReceived: Array<{ title: string; url: string; reviewer: string; verdict: string | null }>
  recentCommitTitles: string[]
}

const STATUS: Record<string, { bg: string; fg: string; label: string }> = {
  in_review: { bg: 'rgba(217,160,74,.18)', fg: '#f0c98a', label: 'review' },
  open: { bg: 'rgba(148,163,184,.18)', fg: '#cbd5e1', label: 'open' },
  merged: { bg: 'rgba(167,139,250,.2)', fg: '#c4b5fd', label: 'merged' },
  closed: { bg: 'rgba(244,114,114,.18)', fg: '#fca5a5', label: 'closed' },
  draft: { bg: 'rgba(148,163,184,.14)', fg: '#94a3b8', label: 'draft' },
}

function Pill({ status }: { status: string }) {
  const c = STATUS[status] ?? STATUS.open
  return (
    <span className="shrink-0 text-[9px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded" style={{ background: c.bg, color: c.fg }}>
      {c.label}
    </span>
  )
}

function GithubNodeDetail({ d }: { d: GhDetail }) {
  return (
    <div className="text-slate-200">
      <p className="text-[15px] font-semibold text-white pr-8">{d.name}</p>
      <p className="mt-0.5 text-[11.5px] text-slate-400 tabular-nums">
        {d.commits} commits · {d.prs.length} PRs · {d.reviewsGiven.length} reviews given · {d.reviewsReceived.length} received
      </p>

      {d.prs.length > 0 && (
        <div className="mt-4">
          <h4 className="text-[10px] uppercase tracking-wider font-semibold text-slate-500 mb-1.5">Pull requests</h4>
          <ul className="space-y-1.5">
            {d.prs.slice(0, 8).map((p) => (
              <li key={p.url}>
                <a href={p.url} target="_blank" rel="noreferrer" className="flex items-baseline gap-1.5 group">
                  <Pill status={p.status} />
                  <span className="text-[12px] text-slate-200 group-hover:text-white truncate">{p.title}</span>
                </a>
              </li>
            ))}
          </ul>
        </div>
      )}

      {d.prs.length === 0 && d.recentCommitTitles.length > 0 && (
        <div className="mt-4">
          <h4 className="text-[10px] uppercase tracking-wider font-semibold text-slate-500 mb-1.5">Recent commits</h4>
          <ul className="space-y-0.5">
            {d.recentCommitTitles.slice(0, 6).map((t, i) => (
              <li key={i} className="text-[12px] text-slate-300 truncate">· {t}</li>
            ))}
          </ul>
        </div>
      )}

      {d.reviewsGiven.length > 0 && (
        <div className="mt-4">
          <h4 className="text-[10px] uppercase tracking-wider font-semibold text-slate-500 mb-1.5">Reviewing others</h4>
          <ul className="space-y-1">
            {d.reviewsGiven.slice(0, 6).map((r, i) => (
              <li key={i}>
                <a href={r.url} target="_blank" rel="noreferrer" className="text-[12px] text-slate-300 hover:text-white truncate block">
                  {r.prAuthor ? <span className="text-slate-500">@{r.prAuthor}: </span> : null}{r.title}
                </a>
              </li>
            ))}
          </ul>
        </div>
      )}

      {d.reviewsReceived.length > 0 && (
        <div className="mt-4">
          <h4 className="text-[10px] uppercase tracking-wider font-semibold text-slate-500 mb-1.5">Their work reviewed by</h4>
          <ul className="space-y-1">
            {d.reviewsReceived.slice(0, 6).map((r, i) => (
              <li key={i} className="text-[12px] text-slate-300 truncate">
                <span className="text-slate-500">{r.reviewer}: </span>{r.title}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

export default function GithubConstellation({
  nodes,
  edges,
  detail,
}: {
  nodes: CNode[]
  edges: CEdge[]
  detail: Record<number, GhDetail>
}) {
  return (
    <CollaborationConstellation
      nodes={nodes}
      edges={edges}
      accent="#6fae8e"
      emptyHint="No commits, PRs or reviews to map in the last 14 days."
      renderDetail={(id) => {
        const d = detail[id]
        return d ? <GithubNodeDetail d={d} /> : null
      }}
    />
  )
}
