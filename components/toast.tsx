'use client'

import { createContext, useCallback, useContext, useEffect, useState } from 'react'

type ToastKind = 'success' | 'error' | 'info'

type Toast = {
  id: number
  kind: ToastKind
  title: string
  body?: string
}

type ToastContextValue = {
  push: (toast: Omit<Toast, 'id'>) => void
}

const ToastContext = createContext<ToastContextValue | null>(null)

let nextId = 1

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])

  const push = useCallback((t: Omit<Toast, 'id'>) => {
    const id = nextId++
    setToasts((prev) => [...prev, { ...t, id }])
    // Auto-dismiss after 4 seconds (success) or 6 seconds (errors)
    const ttl = t.kind === 'error' ? 6000 : 4000
    setTimeout(() => {
      setToasts((prev) => prev.filter((x) => x.id !== id))
    }, ttl)
  }, [])

  return (
    <ToastContext.Provider value={{ push }}>
      {children}
      <ToastViewport toasts={toasts} onDismiss={(id) => setToasts((p) => p.filter((x) => x.id !== id))} />
    </ToastContext.Provider>
  )
}

export function useToast() {
  const ctx = useContext(ToastContext)
  if (!ctx) {
    // Graceful fallback for components that render outside a provider
    return {
      push: (t: Omit<Toast, 'id'>) => {
        if (t.kind === 'error') console.error('[toast]', t.title, t.body)
        else console.log('[toast]', t.title, t.body)
      },
    }
  }
  return ctx
}

function ToastViewport({ toasts, onDismiss }: { toasts: Toast[]; onDismiss: (id: number) => void }) {
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])
  if (!mounted) return null

  return (
    <div
      role="region"
      aria-label="Notifications"
      className="fixed top-4 right-4 z-[100] flex flex-col gap-2 max-w-sm pointer-events-none"
    >
      {toasts.map((t) => (
        <div
          key={t.id}
          className={`pointer-events-auto rounded-xl shadow-lg border px-4 py-3 backdrop-blur bg-white/95 ${
            t.kind === 'success'
              ? 'border-emerald-200'
              : t.kind === 'error'
                ? 'border-rose-200'
                : 'border-[var(--m-border)]'
          }`}
          style={{ animation: 'toastIn 220ms cubic-bezier(0.22, 1, 0.36, 1)' }}
        >
          <div className="flex items-start gap-3">
            <span className="text-[16px] leading-none mt-0.5">
              {t.kind === 'success' ? '✅' : t.kind === 'error' ? '⚠️' : 'ℹ️'}
            </span>
            <div className="flex-1 min-w-0">
              <p
                className={`text-[13px] font-medium ${
                  t.kind === 'success'
                    ? 'text-emerald-900'
                    : t.kind === 'error'
                      ? 'text-rose-900'
                      : 'text-[var(--m-ink)]'
                }`}
              >
                {t.title}
              </p>
              {t.body && <p className="mt-0.5 text-[12px] text-[var(--m-ink-2)] break-words">{t.body}</p>}
            </div>
            <button
              type="button"
              onClick={() => onDismiss(t.id)}
              className="text-[var(--m-ink-4)] hover:text-[var(--m-ink-2)] text-[14px] leading-none"
              aria-label="Dismiss"
            >
              ✕
            </button>
          </div>
        </div>
      ))}
      <style jsx>{`
        @keyframes toastIn {
          from {
            opacity: 0;
            transform: translateX(20px);
          }
          to {
            opacity: 1;
            transform: translateX(0);
          }
        }
      `}</style>
    </div>
  )
}
