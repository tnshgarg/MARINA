'use client'

import { useEffect, useRef, useState } from 'react'

/**
 * Wraps content so it fades + slides in on first scroll into view.
 *
 * Why not Framer Motion? We want zero extra JS in the marketing surface —
 * the entire landing should hit < 80 KB JS. IntersectionObserver is 30 lines.
 *
 * Pass `delay` (ms) to stagger neighbours.
 */
export function Reveal({
  children,
  delay = 0,
  className = '',
  as: Tag = 'div',
}: {
  children: React.ReactNode
  delay?: number
  className?: string
  as?: 'div' | 'section' | 'article' | 'span'
}) {
  const ref = useRef<HTMLDivElement>(null)
  const [seen, setSeen] = useState(false)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    if (typeof IntersectionObserver === 'undefined') {
      // SSR / unsupported env — just show immediately.
      setSeen(true)
      return
    }
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            setSeen(true)
            io.disconnect()
            break
          }
        }
      },
      { threshold: 0.15 },
    )
    io.observe(el)
    return () => io.disconnect()
  }, [])

  const Comp = Tag as 'div'
  return (
    <Comp
      ref={ref as React.RefObject<HTMLDivElement>}
      className={`reveal ${seen ? 'is-visible' : ''} ${className}`}
      style={{ transitionDelay: `${delay}ms` }}
    >
      {children}
    </Comp>
  )
}

/**
 * Counter that ticks up to `to` once it scrolls into view. ~1.2s total. Uses
 * easeOutCubic so it feels snappy without overshoot.
 */
export function CountUp({
  to,
  durationMs = 1200,
  prefix = '',
  suffix = '',
  className = '',
}: {
  to: number
  durationMs?: number
  prefix?: string
  suffix?: string
  className?: string
}) {
  const ref = useRef<HTMLSpanElement>(null)
  const [value, setValue] = useState(0)
  const startedRef = useRef(false)

  useEffect(() => {
    const el = ref.current
    if (!el || typeof IntersectionObserver === 'undefined') {
      setValue(to)
      return
    }
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting && !startedRef.current) {
            startedRef.current = true
            const start = performance.now()
            const tick = (t: number) => {
              const elapsed = t - start
              const p = Math.min(1, elapsed / durationMs)
              const eased = 1 - Math.pow(1 - p, 3) // easeOutCubic
              setValue(Math.round(to * eased))
              if (p < 1) requestAnimationFrame(tick)
            }
            requestAnimationFrame(tick)
            io.disconnect()
          }
        }
      },
      { threshold: 0.4 },
    )
    io.observe(el)
    return () => io.disconnect()
  }, [to, durationMs])

  return (
    <span ref={ref} className={`counter-tick ${className}`}>
      {prefix}
      {value.toLocaleString()}
      {suffix}
    </span>
  )
}
