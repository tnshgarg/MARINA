/**
 * A tasteful, dependency-free celebration burst in MARINA's palette.
 *
 * Fires a short bloom of sage / clay / gold confetti from a point — used on the
 * handful of genuine "win" moments (a blocker cleared, work shipped, standup
 * done) so the product celebrates *with* the user instead of acknowledging
 * things in silence. Deliberately brief and warm, never Clippy-loud. Honours
 * `prefers-reduced-motion` and is a no-op during SSR.
 */
const PALETTE = ['#3f6b54', '#547d62', '#c47b56', '#c19a4d', '#a8d3b9', '#e8b89a', '#f5d488']

type Particle = {
  x: number
  y: number
  vx: number
  vy: number
  g: number
  w: number
  h: number
  rot: number
  vr: number
  color: string
  drag: number
}

export function celebrate(opts: { x?: number; y?: number; count?: number; spread?: number } = {}): void {
  if (typeof window === 'undefined' || typeof document === 'undefined') return
  try {
    if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
  } catch {
    // matchMedia may be unavailable in some embedded webviews — fall through.
  }

  const W = window.innerWidth
  const H = window.innerHeight
  const dpr = Math.min(window.devicePixelRatio || 1, 2)

  const canvas = document.createElement('canvas')
  canvas.style.cssText =
    'position:fixed;inset:0;width:100%;height:100%;pointer-events:none;z-index:2147483600'
  canvas.width = Math.floor(W * dpr)
  canvas.height = Math.floor(H * dpr)
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  ctx.scale(dpr, dpr)
  document.body.appendChild(canvas)

  const cx = opts.x ?? W / 2
  const cy = opts.y ?? H * 0.3
  const n = opts.count ?? 80
  const spread = opts.spread ?? Math.PI * 0.9

  const parts: Particle[] = Array.from({ length: n }, () => {
    const angle = -Math.PI / 2 + (Math.random() - 0.5) * spread
    const speed = 5 + Math.random() * 7
    return {
      x: cx,
      y: cy,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed - (2 + Math.random() * 2),
      g: 0.22 + Math.random() * 0.12,
      w: 5 + Math.random() * 5,
      h: 7 + Math.random() * 6,
      rot: Math.random() * Math.PI,
      vr: (Math.random() - 0.5) * 0.3,
      color: PALETTE[(Math.random() * PALETTE.length) | 0],
      drag: 0.985,
    }
  })

  const DURATION = 1500
  const start = performance.now()

  function frame(now: number) {
    const t = now - start
    ctx!.clearRect(0, 0, W, H)
    const fade = t < DURATION - 420 ? 1 : Math.max(0, (DURATION - t) / 420)
    for (const p of parts) {
      p.vx *= p.drag
      p.vy = p.vy * p.drag + p.g
      p.x += p.vx
      p.y += p.vy
      p.rot += p.vr
      ctx!.save()
      ctx!.globalAlpha = fade
      ctx!.translate(p.x, p.y)
      ctx!.rotate(p.rot)
      ctx!.fillStyle = p.color
      ctx!.fillRect(-p.w / 2, -p.h / 2, p.w, p.h)
      ctx!.restore()
    }
    if (t < DURATION) {
      requestAnimationFrame(frame)
    } else {
      canvas.remove()
    }
  }
  requestAnimationFrame(frame)
}

/** Convenience: burst centred on a DOM element (e.g. the button just clicked). */
export function celebrateFrom(el: Element | null, opts: { count?: number; spread?: number } = {}): void {
  if (!el) return celebrate(opts)
  const r = el.getBoundingClientRect()
  celebrate({ x: r.left + r.width / 2, y: r.top + r.height / 2, ...opts })
}
