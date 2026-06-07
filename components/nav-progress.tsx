'use client'

import { usePathname } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'

/**
 * Lightweight top progress bar that animates whenever the URL pathname
 * changes. Driven entirely client-side — no router events needed (those
 * were removed in App Router). The bar fakes progress until the new
 * pathname resolves on the next render, then snaps to 100% and fades out.
 */
export function NavProgress() {
  const pathname = usePathname()
  const [width, setWidth] = useState(0)
  const [visible, setVisible] = useState(false)
  const prev = useRef(pathname)
  const timers = useRef<NodeJS.Timeout[]>([])

  function clear() {
    timers.current.forEach(clearTimeout)
    timers.current = []
  }

  useEffect(() => {
    if (prev.current === pathname) return
    prev.current = pathname
    clear()

    // Finished — snap to 100, fade, reset
    setVisible(true)
    setWidth(100)
    timers.current.push(
      setTimeout(() => {
        setVisible(false)
      }, 180)
    )
    timers.current.push(
      setTimeout(() => {
        setWidth(0)
      }, 420)
    )
    return clear
  }, [pathname])

  // Provide an imperative "start" — exported via window for the NavLink to call.
  useEffect(() => {
    function start() {
      clear()
      setVisible(true)
      setWidth(0)
      // Climb to 80% over ~600ms, then idle until pathname change snaps it to 100.
      requestAnimationFrame(() => setWidth(35))
      timers.current.push(setTimeout(() => setWidth(65), 220))
      timers.current.push(setTimeout(() => setWidth(82), 520))
    }
    ;(window as unknown as { __marinaProgressStart?: () => void }).__marinaProgressStart = start
    return () => {
      ;(window as unknown as { __marinaProgressStart?: () => void }).__marinaProgressStart = undefined
    }
  }, [])

  return (
    <div className="nav-progress" aria-hidden>
      <span style={{ width: `${width}%`, opacity: visible ? 1 : 0 }} />
    </div>
  )
}

export function fireNavProgress() {
  if (typeof window === 'undefined') return
  const w = window as unknown as { __marinaProgressStart?: () => void }
  w.__marinaProgressStart?.()
}
