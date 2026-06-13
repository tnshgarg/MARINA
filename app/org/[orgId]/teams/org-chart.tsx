'use client'

import { useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { CharacterAvatar } from '@/components/character-avatar'
import { useToast } from '@/components/toast'

export type ChartMember = {
  membershipId: number
  userId: number
  login: string
  name: string | null
  characterKey: string | null
  avatarUrl: string | null
  role: string
  discipline: string
  jobTitle: string | null
  reportsToMembershipId: number | null
  managerMembershipIds: number[]
}

/**
 * DAG-style org chart.
 *
 * Replaces the single-parent tree with a proper directed acyclic graph so
 * a person can have multiple managers (matrix orgs). Each node is rendered
 * ONCE and we draw edges from every manager to it.
 *
 * Layout (simplified Sugiyama):
 *   1. Compute each node's depth = max(parent depth) + 1 (BFS).
 *   2. Bucket by depth → rows.
 *   3. Within each row, sort nodes by (avg of parent x) to keep edges
 *      relatively untangled, then assign x positions evenly.
 *   4. Draw orthogonal edges from each parent's bottom-center to the
 *      child's top-center, with the mid-y routed at half the gap.
 *
 * Interaction:
 *   - Drag node A onto node B → set B as one of A's managers (extra edge).
 *   - Drop node onto empty canvas → clear ALL managers (becomes a root).
 *   - "+ Add manager" picker on every card to add managers without drag.
 *   - Click an existing manager chip on a card to remove just that edge.
 *
 * Print + Export:
 *   - The SVG mirrors the HTML layout (nodes + edges + labels) so the
 *     downloaded file looks identical to what's on screen.
 *   - Print injects a stylesheet that hides the toolbar / scrollbars and
 *     scales the chart to fit the page width.
 */
const NODE_W = 264
const NODE_H = 84
const ROW_GAP = 64
const COL_GAP = 28

type LaidOutNode = {
  member: ChartMember
  x: number
  y: number
  depth: number
}

export default function OrgChart({
  members,
  canEdit,
  orgId,
}: {
  members: ChartMember[]
  canEdit: boolean
  orgId: number
}) {
  const router = useRouter()
  const toast = useToast()
  const [zoom, setZoom] = useState(1)
  const [busy, setBusy] = useState(false)
  const [pickerForId, setPickerForId] = useState<number | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)

  // Build the layout — DAG-aware.
  const { nodes, edges, totalWidth, totalHeight, byId } = useMemo(() => {
    const byId = new Map(members.map((m) => [m.membershipId, m]))

    // Effective managers per node: use the new multi-manager list if any,
    // otherwise fall back to the legacy single column.
    const managersOf = new Map<number, number[]>()
    for (const m of members) {
      const list = m.managerMembershipIds.length
        ? m.managerMembershipIds
        : m.reportsToMembershipId
          ? [m.reportsToMembershipId]
          : []
      managersOf.set(m.membershipId, list)
    }

    // Depth via BFS from every root (a node with no managers).
    const depth = new Map<number, number>()
    function depthOf(id: number, seen = new Set<number>()): number {
      if (depth.has(id)) return depth.get(id)!
      if (seen.has(id)) return 0 // cycle guard
      seen.add(id)
      const ms = managersOf.get(id) ?? []
      const d = ms.length === 0 ? 0 : Math.max(...ms.map((p) => depthOf(p, seen))) + 1
      depth.set(id, d)
      return d
    }
    for (const m of members) depthOf(m.membershipId)

    const maxDepth = Math.max(0, ...Array.from(depth.values()))
    const rows: ChartMember[][] = Array.from({ length: maxDepth + 1 }, () => [])
    for (const m of members) {
      rows[depth.get(m.membershipId) ?? 0].push(m)
    }

    // Sort each row by avg of parent x positions (computed left-to-right).
    const xOf = new Map<number, number>()
    const layoutNodes: LaidOutNode[] = []
    let totalWidth = 0
    for (let r = 0; r < rows.length; r++) {
      const row = rows[r]
      if (r === 0) {
        // Roots — sort by role rank then name for stable ordering.
        row.sort((a, b) => {
          const rankA = a.role === 'admin' ? 0 : a.role === 'manager' ? 1 : 2
          const rankB = b.role === 'admin' ? 0 : b.role === 'manager' ? 1 : 2
          if (rankA !== rankB) return rankA - rankB
          return (a.name ?? a.login).localeCompare(b.name ?? b.login)
        })
      } else {
        row.sort((a, b) => {
          const avgA = avgOf(managersOf.get(a.membershipId) ?? [], xOf)
          const avgB = avgOf(managersOf.get(b.membershipId) ?? [], xOf)
          if (avgA !== avgB) return avgA - avgB
          return (a.name ?? a.login).localeCompare(b.name ?? b.login)
        })
      }
      const rowWidth = row.length * NODE_W + Math.max(0, row.length - 1) * COL_GAP
      const startX = 32
      // We center each row inside the widest row's width to keep things tidy.
      // We compute that after laying out roots — just place left-aligned for
      // now, then shift in a post-pass.
      row.forEach((m, i) => {
        const x = startX + i * (NODE_W + COL_GAP)
        const y = r * (NODE_H + ROW_GAP) + 32
        xOf.set(m.membershipId, x)
        layoutNodes.push({ member: m, x, y, depth: r })
      })
      totalWidth = Math.max(totalWidth, startX + rowWidth + 32)
    }

    // Centre-align each row horizontally inside `totalWidth`.
    for (let r = 0; r < rows.length; r++) {
      const row = rows[r]
      const rowWidth = row.length * NODE_W + Math.max(0, row.length - 1) * COL_GAP
      const offset = Math.max(0, (totalWidth - rowWidth - 64) / 2)
      for (const m of row) {
        const cur = xOf.get(m.membershipId) ?? 0
        xOf.set(m.membershipId, cur + offset)
      }
      for (const ln of layoutNodes) {
        if (ln.depth === r) ln.x = xOf.get(ln.member.membershipId) ?? ln.x
      }
    }

    // Build edges.
    const edges: Array<{ from: number; to: number }> = []
    for (const m of members) {
      const ms = managersOf.get(m.membershipId) ?? []
      for (const p of ms) edges.push({ from: p, to: m.membershipId })
    }

    const totalHeight = Math.max(NODE_H + 64, (maxDepth + 1) * (NODE_H + ROW_GAP) + 32)
    return { nodes: layoutNodes, edges, totalWidth: Math.max(NODE_W + 64, totalWidth), totalHeight, byId }
  }, [members])

  const xyOf = useMemo(() => {
    const m = new Map<number, { x: number; y: number }>()
    for (const n of nodes) m.set(n.member.membershipId, { x: n.x, y: n.y })
    return m
  }, [nodes])

  // The picker filters out anyone who would create a cycle.
  const eligibleAsManager = useMemo(() => {
    if (pickerForId === null) return []
    const target = byId.get(pickerForId)
    if (!target) return []

    // Anyone who already manages `target` is also not eligible.
    const existing = new Set(
      target.managerMembershipIds.length
        ? target.managerMembershipIds
        : target.reportsToMembershipId
          ? [target.reportsToMembershipId]
          : [],
    )

    // Cycle check: a candidate is invalid if `target` is anywhere up
    // their manager chain.
    function ancestorsOf(id: number, seen = new Set<number>()): Set<number> {
      if (seen.has(id)) return seen
      seen.add(id)
      const m = byId.get(id)
      if (!m) return seen
      const list = m.managerMembershipIds.length ? m.managerMembershipIds : m.reportsToMembershipId ? [m.reportsToMembershipId] : []
      for (const p of list) ancestorsOf(p, seen)
      return seen
    }
    // Also exclude target itself + everyone in target's downstream tree.
    function descendantsOf(id: number, acc = new Set<number>()): Set<number> {
      if (acc.has(id)) return acc
      acc.add(id)
      for (const m of members) {
        const list = m.managerMembershipIds.length ? m.managerMembershipIds : m.reportsToMembershipId ? [m.reportsToMembershipId] : []
        if (list.includes(id)) descendantsOf(m.membershipId, acc)
      }
      return acc
    }
    const blocked = descendantsOf(pickerForId)

    return members.filter(
      (m) => !blocked.has(m.membershipId) && !existing.has(m.membershipId),
    )
  }, [pickerForId, members, byId])

  async function addManager(childId: number, managerId: number | null) {
    if (!canEdit) return
    if (childId === managerId) return
    setBusy(true)
    try {
      if (managerId === null) {
        // Drop onto empty canvas — clear all managers via DELETE per-edge.
        const current = byId.get(childId)
        const list = current?.managerMembershipIds.length
          ? current.managerMembershipIds
          : current?.reportsToMembershipId
            ? [current.reportsToMembershipId]
            : []
        for (const m of list) {
          await fetch(`/api/orgs/${orgId}/members/${childId}/managers`, {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ managerMembershipId: m }),
          })
        }
        // Also wipe the legacy primary column.
        await fetch(`/api/orgs/${orgId}/members/${childId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ reportsToMembershipId: null }),
        })
      } else {
        const res = await fetch(`/api/orgs/${orgId}/members/${childId}/managers`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ managerMembershipId: managerId }),
        })
        if (!res.ok) {
          const data = await res.json().catch(() => ({}))
          throw new Error(data?.error || 'add manager failed')
        }
      }
      router.refresh()
    } catch (e) {
      toast.push({
        kind: 'error',
        title: 'Update failed',
        body: e instanceof Error ? e.message : String(e),
      })
    } finally {
      setBusy(false)
    }
  }

  async function removeManager(childId: number, managerId: number) {
    if (!canEdit) return
    if (!confirm('Remove this reports-to edge?')) return
    setBusy(true)
    try {
      const res = await fetch(`/api/orgs/${orgId}/members/${childId}/managers`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ managerMembershipId: managerId }),
      })
      if (!res.ok) throw new Error('failed')
      router.refresh()
    } catch (e) {
      toast.push({ kind: 'error', title: 'Remove failed', body: String(e) })
    } finally {
      setBusy(false)
    }
  }

  function buildExportSvg(): string {
    // We build a self-contained SVG with embedded styles + the node
    // rectangles + connectors. This is what gets downloaded AND what gets
    // printed — same source so the two never drift.
    const w = totalWidth
    const h = totalHeight
    const parts: string[] = []
    parts.push(
      `<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" font-family="Inter, system-ui, sans-serif">`,
    )
    parts.push(`<rect width="${w}" height="${h}" fill="white"/>`)
    // Edges
    for (const e of edges) {
      const p = xyOf.get(e.from)
      const c = xyOf.get(e.to)
      if (!p || !c) continue
      const sx = p.x + NODE_W / 2
      const sy = p.y + NODE_H
      const tx = c.x + NODE_W / 2
      const ty = c.y
      const mid = (sy + ty) / 2
      parts.push(
        `<path d="M ${sx} ${sy} L ${sx} ${mid} L ${tx} ${mid} L ${tx} ${ty}" stroke="#94a3b8" stroke-width="1.4" fill="none"/>`,
      )
    }
    // Nodes
    for (const n of nodes) {
      const m = n.member
      const fill = m.role === 'admin' ? '#fdf6e7' : m.role === 'manager' ? '#eaf2ed' : '#ffffff'
      const stroke = m.role === 'admin' ? '#c19a4d' : m.role === 'manager' ? '#3f6b54' : '#cbd5e1'
      parts.push(
        `<g transform="translate(${n.x}, ${n.y})"><rect width="${NODE_W}" height="${NODE_H}" rx="12" fill="${fill}" stroke="${stroke}" stroke-width="1.5"/>` +
          `<text x="20" y="28" font-size="13" font-weight="600" fill="#0f172a">${esc((m.name ?? `@${m.login}`).slice(0, 28))}</text>` +
          `<text x="20" y="46" font-size="11" fill="#64748b">${esc((m.jobTitle ?? m.discipline).slice(0, 32))}</text>` +
          `<text x="20" y="62" font-size="10" fill="#94a3b8" text-transform="uppercase" letter-spacing="0.5">${esc(m.role)}</text>` +
          `</g>`,
      )
    }
    parts.push(`</svg>`)
    return parts.join('\n')
  }

  function exportSvg() {
    const xml = buildExportSvg()
    const blob = new Blob([xml], { type: 'image/svg+xml' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `org-chart-${new Date().toISOString().slice(0, 10)}.svg`
    a.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }

  function printChart() {
    // Open a clean print window with JUST the chart SVG. Avoids leaking
    // any of the app chrome and scales the chart to fit the page width.
    //
    // We don't pass `noopener` here — we need to keep the reference so we
    // can invoke print() ourselves once the popup has loaded. Some
    // browsers (Safari especially) ignore an inline `<script>window.print()`
    // injected via document.write, so we drive print from the parent and
    // also expose a visible button as a manual fallback.
    const xml = buildExportSvg().replace(/^<\?xml[^>]+>\n?/, '')
    const landscape = totalWidth > totalHeight * 1.4
    const w = window.open('', 'marina-org-chart-print', 'width=1200,height=800')
    if (!w) {
      alert('Allow pop-ups to print the chart, or use Export SVG.')
      return
    }
    const html = `<!doctype html>
<html>
<head>
  <title>Org chart · ${new Date().toLocaleDateString()}</title>
  <meta charset="utf-8" />
  <style>
    html, body { margin: 0; padding: 0; background: white; font-family: Inter, system-ui, sans-serif; color: #0f172a; }
    .bar { position: sticky; top: 0; z-index: 10; display: flex; gap: 8px; align-items: center; justify-content: space-between; padding: 10px 18px; background: white; border-bottom: 1px solid #e2e8f0; }
    .bar h1 { font-size: 13px; font-weight: 600; margin: 0; }
    .bar p { font-size: 11.5px; color: #64748b; margin: 0; }
    .actions { display: flex; gap: 8px; }
    .actions button { font: inherit; font-size: 12px; padding: 6px 12px; border-radius: 6px; border: 1px solid #cbd5e1; background: white; cursor: pointer; }
    .actions button.primary { background: #0f172a; color: white; border-color: #0f172a; }
    .wrap { padding: 24px; }
    svg { width: 100%; height: auto; max-width: 100%; display: block; }
    @page { size: ${landscape ? 'A4 landscape' : 'A4 portrait'}; margin: 12mm; }
    @media print {
      .bar { display: none !important; }
      .wrap { padding: 0; }
    }
  </style>
</head>
<body>
  <div class="bar">
    <div>
      <h1>Org chart</h1>
      <p>${new Date().toLocaleString()} · ${landscape ? 'landscape' : 'portrait'} · auto-fit to page</p>
    </div>
    <div class="actions">
      <button type="button" onclick="window.close()">Close</button>
      <button type="button" class="primary" onclick="window.print()">Print / Save PDF</button>
    </div>
  </div>
  <div class="wrap">${xml}</div>
</body>
</html>`
    w.document.open()
    w.document.write(html)
    w.document.close()
    // Drive print from the parent once the popup finishes layout. We try
    // a few times in case the SVG is still being parsed.
    const tryPrint = (attemptsLeft: number) => {
      if (w.closed) return
      try {
        w.focus()
        w.print()
      } catch {
        if (attemptsLeft > 0) {
          setTimeout(() => tryPrint(attemptsLeft - 1), 200)
        }
      }
    }
    // Give the popup ~400ms to parse the inline SVG, then fire.
    setTimeout(() => tryPrint(3), 400)
  }

  return (
    <section className="rounded-xl border border-slate-200 bg-white overflow-hidden">
      {/* Toolbar */}
      <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between gap-3 flex-wrap">
        <div className="text-[12.5px] text-slate-600">
          {canEdit ? (
            <>
              <span className="font-medium text-slate-900">{members.length}</span> people ·{' '}
              <span className="font-medium text-slate-900">{edges.length}</span> reports-to edges ·{' '}
              <span className="text-slate-500">drag to add a manager, or click + on a card.</span>
            </>
          ) : (
            <>The full reports-to graph across your workspace.</>
          )}
        </div>
        <div className="flex items-center gap-1.5">
          <ZoomBtn label="−" onClick={() => setZoom((z) => Math.max(0.4, +(z - 0.1).toFixed(2)))} />
          <span className="text-[11.5px] text-slate-500 tabular-nums w-10 text-center">
            {Math.round(zoom * 100)}%
          </span>
          <ZoomBtn label="+" onClick={() => setZoom((z) => Math.min(1.6, +(z + 0.1).toFixed(2)))} />
          <ZoomBtn
            label="Fit"
            onClick={() => {
              const wrap = scrollRef.current
              if (!wrap) return
              const fit = Math.min(1, (wrap.clientWidth - 32) / totalWidth)
              setZoom(+fit.toFixed(2))
              wrap.scrollLeft = 0
              wrap.scrollTop = 0
            }}
          />
          <span className="w-px h-5 bg-slate-200 mx-1" />
          <button
            type="button"
            onClick={printChart}
            className="px-2.5 py-1 rounded-md bg-white border border-slate-200 hover:bg-slate-50 text-[11.5px] font-medium text-slate-700 transition"
          >
            Print
          </button>
          <button
            type="button"
            onClick={exportSvg}
            className="px-2.5 py-1 rounded-md bg-white border border-slate-200 hover:bg-slate-50 text-[11.5px] font-medium text-slate-700 transition"
          >
            Export SVG
          </button>
        </div>
      </div>

      {/* Canvas */}
      <div
        ref={scrollRef}
        className="relative overflow-auto bg-[radial-gradient(circle_at_1px_1px,_rgba(15,23,42,0.06)_1px,_transparent_0)] bg-[length:18px_18px]"
        style={{ maxHeight: '70vh', minHeight: 360 }}
        onDragOver={(e) => {
          if (canEdit) e.preventDefault()
        }}
        onDrop={(e) => {
          if (!canEdit) return
          const id = Number(e.dataTransfer.getData('text/membership-id'))
          if (Number.isInteger(id)) addManager(id, null)
        }}
      >
        <div
          style={{
            width: totalWidth * zoom,
            height: totalHeight * zoom,
            transform: `scale(${zoom})`,
            transformOrigin: '0 0',
            position: 'relative',
          }}
        >
          {/* SVG edge layer — purely for connectors, doesn't catch
              pointer events so the HTML cards stay draggable. */}
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width={totalWidth}
            height={totalHeight}
            viewBox={`0 0 ${totalWidth} ${totalHeight}`}
            className="absolute inset-0 pointer-events-none"
          >
            <g
              fill="none"
              stroke="#94a3b8"
              strokeWidth={1.4}
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              {edges.map((e, i) => {
                const p = xyOf.get(e.from)
                const c = xyOf.get(e.to)
                if (!p || !c) return null
                const sx = p.x + NODE_W / 2
                const sy = p.y + NODE_H
                const tx = c.x + NODE_W / 2
                const ty = c.y
                const mid = (sy + ty) / 2
                return (
                  <path
                    key={i}
                    d={`M ${sx} ${sy} L ${sx} ${mid} L ${tx} ${mid} L ${tx} ${ty}`}
                  />
                )
              })}
            </g>
          </svg>

          {/* HTML node layer */}
          {nodes.map((n) => {
            const m = n.member
            const managers = m.managerMembershipIds.length
              ? m.managerMembershipIds
              : m.reportsToMembershipId
                ? [m.reportsToMembershipId]
                : []
            const directReportsCount = members.filter((other) => {
              const list = other.managerMembershipIds.length
                ? other.managerMembershipIds
                : other.reportsToMembershipId
                  ? [other.reportsToMembershipId]
                  : []
              return list.includes(m.membershipId)
            }).length
            return (
              <NodeCard
                key={m.membershipId}
                node={n}
                canEdit={canEdit}
                busy={busy}
                managers={managers
                  .map((id) => byId.get(id))
                  .filter((x): x is ChartMember => !!x)}
                directReportsCount={directReportsCount}
                onDropOnto={(srcId) => addManager(srcId, m.membershipId)}
                onAddManager={() => setPickerForId(m.membershipId)}
                onRemoveManager={(mgrId) => removeManager(m.membershipId, mgrId)}
              />
            )
          })}
        </div>
      </div>

      {/* Add-manager picker */}
      {pickerForId !== null && canEdit && (
        <ManagerPicker
          target={byId.get(pickerForId) ?? null}
          candidates={eligibleAsManager}
          onClose={() => setPickerForId(null)}
          onPick={async (managerId) => {
            await addManager(pickerForId, managerId)
            setPickerForId(null)
          }}
        />
      )}
    </section>
  )
}

function avgOf(ids: number[], xOf: Map<number, number>): number {
  if (!ids.length) return 0
  let sum = 0, n = 0
  for (const id of ids) {
    const v = xOf.get(id)
    if (typeof v === 'number') {
      sum += v
      n++
    }
  }
  return n > 0 ? sum / n : 0
}

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

function NodeCard({
  node,
  canEdit,
  busy,
  managers,
  directReportsCount,
  onDropOnto,
  onAddManager,
  onRemoveManager,
}: {
  node: LaidOutNode
  canEdit: boolean
  busy: boolean
  managers: ChartMember[]
  directReportsCount: number
  onDropOnto: (sourceMembershipId: number) => void
  onAddManager: () => void
  onRemoveManager: (managerMembershipId: number) => void
}) {
  const [hover, setHover] = useState(false)
  const m = node.member
  const tone =
    m.role === 'admin'
      ? { border: 'border-[var(--m-clay)]/40', bg: 'from-[var(--m-clay-soft)]/40 to-white', chip: 'bg-[var(--m-clay-soft)] text-[var(--m-clay-deep)]' }
      : m.role === 'manager'
        ? { border: 'border-[var(--m-accent)]/35', bg: 'from-[var(--m-accent-soft)]/40 to-white', chip: 'bg-[var(--m-accent-soft)] text-[var(--m-accent-2)]' }
        : { border: 'border-slate-200', bg: 'from-white to-white', chip: 'bg-slate-100 text-slate-600' }
  return (
    <div
      draggable={canEdit && !busy}
      onDragStart={(e) => {
        e.dataTransfer.setData('text/membership-id', String(m.membershipId))
        e.dataTransfer.effectAllowed = 'move'
      }}
      onDragOver={(e) => {
        if (canEdit) {
          e.preventDefault()
          e.stopPropagation()
          setHover(true)
        }
      }}
      onDragLeave={() => setHover(false)}
      onDrop={(e) => {
        e.preventDefault()
        e.stopPropagation()
        setHover(false)
        const id = Number(e.dataTransfer.getData('text/membership-id'))
        if (Number.isInteger(id)) onDropOnto(id)
      }}
      className={`absolute rounded-xl bg-gradient-to-b ${tone.bg} border ${tone.border} shadow-[var(--m-shadow-sm)] px-3 py-2.5 transition-shadow ${
        hover ? 'shadow-[var(--m-shadow)] ring-2 ring-[var(--m-accent)]/40' : ''
      } ${canEdit ? 'cursor-move' : 'cursor-default'}`}
      style={{ left: node.x, top: node.y, width: NODE_W, height: NODE_H }}
      title={
        canEdit
          ? 'Drag onto another card to add THAT person as a manager of this card. Drop onto empty canvas to clear all managers.'
          : undefined
      }
    >
      <div className="flex items-center gap-2.5">
        <CharacterAvatar characterKey={m.characterKey} name={m.name} login={m.login} imageUrl={m.avatarUrl} size={36} />
        <div className="min-w-0 flex-1">
          <p className="text-[12.5px] font-semibold text-slate-900 truncate leading-tight">
            {m.name ?? `@${m.login}`}
          </p>
          <p className="text-[11px] text-slate-500 truncate leading-snug">
            {m.jobTitle ?? m.discipline}
          </p>
          <div className="mt-1 flex items-center gap-1 min-w-0">
            <span className={`shrink-0 text-[9.5px] uppercase tracking-wider font-semibold px-1.5 py-0.5 rounded-full ${tone.chip}`}>
              {m.role}
            </span>
            <span className="text-[10px] text-slate-500 truncate">
              {directReportsCount > 0 && (
                <>· {directReportsCount} report{directReportsCount === 1 ? '' : 's'}</>
              )}
              {managers.length > 1 && (
                <span title={managers.map((mm) => mm.name ?? `@${mm.login}`).join(' + ')}>
                  {directReportsCount > 0 ? ' ' : ''}· {managers.length} bosses
                </span>
              )}
            </span>
          </div>
        </div>
        {canEdit && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              onAddManager()
            }}
            className="shrink-0 w-6 h-6 rounded-full bg-white border border-slate-200 hover:border-[var(--m-accent)] hover:bg-[var(--m-accent-soft)] text-slate-500 hover:text-[var(--m-accent-2)] inline-flex items-center justify-center text-[14px] font-semibold transition"
            title="Add a manager to this person"
            aria-label="Add a manager"
          >
            +
          </button>
        )}
      </div>
      {canEdit && managers.length > 1 && (
        // Tiny remove-edge strip ONLY for matrix nodes. Single-boss nodes
        // can still be edited via drag / picker — keeps the card less busy.
        <div
          className="absolute -bottom-2 left-1/2 -translate-x-1/2 flex items-center gap-1 bg-white rounded-full border border-slate-200 px-1 py-0.5 shadow-sm"
          style={{ fontSize: 9 }}
        >
          {managers.map((mm) => (
            <button
              key={mm.membershipId}
              type="button"
              onClick={(e) => {
                e.stopPropagation()
                onRemoveManager(mm.membershipId)
              }}
              className="px-1 text-slate-500 hover:text-rose-600 truncate max-w-[60px]"
              title={`Remove ${mm.name ?? `@${mm.login}`} as a manager`}
            >
              {(mm.name ?? mm.login).split(' ')[0]} ×
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

function ZoomBtn({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="px-2 py-1 rounded-md bg-white border border-slate-200 hover:bg-slate-50 text-[11.5px] font-medium text-slate-700 transition w-8 text-center"
    >
      {label}
    </button>
  )
}

function ManagerPicker({
  target,
  candidates,
  onClose,
  onPick,
}: {
  target: ChartMember | null
  candidates: ChartMember[]
  onClose: () => void
  onPick: (managerMembershipId: number) => Promise<void> | void
}) {
  const [q, setQ] = useState('')
  const filtered = candidates.filter((c) =>
    (c.name ?? c.login).toLowerCase().includes(q.toLowerCase()),
  )
  return (
    <div
      className="fixed inset-0 z-[260] bg-slate-900/40 flex items-center justify-center px-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-3">
          <div>
            <p className="text-[11px] uppercase tracking-wider text-slate-500 font-semibold">
              Add a manager
            </p>
            <p className="text-[13px] text-slate-900 font-medium">
              to {target?.name ?? `@${target?.login ?? 'this person'}`}
            </p>
            <p className="text-[11.5px] text-slate-500 mt-1">
              One person can have multiple managers — pick another to add a matrix relationship.
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-700"
            aria-label="Close"
          >
            ✕
          </button>
        </div>
        <input
          autoFocus
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search by name…"
          className="input w-full mb-3"
        />
        <ul className="max-h-[320px] overflow-y-auto divide-y divide-slate-100 rounded-lg border border-slate-200">
          {filtered.length === 0 ? (
            <li className="px-3 py-6 text-center text-[12.5px] text-slate-500">
              No matching teammates eligible as manager.
            </li>
          ) : (
            filtered.map((c) => (
              <li key={c.membershipId}>
                <button
                  type="button"
                  onClick={() => void onPick(c.membershipId)}
                  className="w-full flex items-center gap-2.5 px-3 py-2 hover:bg-slate-50 text-left"
                >
                  <CharacterAvatar characterKey={c.characterKey} name={c.name} login={c.login} imageUrl={c.avatarUrl} size={26} />
                  <div className="min-w-0 flex-1">
                    <p className="text-[13px] font-medium text-slate-900 truncate">
                      {c.name ?? `@${c.login}`}
                    </p>
                    <p className="text-[11.5px] text-slate-500 truncate">
                      {c.jobTitle ?? c.discipline}
                    </p>
                  </div>
                </button>
              </li>
            ))
          )}
        </ul>
      </div>
    </div>
  )
}
