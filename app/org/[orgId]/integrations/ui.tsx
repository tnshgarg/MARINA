'use client'

import React from 'react'

/**
 * Shared visual kit for the integration hub pages so GitHub / Calendar / Slack
 * read as one designed surface (brand glyph badge header, stat cards, titled
 * cards, real empty states) instead of three flat lists.
 */

export type Brand = 'github' | 'calendar' | 'slack'

export const BRAND: Record<Brand, { name: string; color: string; soft: string }> = {
  github: { name: 'GitHub', color: '#1a1f2e', soft: '#ece9e1' },
  calendar: { name: 'Calendar', color: '#3f6b54', soft: '#e8ede7' },
  slack: { name: 'Slack', color: '#a35e3d', soft: '#f4ebe3' },
}

export function BrandGlyph({ brand, size = 18 }: { brand: Brand; size?: number }) {
  if (brand === 'github') {
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
        <path d="M12 .5C5.65.5.5 5.65.5 12c0 5.08 3.29 9.39 7.86 10.91.58.1.79-.25.79-.56v-2.1c-3.2.7-3.88-1.36-3.88-1.36-.52-1.31-1.28-1.66-1.28-1.66-1.05-.72.08-.71.08-.71 1.16.08 1.77 1.19 1.77 1.19 1.03 1.77 2.7 1.26 3.36.96.1-.75.4-1.26.73-1.55-2.55-.29-5.23-1.28-5.23-5.7 0-1.26.45-2.29 1.19-3.1-.12-.29-.52-1.46.11-3.04 0 0 .97-.31 3.18 1.18a11 11 0 0 1 5.8 0c2.21-1.49 3.18-1.18 3.18-1.18.63 1.58.23 2.75.11 3.04.74.81 1.19 1.84 1.19 3.1 0 4.43-2.69 5.41-5.25 5.69.41.36.78 1.07.78 2.15v3.19c0 .31.21.67.8.56C20.71 21.39 24 17.08 24 12 24 5.65 18.35.5 12 .5Z" />
      </svg>
    )
  }
  if (brand === 'calendar') {
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" aria-hidden>
        <rect x="3" y="4.5" width="18" height="16" rx="2.5" />
        <path d="M3 9h18M8 3v3M16 3v3" />
        <circle cx="8" cy="13.5" r="1.1" fill="currentColor" stroke="none" />
        <circle cx="12" cy="13.5" r="1.1" fill="currentColor" stroke="none" />
        <circle cx="16" cy="13.5" r="1.1" fill="currentColor" stroke="none" />
      </svg>
    )
  }
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M6 15a2 2 0 1 1-2-2h2v2Zm1 0a2 2 0 1 1 4 0v5a2 2 0 1 1-4 0v-5Zm2-9a2 2 0 1 1 2-2h-2V6Zm0 1a2 2 0 0 1 0 4H4a2 2 0 1 1 0-4h5Zm9 2a2 2 0 1 1 2 2h-2V9Zm-1 0a2 2 0 0 1-4 0V4a2 2 0 1 1 4 0v5Zm-2 9a2 2 0 1 1-2 2v-2h2Zm0-1a2 2 0 0 1 0-4h5a2 2 0 1 1 0 4h-5Z" />
    </svg>
  )
}

export function GlyphBadge({ brand, size = 40 }: { brand: Brand; size?: number }) {
  const b = BRAND[brand]
  return (
    <span
      className="inline-flex items-center justify-center rounded-xl shrink-0"
      style={{ background: b.soft, color: b.color, width: size, height: size }}
    >
      <BrandGlyph brand={brand} size={Math.round(size * 0.5)} />
    </span>
  )
}

export function HubHeader({
  brand,
  title,
  subtitle,
  actions,
}: {
  brand: Brand
  title: string
  subtitle: string
  actions?: React.ReactNode
}) {
  return (
    <div className="flex items-start gap-3.5 mb-6">
      <GlyphBadge brand={brand} />
      <div className="min-w-0 flex-1">
        <h1 className="app-h1">{title}</h1>
        <p className="mt-0.5 text-[13px] text-[var(--m-ink-3)] leading-snug">{subtitle}</p>
      </div>
      {actions && <div className="flex items-center gap-2 shrink-0">{actions}</div>}
    </div>
  )
}

export function StatCard({
  value,
  label,
  accent,
}: {
  value: React.ReactNode
  label: string
  accent?: string
}) {
  return (
    <div className="rounded-xl border border-[var(--m-border)] bg-white px-4 py-3">
      <p className="text-[23px] font-semibold tabular-nums leading-none" style={{ color: accent ?? 'var(--m-ink)' }}>
        {value}
      </p>
      <p className="mt-1.5 text-[10.5px] text-[var(--m-ink-4)] uppercase tracking-wide font-semibold">{label}</p>
    </div>
  )
}

export function Card({
  title,
  hint,
  action,
  children,
  className,
}: {
  title?: string
  hint?: string
  action?: React.ReactNode
  children: React.ReactNode
  className?: string
}) {
  return (
    <section className={`rounded-xl border border-[var(--m-border)] bg-white overflow-hidden ${className ?? ''}`}>
      {(title || action) && (
        <div className="px-4 py-2.5 border-b border-[var(--m-border-soft)] flex items-center gap-2">
          {title && <h2 className="text-[12.5px] font-semibold text-[var(--m-ink)]">{title}</h2>}
          {hint && <span className="text-[11px] text-[var(--m-ink-4)]">{hint}</span>}
          {action && <div className="ml-auto">{action}</div>}
        </div>
      )}
      <div className="p-3.5">{children}</div>
    </section>
  )
}

export function EmptyState({
  brand,
  title,
  body,
  action,
}: {
  brand: Brand
  title: string
  body?: string
  action?: React.ReactNode
}) {
  return (
    <div className="rounded-xl border border-dashed border-[var(--m-border)] bg-white px-6 py-12 text-center">
      <div className="flex justify-center mb-3.5">
        <GlyphBadge brand={brand} size={48} />
      </div>
      <p className="text-[14.5px] font-semibold text-[var(--m-ink)]">{title}</p>
      {body && <p className="mt-1.5 text-[12.5px] text-[var(--m-ink-3)] max-w-sm mx-auto leading-relaxed">{body}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  )
}
