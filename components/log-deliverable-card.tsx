'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'

type Deliverable = {
  id: number
  title: string
  detail: string | null
  url: string | null
  kind: string | null
  completedAt: string
  verificationStatus: 'unverified' | 'verified' | 'mismatch'
}

/**
 * Personal-dashboard widget that lets a teammate log "I shipped X today".
 *
 * This is the universal output channel — it works for designers, sales,
 * support, ops, anyone whose work doesn't show up in GitHub. The screen-
 * monitoring pipeline can later cross-check the logged item against the
 * screenshot taken at completion time for honesty.
 */
export function LogDeliverableCard({ discipline }: { discipline?: string }) {
  const router = useRouter()
  const [items, setItems] = useState<Deliverable[]>([])
  const [loading, setLoading] = useState(true)
  const [title, setTitle] = useState('')
  const [url, setUrl] = useState('')
  const [kind, setKind] = useState<string>(defaultKind(discipline))
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const res = await fetch('/api/me/deliverables')
        if (!cancelled && res.ok) {
          const data = await res.json()
          setItems(data.deliverables ?? [])
        }
      } catch {
        // first-load failure leaves the list empty — user can still add.
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  async function add(e: React.FormEvent) {
    e.preventDefault()
    if (!title.trim()) return
    setBusy(true)
    setErr(null)
    try {
      const res = await fetch('/api/me/deliverables', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: title.trim(),
          url: url.trim() || null,
          kind: kind || null,
        }),
      })
      const data = await res.json()
      if (res.status === 409 && data?.duplicateOf) {
        setErr("You already logged this in the last 4 hours. Edit the existing one if needed.")
        return
      }
      if (!res.ok) throw new Error(data?.error || 'failed')
      setItems((prev) => [data.deliverable, ...prev])
      setTitle('')
      setUrl('')
      router.refresh()
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  async function remove(id: number) {
    if (!confirm('Remove this entry?')) return
    setBusy(true)
    try {
      const res = await fetch(`/api/me/deliverables/${id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      setItems((prev) => prev.filter((d) => d.id !== id))
      router.refresh()
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  const KIND_OPTIONS = kindOptionsFor(discipline)

  return (
    <section className="app-card app-card-lg">
      <div className="section-title-row">
        <div>
          <h3 className="app-h2">Mark work as done</h3>
          <p className="app-sub mt-1">
            Log a quick note when you ship something. Your manager sees it.
          </p>
        </div>
      </div>

      <form onSubmit={add} className="mt-3 space-y-2">
        <input
          type="text"
          required
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder='e.g. "Shipped onboarding redesign v2"'
          maxLength={200}
          disabled={busy}
          className="input"
        />
        <div className="grid grid-cols-2 gap-2">
          <input
            type="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="Link (optional)"
            disabled={busy}
            className="input"
          />
          <select
            value={kind}
            onChange={(e) => setKind(e.target.value)}
            disabled={busy}
            className="select"
            aria-label="Kind of deliverable"
          >
            {KIND_OPTIONS.map((k) => (
              <option key={k.value} value={k.value}>
                {k.label}
              </option>
            ))}
          </select>
        </div>
        <div className="flex items-center justify-between gap-2">
          <p className="text-[11.5px] text-slate-500">
            Logging at <span className="font-medium text-slate-700">{new Date().toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}</span>.
            We'll pin the screenshot at that moment for honest verification.
          </p>
          <button
            type="submit"
            disabled={busy || !title.trim()}
            className="px-3 py-1.5 rounded-md bg-slate-900 hover:bg-slate-700 text-white text-[12.5px] font-medium disabled:opacity-50 transition"
          >
            {busy ? 'Logging…' : 'Mark as done'}
          </button>
        </div>
        {err && <p className="text-[12px] text-rose-600">{err}</p>}
      </form>

      <div className="mt-5">
        <p className="app-eyebrow mb-2">Recently logged</p>
        {loading ? (
          <p className="text-[12px] text-slate-500">Loading…</p>
        ) : items.length === 0 ? (
          <p className="text-[12px] text-slate-500 italic">
            Nothing logged yet. Mark your first piece of work above.
          </p>
        ) : (
          <ul className="divide-y divide-slate-100 border border-slate-100 rounded-lg overflow-hidden">
            {items.slice(0, 6).map((d) => (
              <li key={d.id} className="px-3 py-2 flex items-start gap-3 text-[12.5px]">
                <span
                  className="shrink-0 inline-block w-1.5 h-1.5 rounded-full mt-1.5"
                  style={{ background: 'var(--m-accent)' }}
                  aria-hidden
                />
                <div className="flex-1 min-w-0">
                  <div className="flex items-baseline gap-2">
                    {d.url ? (
                      <a
                        href={d.url}
                        target="_blank"
                        rel="noreferrer"
                        className="text-slate-900 font-medium hover:text-[var(--m-accent)] truncate"
                      >
                        {d.title}
                      </a>
                    ) : (
                      <span className="text-slate-900 font-medium truncate">{d.title}</span>
                    )}
                    {d.kind && (
                      <span className="text-[10px] uppercase tracking-wider text-slate-400">
                        {d.kind}
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] text-slate-500 tabular-nums">
                    {new Date(d.completedAt).toLocaleString(undefined, {
                      hour: 'numeric',
                      minute: '2-digit',
                      day: 'numeric',
                      month: 'short',
                    })}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => remove(d.id)}
                  disabled={busy}
                  className="shrink-0 text-[11px] text-slate-400 hover:text-rose-600 disabled:opacity-50"
                  aria-label="Remove"
                >
                  ×
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  )
}

function defaultKind(discipline?: string): string {
  switch (discipline) {
    case 'engineering': return 'pr'
    case 'design':      return 'design'
    case 'product':     return 'spec'
    case 'sales':       return 'deal'
    case 'support':     return 'ticket'
    case 'marketing':   return 'campaign'
    case 'ops':         return 'task'
    case 'hr':          return 'case'
    case 'finance':     return 'report'
    case 'exec':        return 'decision'
    default:            return 'task'
  }
}

function kindOptionsFor(discipline?: string): Array<{ value: string; label: string }> {
  const base = [
    { value: 'task', label: 'General task' },
    { value: 'design', label: 'Design' },
    { value: 'spec', label: 'Spec / doc' },
    { value: 'deal', label: 'Deal / call' },
    { value: 'ticket', label: 'Ticket / case' },
    { value: 'campaign', label: 'Campaign' },
    { value: 'report', label: 'Report' },
    { value: 'decision', label: 'Decision' },
    { value: 'pr', label: 'Code change' },
  ]
  // Move the default for this discipline to the top
  const top = defaultKind(discipline)
  return [...base.filter((b) => b.value === top), ...base.filter((b) => b.value !== top)]
}
