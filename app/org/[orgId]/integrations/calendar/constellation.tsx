'use client'

import { CollaborationConstellation, type CNode, type CEdge } from '@/components/collaboration-constellation'

export type CalDetail = {
  name: string
  count: number
  meetings: Array<{ title: string; startAt: string; attendees: number }>
}

function fmt(iso: string) {
  const d = new Date(iso)
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' }) + ' · ' + d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
}

function CalendarNodeDetail({ d }: { d: CalDetail }) {
  return (
    <div className="text-slate-200">
      <p className="text-[15px] font-semibold text-white pr-8">{d.name}</p>
      <p className="mt-0.5 text-[11.5px] text-slate-400 tabular-nums">{d.count} meeting{d.count === 1 ? '' : 's'} in this window</p>
      {d.meetings.length > 0 ? (
        <div className="mt-4">
          <h4 className="text-[10px] uppercase tracking-wider font-semibold text-slate-500 mb-1.5">Meetings</h4>
          <ul className="space-y-2">
            {d.meetings.slice(0, 12).map((m, i) => (
              <li key={i}>
                <p className="text-[12.5px] text-slate-200 truncate">{m.title}</p>
                <p className="text-[10.5px] text-slate-500 tabular-nums">
                  {fmt(m.startAt)}{m.attendees > 0 ? ` · ${m.attendees} attendee${m.attendees === 1 ? '' : 's'}` : ''}
                </p>
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <p className="mt-4 text-[12px] text-slate-400 italic">No meetings in this window.</p>
      )}
    </div>
  )
}

export default function CalendarConstellation({
  nodes,
  edges,
  detail,
}: {
  nodes: CNode[]
  edges: CEdge[]
  detail: Record<number, CalDetail>
}) {
  return (
    <CollaborationConstellation
      nodes={nodes}
      edges={edges}
      accent="#7aa2d6"
      emptyHint="No meetings across the team in this window."
      renderDetail={(id) => {
        const d = detail[id]
        return d ? <CalendarNodeDetail d={d} /> : null
      }}
    />
  )
}
