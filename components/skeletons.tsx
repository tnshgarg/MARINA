/**
 * Skeleton primitives used by route-level loading.tsx files. Driven by the
 * `.skel` shimmer in globals.css.
 */
export function SkelBar({ w = '100%', h = 12 }: { w?: string | number; h?: number }) {
  return <span className="skel inline-block" style={{ width: typeof w === 'number' ? `${w}px` : w, height: h }} />
}

export function SkelCircle({ size = 40 }: { size?: number }) {
  return (
    <span
      className="skel inline-block rounded-full"
      style={{ width: size, height: size }}
    />
  )
}

export function SkelStatTile() {
  return (
    <div className="stat-tile">
      <SkelCircle size={40} />
      <div className="flex-1 space-y-1.5">
        <SkelBar w={32} h={18} />
        <SkelBar w={90} h={10} />
      </div>
    </div>
  )
}

export function SkelRow({ avatars = true }: { avatars?: boolean }) {
  return (
    <div className="py-3 px-4 flex items-center gap-3 border-b border-slate-100 last:border-0">
      {avatars && <SkelCircle size={36} />}
      <div className="flex-1 space-y-1.5">
        <SkelBar w="60%" h={12} />
        <SkelBar w="40%" h={10} />
      </div>
      <SkelBar w={60} h={20} />
    </div>
  )
}

export function SkelCard({
  rows = 3,
  title = true,
  className,
}: {
  rows?: number
  title?: boolean
  className?: string
}) {
  return (
    <div className={`app-card app-card-lg ${className ?? ''}`}>
      {title && (
        <div className="mb-4 space-y-2">
          <SkelBar w={140} h={14} />
          <SkelBar w={220} h={10} />
        </div>
      )}
      <div className="space-y-2.5">
        {Array.from({ length: rows }).map((_, i) => (
          <SkelBar key={i} w={`${60 + ((i * 7) % 30)}%`} h={12} />
        ))}
      </div>
    </div>
  )
}
