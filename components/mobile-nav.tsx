'use client'

import { useEffect, useState } from 'react'
import { usePathname } from 'next/navigation'

/**
 * Mobile nav scaffold. The page server-renders the OrgSidebar (which is
 * hidden by CSS below 900px). On mobile we render a top bar with a
 * hamburger that toggles a body class — the sidebar gets a slide-in
 * mobile mode via globals.css.
 *
 * Keeps server/client boundary clean: this is the only client component
 * that touches the sidebar.
 */
export function MobileNav({ orgName }: { orgName: string }) {
  const [open, setOpen] = useState(false)
  const pathname = usePathname()

  // Close drawer on navigation
  useEffect(() => {
    setOpen(false)
  }, [pathname])

  useEffect(() => {
    if (typeof document === 'undefined') return
    if (open) {
      document.body.classList.add('mobile-nav-open')
      document.body.style.overflow = 'hidden'
    } else {
      document.body.classList.remove('mobile-nav-open')
      document.body.style.overflow = ''
    }
    return () => {
      document.body.classList.remove('mobile-nav-open')
      document.body.style.overflow = ''
    }
  }, [open])

  // Esc to close
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  return (
    <>
      <header className="mobile-top-bar">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="p-2 -ml-1 rounded-md text-slate-700 hover:bg-slate-100 transition"
          aria-label={open ? 'Close menu' : 'Open menu'}
          aria-expanded={open}
        >
          {open ? (
            <svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
              <path d="M6 6l12 12M18 6l-12 12" strokeLinecap="round" />
            </svg>
          ) : (
            <svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
              <path d="M4 6h16M4 12h16M4 18h16" strokeLinecap="round" />
            </svg>
          )}
        </button>
        <div className="flex-1 flex items-center justify-center gap-2">
          <svg width={18} height={18} viewBox="0 0 28 28" fill="none" aria-hidden>
            <path d="M14 3 L24 24 H4 Z" fill="#6366f1" />
            <circle cx={14} cy={18} r={3} fill="#fff" />
          </svg>
          <span className="text-[13.5px] font-semibold text-slate-900 truncate">
            {orgName}
          </span>
        </div>
        {/* Spacer for symmetry with hamburger */}
        <div className="w-8" />
      </header>

      {open && (
        <button
          type="button"
          aria-label="Close menu"
          onClick={() => setOpen(false)}
          className="mobile-nav-backdrop"
        />
      )}
    </>
  )
}
