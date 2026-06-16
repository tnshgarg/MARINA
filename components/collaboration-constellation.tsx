'use client'

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'

/**
 * Collaboration constellation — an animated, force-directed network rendered as
 * a glowing star map. Generic over its data so different surfaces can feed it:
 * GitHub feeds "who reviews whose PRs", Calendar feeds "who meets with whom".
 *
 * Each person is a star sized by their activity; each relationship is a line.
 * Hovering lights up a person and their links; clicking opens a detail panel.
 * The layout is computed once (a small spring/charge simulation) after mount —
 * deterministic enough to avoid hydration churn, cheap enough for ~60 nodes —
 * then the "alive" feel comes entirely from CSS (twinkle, float, entrance).
 */

export type CNode = { id: number; label: string; value: number; sub?: string }
export type CEdge = { source: number; target: number; weight: number }

type Pos = { x: number; y: number }

const W = 1000
const H = 620

function computeLayout(nodes: CNode[], edges: CEdge[]): Map<number, Pos> {
  const n = nodes.length
  const pos = new Map<number, { x: number; y: number; vx: number; vy: number }>()
  // Seed on a ring + jitter so symmetric graphs don't collapse to a line.
  nodes.forEach((node, i) => {
    const a = (i / Math.max(1, n)) * Math.PI * 2
    pos.set(node.id, {
      x: W / 2 + Math.cos(a) * W * 0.28 + (Math.random() - 0.5) * 40,
      y: H / 2 + Math.sin(a) * H * 0.28 + (Math.random() - 0.5) * 40,
      vx: 0,
      vy: 0,
    })
  })
  const ids = nodes.map((x) => x.id)
  const maxW = Math.max(1, ...edges.map((e) => e.weight))

  const ITER = 420
  for (let it = 0; it < ITER; it++) {
    const cool = 1 - it / ITER
    // Repulsion (charge)
    for (let i = 0; i < n; i++) {
      const a = pos.get(ids[i])!
      for (let j = i + 1; j < n; j++) {
        const b = pos.get(ids[j])!
        let dx = a.x - b.x
        let dy = a.y - b.y
        let d2 = dx * dx + dy * dy
        if (d2 < 1) { d2 = 1; dx = Math.random(); dy = Math.random() }
        const f = (26000 / d2) * cool
        const d = Math.sqrt(d2)
        const fx = (dx / d) * f
        const fy = (dy / d) * f
        a.vx += fx; a.vy += fy
        b.vx -= fx; b.vy -= fy
      }
    }
    // Attraction (springs) — heavier collaborations sit closer.
    for (const e of edges) {
      const a = pos.get(e.source)
      const b = pos.get(e.target)
      if (!a || !b) continue
      const dx = b.x - a.x
      const dy = b.y - a.y
      const d = Math.sqrt(dx * dx + dy * dy) || 1
      const rest = 150 - (e.weight / maxW) * 70
      const f = ((d - rest) * 0.012) * cool
      const fx = (dx / d) * f
      const fy = (dy / d) * f
      a.vx += fx; a.vy += fy
      b.vx -= fx; b.vy -= fy
    }
    // Center gravity + integrate
    for (const id of ids) {
      const p = pos.get(id)!
      p.vx += (W / 2 - p.x) * 0.006 * cool
      p.vy += (H / 2 - p.y) * 0.006 * cool
      p.x += p.vx
      p.y += p.vy
      p.vx *= 0.82
      p.vy *= 0.82
    }
  }
  // Normalize into the frame with padding.
  const xs = ids.map((id) => pos.get(id)!.x)
  const ys = ids.map((id) => pos.get(id)!.y)
  const minX = Math.min(...xs), maxX = Math.max(...xs)
  const minY = Math.min(...ys), maxY = Math.max(...ys)
  const pad = 90
  const sx = (W - pad * 2) / Math.max(1, maxX - minX)
  const sy = (H - pad * 2) / Math.max(1, maxY - minY)
  const s = Math.min(sx, sy)
  const out = new Map<number, Pos>()
  for (const id of ids) {
    const p = pos.get(id)!
    out.set(id, {
      x: pad + (p.x - minX) * s + (W - pad * 2 - (maxX - minX) * s) / 2,
      y: pad + (p.y - minY) * s + (H - pad * 2 - (maxY - minY) * s) / 2,
    })
  }
  return out
}

// Deterministic-ish background stars (recomputed client-side only).
function makeStars(count: number) {
  return Array.from({ length: count }, () => ({
    x: Math.random() * W,
    y: Math.random() * H,
    r: Math.random() * 1.4 + 0.3,
    delay: Math.random() * 4,
    dur: 2.5 + Math.random() * 3,
  }))
}

export function CollaborationConstellation({
  nodes,
  edges,
  accent = '#6fae8e',
  renderDetail,
  emptyHint = 'No activity to map yet.',
}: {
  nodes: CNode[]
  edges: CEdge[]
  accent?: string
  renderDetail: (id: number) => ReactNode
  emptyHint?: string
}) {
  const [layout, setLayout] = useState<Map<number, Pos> | null>(null)
  const [stars, setStars] = useState<ReturnType<typeof makeStars>>([])
  const [selected, setSelected] = useState<number | null>(null)
  const [hover, setHover] = useState<number | null>(null)
  const mounted = useRef(false)

  useEffect(() => {
    mounted.current = true
    setLayout(computeLayout(nodes, edges))
    setStars(makeStars(70))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nodes.length, edges.length])

  const maxValue = useMemo(() => Math.max(1, ...nodes.map((n) => n.value)), [nodes])
  const radiusOf = (v: number) => 8 + Math.sqrt(v / maxValue) * 16

  // Neighbours of the focused (selected or hovered) node — for highlight/dim.
  const focus = selected ?? hover
  const neighbours = useMemo(() => {
    if (focus == null) return null
    const set = new Set<number>([focus])
    for (const e of edges) {
      if (e.source === focus) set.add(e.target)
      if (e.target === focus) set.add(e.source)
    }
    return set
  }, [focus, edges])

  const labelFor = (id: number) => nodes.find((n) => n.id === id)?.label ?? ''

  if (nodes.length === 0) {
    return (
      <div className="rounded-xl border border-[var(--m-border)] bg-[#0d1320] h-[300px] flex items-center justify-center">
        <p className="text-[12.5px] text-slate-400">{emptyHint}</p>
      </div>
    )
  }

  return (
    <div className="relative rounded-xl overflow-hidden border border-[#1c2740]" style={{ background: 'radial-gradient(120% 100% at 50% 0%, #16213b 0%, #0b1020 55%, #080b16 100%)' }}>
      <style>{`
        @keyframes cstTwinkle { 0%,100% { opacity: .35 } 50% { opacity: 1 } }
        @keyframes cstFloat { 0%,100% { transform: translate(0,0) } 50% { transform: translate(var(--fx), var(--fy)) } }
        @keyframes cstIn { from { opacity: 0; transform: scale(.4) } to { opacity: 1; transform: scale(1) } }
        @keyframes cstDash { to { stroke-dashoffset: -16 } }
        .cst-node { animation: cstIn .5s cubic-bezier(.2,.8,.2,1) both; transform-box: fill-box; transform-origin: center; }
        .cst-float { animation: cstFloat var(--fd) ease-in-out infinite; transform-box: fill-box; transform-origin: center; }
        .cst-star { animation: cstTwinkle var(--sd) ease-in-out infinite; }
      `}</style>

      <svg viewBox={`0 0 ${W} ${H}`} className="w-full block" style={{ height: 'clamp(360px, 52vh, 560px)' }} onClick={() => setSelected(null)}>
        <defs>
          <radialGradient id="cstGlow" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor={accent} stopOpacity="0.9" />
            <stop offset="40%" stopColor={accent} stopOpacity="0.35" />
            <stop offset="100%" stopColor={accent} stopOpacity="0" />
          </radialGradient>
        </defs>

        {/* background stars */}
        {stars.map((s, i) => (
          <circle key={`s${i}`} cx={s.x} cy={s.y} r={s.r} fill="#cdd8f0" className="cst-star" style={{ ['--sd' as string]: `${s.dur}s`, animationDelay: `${s.delay}s` }} />
        ))}

        {layout && (
          <>
            {/* edges */}
            {edges.map((e, i) => {
              const a = layout.get(e.source)
              const b = layout.get(e.target)
              if (!a || !b) return null
              const lit = neighbours ? neighbours.has(e.source) && neighbours.has(e.target) : false
              const dim = focus != null && !lit
              return (
                <line
                  key={`e${i}`}
                  x1={a.x} y1={a.y} x2={b.x} y2={b.y}
                  stroke={lit ? accent : '#5a6a8c'}
                  strokeOpacity={dim ? 0.05 : lit ? 0.7 : 0.18}
                  strokeWidth={lit ? 1.8 : 0.8}
                  strokeDasharray={lit ? '4 3' : undefined}
                  style={lit ? { animation: 'cstDash 1s linear infinite' } : undefined}
                />
              )
            })}

            {/* nodes */}
            {nodes.map((node, i) => {
              const p = layout.get(node.id)
              if (!p) return null
              const r = radiusOf(node.value)
              const isFocus = focus === node.id
              const dim = focus != null && neighbours != null && !neighbours.has(node.id)
              // Deterministic per-node drift so it stays stable across re-renders.
              const fx = (((node.id * 37) % 13) / 13) * 2 - 1
              const fy = (((node.id * 71) % 17) / 17) * 2 - 1
              return (
                <g
                  key={node.id}
                  className="cst-node cursor-pointer"
                  style={{ animationDelay: `${i * 35}ms`, opacity: dim ? 0.25 : 1, transition: 'opacity .3s' }}
                  onMouseEnter={() => setHover(node.id)}
                  onMouseLeave={() => setHover(null)}
                  onClick={(ev) => { ev.stopPropagation(); setSelected((s) => (s === node.id ? null : node.id)) }}
                >
                  <g className="cst-float" style={{ ['--fx' as string]: `${(fx * 6).toFixed(2)}px`, ['--fy' as string]: `${(fy * 6).toFixed(2)}px`, ['--fd' as string]: `${6 + (i % 7) * 0.4}s` }}>
                    <circle cx={p.x} cy={p.y} r={r * (isFocus ? 3 : 2.3)} fill="url(#cstGlow)" />
                    <circle cx={p.x} cy={p.y} r={r} fill={accent} stroke="#fff" strokeOpacity={isFocus ? 0.9 : 0.25} strokeWidth={isFocus ? 2 : 1} />
                    <text x={p.x} y={p.y + r + 13} textAnchor="middle" fontSize={12} fontWeight={600} fill="#dfe7f7" opacity={isFocus || hover === node.id || nodes.length <= 14 ? 0.95 : 0.0} style={{ transition: 'opacity .2s', pointerEvents: 'none' }}>
                      {node.label.length > 16 ? node.label.slice(0, 15) + '…' : node.label}
                    </text>
                  </g>
                </g>
              )
            })}
          </>
        )}
        {!layout && (
          <text x={W / 2} y={H / 2} textAnchor="middle" fill="#6b7794" fontSize={13}>Mapping the constellation…</text>
        )}
      </svg>

      {/* hover label (when not selected) */}
      {hover != null && selected == null && (
        <div className="absolute top-3 left-3 px-2.5 py-1 rounded-md bg-black/40 backdrop-blur text-white text-[12px] font-medium pointer-events-none">
          {labelFor(hover)}
        </div>
      )}

      {/* detail panel */}
      {selected != null && (
        <div className="absolute top-0 right-0 h-full w-full sm:w-[340px] bg-[#0b1020]/92 backdrop-blur-md border-l border-[#22304d] p-4 overflow-y-auto animate-[cstIn_.25s_ease]">
          <button
            type="button"
            onClick={() => setSelected(null)}
            className="absolute top-3 right-3 w-7 h-7 inline-flex items-center justify-center rounded-md text-slate-400 hover:text-white hover:bg-white/10 transition"
            aria-label="Close"
          >
            ✕
          </button>
          {renderDetail(selected)}
        </div>
      )}
    </div>
  )
}
