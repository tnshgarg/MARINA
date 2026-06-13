'use client'

import { useMemo, useState } from 'react'
import type { HealthVerdict } from '@/lib/admin/analytics'

type Row = {
  orgId: number
  name: string
  plan: string
  seats: number
  active7d: number
  active30d: number
  shifts7d: number
  blockersOpen: number
  deliverables7d: number
  spendUsd: string
  syncErrors: number
  slackConnected: boolean
  health: HealthVerdict
  lastActivityFmt: string
  createdAt: string
}

type SortKey = 'name' | 'seats' | 'active7d' | 'shifts7d' | 'spend' | 'lastActivity' | 'health'

const HEALTH_RANK: Record<HealthVerdict, number> = {
  at_risk: 0,
  churned: 1,
  new: 2,
  growing: 3,
  healthy: 4,
}

export function WorkspacesClient({ orgs }: { orgs: Row[] }) {
  const [q, setQ] = useState('')
  const [planFilter, setPlanFilter] = useState<'all' | 'free' | 'team' | 'scale'>('all')
  const [healthFilter, setHealthFilter] = useState<'all' | HealthVerdict>('all')
  const [sort, setSort] = useState<SortKey>('seats')
  const [dir, setDir] = useState<'asc' | 'desc'>('desc')

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase()
    let list = orgs.filter((o) => {
      if (planFilter !== 'all' && o.plan !== planFilter) return false
      if (healthFilter !== 'all' && o.health !== healthFilter) return false
      if (term && !o.name.toLowerCase().includes(term)) return false
      return true
    })
    list = list.slice().sort((a, b) => {
      let av: number | string = 0
      let bv: number | string = 0
      switch (sort) {
        case 'name':
          av = a.name.toLowerCase()
          bv = b.name.toLowerCase()
          break
        case 'seats':
          av = a.seats
          bv = b.seats
          break
        case 'active7d':
          av = a.active7d
          bv = b.active7d
          break
        case 'shifts7d':
          av = a.shifts7d
          bv = b.shifts7d
          break
        case 'spend':
          av = parseFloat(a.spendUsd.replace('$', '')) || 0
          bv = parseFloat(b.spendUsd.replace('$', '')) || 0
          break
        case 'lastActivity':
          av = a.lastActivityFmt
          bv = b.lastActivityFmt
          break
        case 'health':
          av = HEALTH_RANK[a.health]
          bv = HEALTH_RANK[b.health]
          break
      }
      if (av < bv) return dir === 'asc' ? -1 : 1
      if (av > bv) return dir === 'asc' ? 1 : -1
      return 0
    })
    return list
  }, [orgs, q, planFilter, healthFilter, sort, dir])

  function flip(key: SortKey) {
    if (sort === key) setDir(dir === 'asc' ? 'desc' : 'asc')
    else {
      setSort(key)
      setDir(key === 'name' ? 'asc' : 'desc')
    }
  }

  return (
    <>
      <div className="flex items-center gap-2 mb-4 flex-wrap">
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search workspaces…"
          className="px-3 py-2 rounded-lg bg-white/[0.03] border border-white/10 text-[13px] text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-amber-400/40 w-64"
        />
        <select
          value={planFilter}
          onChange={(e) => setPlanFilter(e.target.value as typeof planFilter)}
          className="px-3 py-2 rounded-lg bg-white/[0.03] border border-white/10 text-[13px] text-slate-100"
        >
          <option value="all">All plans</option>
          <option value="free">Free</option>
          <option value="team">Team</option>
          <option value="scale">Scale</option>
        </select>
        <select
          value={healthFilter}
          onChange={(e) => setHealthFilter(e.target.value as typeof healthFilter)}
          className="px-3 py-2 rounded-lg bg-white/[0.03] border border-white/10 text-[13px] text-slate-100"
        >
          <option value="all">Any health</option>
          <option value="new">New</option>
          <option value="healthy">Healthy</option>
          <option value="growing">Growing</option>
          <option value="at_risk">At risk</option>
          <option value="churned">Churned</option>
        </select>
        <span className="ml-auto text-[12px] text-slate-500">{filtered.length} shown</span>
      </div>

      <div className="rounded-xl border border-white/5 overflow-hidden">
        <div className="grid grid-cols-[minmax(0,1.6fr)_70px_80px_70px_70px_70px_90px_80px] gap-3 px-4 py-2.5 border-b border-white/5 bg-white/[0.02] text-[10.5px] uppercase tracking-wider text-slate-500 font-semibold">
          <SortBtn label="Workspace"  active={sort === 'name'}        dir={dir} onClick={() => flip('name')} />
          <SortBtn label="Plan"        active={false}                  dir={dir} onClick={() => {}} disabled />
          <SortBtn label="Seats"       active={sort === 'seats'}       dir={dir} onClick={() => flip('seats')} />
          <SortBtn label="7d active"   active={sort === 'active7d'}    dir={dir} onClick={() => flip('active7d')} />
          <SortBtn label="7d shifts"   active={sort === 'shifts7d'}    dir={dir} onClick={() => flip('shifts7d')} />
          <SortBtn label="Block"        active={false}                  dir={dir} onClick={() => {}} disabled />
          <SortBtn label="AI spend"    active={sort === 'spend'}       dir={dir} onClick={() => flip('spend')} />
          <SortBtn label="Health"      active={sort === 'health'}      dir={dir} onClick={() => flip('health')} />
        </div>
        {filtered.length === 0 ? (
          <p className="px-4 py-10 text-center text-[13px] text-slate-500 bg-white/[0.02]">
            No workspaces match these filters.
          </p>
        ) : (
          <ul className="divide-y divide-white/5">
            {filtered.map((o) => (
              <li
                key={o.orgId}
                className="grid grid-cols-[minmax(0,1.6fr)_70px_80px_70px_70px_70px_90px_80px] gap-3 px-4 py-3 bg-white/[0.02] hover:bg-white/[0.04] transition-colors items-center"
              >
                <div className="min-w-0 flex items-center gap-2.5">
                  <span className="w-7 h-7 rounded-md bg-gradient-to-br from-amber-400/30 to-rose-400/20 inline-flex items-center justify-center text-[11px] font-semibold text-amber-200 shrink-0">
                    {o.name.charAt(0).toUpperCase()}
                  </span>
                  <div className="min-w-0">
                    <p className="text-[13px] text-slate-100 font-medium truncate">{o.name}</p>
                    <p className="text-[11px] text-slate-500 truncate">
                      {o.slackConnected ? 'Slack · ' : ''}
                      {o.syncErrors > 0 ? `${o.syncErrors} sync err · ` : ''}
                      Last {o.lastActivityFmt}
                    </p>
                  </div>
                </div>
                <span className="text-[11.5px] text-slate-300 capitalize tabular-nums">{o.plan}</span>
                <span className="text-[12.5px] text-slate-200 tabular-nums">{o.seats}</span>
                <span className="text-[12.5px] text-slate-200 tabular-nums">{o.active7d}</span>
                <span className="text-[12.5px] text-slate-200 tabular-nums">{o.shifts7d}</span>
                <span className={`text-[12.5px] tabular-nums ${o.blockersOpen > 0 ? 'text-rose-300' : 'text-slate-500'}`}>
                  {o.blockersOpen}
                </span>
                <span className="text-[12.5px] text-slate-200 tabular-nums">{o.spendUsd}</span>
                <HealthBadge h={o.health} />
              </li>
            ))}
          </ul>
        )}
      </div>
    </>
  )
}

function SortBtn({
  label,
  active,
  dir,
  onClick,
  disabled,
}: {
  label: string
  active: boolean
  dir: 'asc' | 'desc'
  onClick: () => void
  disabled?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`text-left hover:text-slate-200 transition ${active ? 'text-amber-300' : ''} ${disabled ? 'cursor-default' : ''}`}
    >
      {label} {active && (dir === 'asc' ? '↑' : '↓')}
    </button>
  )
}

function HealthBadge({ h }: { h: HealthVerdict }) {
  const styles: Record<HealthVerdict, { bg: string; fg: string; label: string }> = {
    new: { bg: 'bg-sky-400/15', fg: 'text-sky-300', label: 'New' },
    healthy: { bg: 'bg-emerald-400/15', fg: 'text-emerald-300', label: 'Healthy' },
    growing: { bg: 'bg-emerald-400/15', fg: 'text-emerald-300', label: 'Growing' },
    at_risk: { bg: 'bg-rose-400/15', fg: 'text-rose-300', label: 'At risk' },
    churned: { bg: 'bg-slate-400/15', fg: 'text-slate-400', label: 'Churned' },
  }
  const s = styles[h]
  return (
    <span className={`text-[10.5px] font-medium px-2 py-0.5 rounded-full ${s.bg} ${s.fg} text-center`}>
      {s.label}
    </span>
  )
}
