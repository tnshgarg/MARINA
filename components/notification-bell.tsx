'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import Link from 'next/link'

type Notification = {
  id: number
  kind: string
  title: string
  body: string | null
  href: string | null
  readAt: string | null
  createdAt: string
}

/**
 * In-app notification bell. Polls /api/me/notifications every 60s. Renders
 * an unread count badge; opens a small popover listing the latest 50.
 *
 * The popover uses `position: fixed` anchored to the button's bounding rect
 * so it never stretches the document. The bell lives at the bottom of the
 * sidebar, so we drop the panel UPWARD from the button.
 */
export function NotificationBell() {
  const [open, setOpen] = useState(false)
  const [items, setItems] = useState<Notification[]>([])
  const [unread, setUnread] = useState(0)
  const wrapperRef = useRef<HTMLDivElement>(null)
  const btnRef = useRef<HTMLButtonElement>(null)
  const [anchor, setAnchor] = useState<{ left: number; bottom: number } | null>(null)

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/me/notifications')
      if (!res.ok) return
      const data = (await res.json()) as { unreadCount: number; notifications: Notification[] }
      setItems(data.notifications ?? [])
      setUnread(data.unreadCount ?? 0)
    } catch {
      // ignore
    }
  }, [])

  useEffect(() => {
    load()
    const id = setInterval(load, 60_000)
    return () => clearInterval(id)
  }, [load])

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      const target = e.target as Node
      if (wrapperRef.current?.contains(target)) return
      // Also ignore clicks inside the fixed popover (rendered outside wrapper)
      const pop = document.getElementById('notif-popover')
      if (pop?.contains(target)) return
      setOpen(false)
    }
    window.addEventListener('mousedown', onDown)
    return () => window.removeEventListener('mousedown', onDown)
  }, [open])

  // Anchor the popover to the button's screen position. Recompute on open,
  // scroll, and resize so the popover stays glued to the bell.
  useEffect(() => {
    if (!open) return
    const update = () => {
      const rect = btnRef.current?.getBoundingClientRect()
      if (!rect) return
      setAnchor({ left: rect.left + rect.width / 2, bottom: window.innerHeight - rect.top })
    }
    update()
    window.addEventListener('resize', update)
    window.addEventListener('scroll', update, true)
    return () => {
      window.removeEventListener('resize', update)
      window.removeEventListener('scroll', update, true)
    }
  }, [open])

  async function markAll() {
    await fetch('/api/me/notifications', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ all: true }),
    })
    setUnread(0)
    setItems((prev) => prev.map((n) => ({ ...n, readAt: n.readAt ?? new Date().toISOString() })))
  }

  return (
    <div className="relative" ref={wrapperRef}>
      <button
        type="button"
        ref={btnRef}
        onClick={() => {
          setOpen((v) => !v)
          if (!open) load()
        }}
        className="relative w-8 h-8 inline-flex items-center justify-center rounded-md text-slate-500 hover:text-slate-900 hover:bg-slate-100 transition"
        aria-label={`${unread} unread notifications`}
      >
        <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}>
          <path d="M6 8a6 6 0 0 1 12 0c0 7 3 7 3 9H3c0-2 3-2 3-9Z" />
          <path d="M10 21a2 2 0 0 0 4 0" strokeLinecap="round" />
        </svg>
        {unread > 0 && (
          <span
            className="absolute -top-0.5 -right-0.5 min-w-[16px] h-[16px] px-1 rounded-full bg-rose-600 text-white text-[9.5px] font-semibold inline-flex items-center justify-center"
            aria-hidden
          >
            {unread > 99 ? '99+' : unread}
          </span>
        )}
      </button>

      {open && anchor && typeof document !== 'undefined' && createPortal(
        <div
          id="notif-popover"
          // z-[1000] + portal to <body> guarantees the panel always wins
          // the stacking battle, regardless of any parent's transform /
          // backdrop-filter / overflow-hidden stacking context.
          className="fixed w-[320px] rounded-xl border border-slate-200 bg-white shadow-2xl overflow-hidden z-[1000]"
          style={{
            left: Math.min(Math.max(8, anchor.left - 160), window.innerWidth - 328),
            bottom: anchor.bottom + 8,
            maxHeight: '60vh',
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          <div className="px-4 py-2.5 border-b border-slate-100 flex items-center justify-between">
            <p className="text-[12.5px] font-semibold text-slate-900">Notifications</p>
            {unread > 0 && (
              <button
                onClick={markAll}
                className="text-[11.5px] text-slate-500 hover:text-slate-900"
              >
                Mark all read
              </button>
            )}
          </div>
          {items.length === 0 ? (
            <p className="px-4 py-6 text-[12px] text-slate-500 text-center">You're all caught up.</p>
          ) : (
            <ul className="flex-1 overflow-y-auto divide-y divide-slate-100">
              {items.map((n) => {
                const isUnread = !n.readAt
                const body = (
                  <div className={`px-4 py-2.5 ${isUnread ? 'bg-[var(--m-accent-soft)]/60' : ''} hover:bg-slate-50/60 transition`}>
                    <p className="text-[12.5px] font-medium text-slate-900 leading-snug">
                      {n.title}
                    </p>
                    {n.body && (
                      <p className="mt-0.5 text-[11.5px] text-slate-600 leading-snug">{n.body}</p>
                    )}
                    <p className="mt-0.5 text-[10.5px] text-slate-400">{timeAgo(n.createdAt)}</p>
                  </div>
                )
                return (
                  <li key={n.id}>
                    {n.href ? (
                      <Link href={n.href} onClick={() => setOpen(false)}>
                        {body}
                      </Link>
                    ) : (
                      body
                    )}
                  </li>
                )
              })}
            </ul>
          )}
        </div>,
        document.body,
      )}
    </div>
  )
}

function timeAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime()
  const m = Math.floor(ms / 60000)
  if (m < 1) return 'just now'
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  return `${Math.floor(h / 24)}d ago`
}
