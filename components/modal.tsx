'use client'

import { useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'

/**
 * Accessible modal dialog used for in-depth detail views (member cards,
 * leave decisions, blocker drill-downs).
 *
 * - Click backdrop or press Esc to close
 * - Locks body scroll while open
 * - Focuses the first focusable child on mount
 * - Returns focus to the previously-focused element on close
 */
export function Modal({
  open,
  onClose,
  title,
  subtitle,
  size = 'md',
  children,
  footer,
}: {
  open: boolean
  onClose: () => void
  title?: React.ReactNode
  subtitle?: React.ReactNode
  size?: 'sm' | 'md' | 'lg' | 'xl'
  children: React.ReactNode
  footer?: React.ReactNode
}) {
  const dialogRef = useRef<HTMLDivElement>(null)
  const previousFocusRef = useRef<HTMLElement | null>(null)

  useEffect(() => {
    if (!open) return

    previousFocusRef.current = document.activeElement as HTMLElement | null

    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        onClose()
      }
    }
    window.addEventListener('keydown', onKey)

    // Focus first focusable child
    const first = dialogRef.current?.querySelector<HTMLElement>(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
    )
    first?.focus()

    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = prevOverflow
      previousFocusRef.current?.focus?.()
    }
  }, [open, onClose])

  if (!open) return null
  if (typeof window === 'undefined') return null

  const maxW =
    size === 'sm' ? 'max-w-md' :
    size === 'md' ? 'max-w-xl' :
    size === 'lg' ? 'max-w-3xl' :
    'max-w-5xl'

  return createPortal(
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby={title ? 'modal-title' : undefined}
    >
      {/* Backdrop */}
      <button
        type="button"
        aria-label="Close"
        onClick={onClose}
        className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm transition-opacity"
        style={{ animation: 'modalFadeIn 140ms ease-out' }}
      />

      {/* Dialog */}
      <div
        ref={dialogRef}
        className={`relative w-full ${maxW} max-h-[88vh] flex flex-col rounded-2xl border border-slate-200 bg-white shadow-2xl`}
        style={{ animation: 'modalSlideIn 180ms cubic-bezier(0.22, 1, 0.36, 1)' }}
      >
        {(title || subtitle) && (
          <header className="shrink-0 px-6 pt-5 pb-4 border-b border-slate-100 flex items-start justify-between gap-4">
            <div className="min-w-0">
              {title && (
                <h2 id="modal-title" className="text-[16px] font-semibold text-slate-900 tracking-tight">
                  {title}
                </h2>
              )}
              {subtitle && <p className="mt-0.5 text-[12.5px] text-slate-500">{subtitle}</p>}
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="shrink-0 -m-1.5 p-1.5 rounded-md text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition"
            >
              <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                <path d="M6 6l12 12M18 6l-12 12" strokeLinecap="round" />
              </svg>
            </button>
          </header>
        )}

        <div className="flex-1 overflow-y-auto px-6 py-5">{children}</div>

        {footer && (
          <footer className="shrink-0 px-6 py-3 border-t border-slate-100 bg-slate-50/60 flex items-center justify-end gap-2">
            {footer}
          </footer>
        )}
      </div>

      <style jsx>{`
        @keyframes modalFadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes modalSlideIn {
          from { opacity: 0; transform: translateY(8px) scale(0.98); }
          to { opacity: 1; transform: translateY(0) scale(1); }
        }
      `}</style>
    </div>,
    document.body,
  )
}

/** Tiny confirm dialog — pass message + onConfirm/onCancel. */
export function ConfirmModal({
  open,
  onClose,
  onConfirm,
  title,
  body,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  destructive = false,
  busy = false,
}: {
  open: boolean
  onClose: () => void
  onConfirm: () => void
  title: string
  body?: React.ReactNode
  confirmLabel?: string
  cancelLabel?: string
  destructive?: boolean
  busy?: boolean
}) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      size="sm"
      title={title}
      footer={
        <>
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="px-3 py-1.5 rounded-md bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 text-[12.5px] font-medium disabled:opacity-50 transition"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={busy}
            className={`px-3 py-1.5 rounded-md text-white text-[12.5px] font-medium disabled:opacity-50 transition ${
              destructive ? 'bg-rose-600 hover:bg-rose-700' : 'bg-slate-900 hover:bg-slate-700'
            }`}
          >
            {busy ? '…' : confirmLabel}
          </button>
        </>
      }
    >
      {body && <div className="text-[13px] text-slate-700 leading-relaxed">{body}</div>}
    </Modal>
  )
}
