'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'

export type SwitcherOrg = { id: number; name: string; role: string; logoUrl?: string | null }

const isManagerPlus = (role: string) => role === 'admin' || role === 'manager' || role === 'lead'

/**
 * Workspace card + org switcher. When the signed-in user belongs to more than
 * one workspace (e.g. one they created + ones they were invited to), this lets
 * them jump between them instead of being silently stuck in whichever
 * membership happened to sort first. With a single org it renders as a plain,
 * non-interactive card (no confusing affordance).
 *
 * Manager+ orgs open the org console (/org/{id}); member-only orgs open the
 * personal console (/dashboard).
 */
export function OrgSwitcher({
  currentOrgId,
  orgName,
  orgLogoUrl,
  orgs,
}: {
  currentOrgId: number
  orgName: string
  orgLogoUrl?: string | null
  orgs: SwitcherOrg[]
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const multi = orgs.length > 1

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    window.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      window.removeEventListener('keydown', onKey)
    }
  }, [open])

  function go(o: SwitcherOrg) {
    setOpen(false)
    if (o.id === currentOrgId) return
    router.push(isManagerPlus(o.role) ? `/org/${o.id}` : '/dashboard')
  }

  const card = (
    <>
      {orgLogoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={orgLogoUrl}
          alt=""
          width={24}
          height={24}
          className="w-6 h-6 rounded-md object-cover border border-slate-200 bg-white shrink-0"
        />
      ) : (
        <span className="w-6 h-6 rounded-md bg-gradient-to-br from-[var(--m-accent)] to-[var(--m-clay)] text-white text-[11px] font-semibold inline-flex items-center justify-center shrink-0">
          {orgName.charAt(0).toUpperCase()}
        </span>
      )}
      <div className="min-w-0 flex-1 text-left">
        <p className="text-[10px] text-slate-500 uppercase tracking-wider font-medium">Workspace</p>
        <p className="text-[13px] font-medium text-slate-900 truncate">{orgName}</p>
      </div>
      {multi && (
        <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="shrink-0 text-slate-400" aria-hidden>
          <path d="M8 9l4-4 4 4M8 15l4 4 4-4" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      )}
    </>
  )

  if (!multi) {
    return (
      <div className="nav-workspace mx-4 my-3 rounded-xl bg-slate-50 border border-slate-200 px-3 py-2 flex items-center gap-2">
        {card}
      </div>
    )
  }

  return (
    <div ref={ref} className="nav-workspace mx-4 my-3 relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full rounded-xl bg-slate-50 border border-slate-200 hover:border-slate-300 px-3 py-2 flex items-center gap-2 transition"
        aria-haspopup="listbox"
        aria-expanded={open}
        title="Switch workspace"
      >
        {card}
      </button>
      {open && (
        <div
          role="listbox"
          className="absolute left-0 right-0 top-full mt-1 z-50 rounded-xl border border-slate-200 bg-white shadow-xl overflow-hidden py-1"
        >
          <p className="px-3 pt-1 pb-1.5 text-[10px] uppercase tracking-wider text-slate-400 font-semibold">
            Your workspaces
          </p>
          {orgs.map((o) => (
            <button
              key={o.id}
              type="button"
              role="option"
              aria-selected={o.id === currentOrgId}
              onClick={() => go(o)}
              className={`w-full flex items-center gap-2 px-3 py-2 text-left transition ${
                o.id === currentOrgId ? 'bg-[var(--m-accent-soft)]/50' : 'hover:bg-slate-50'
              }`}
            >
              {o.logoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={o.logoUrl} alt="" width={20} height={20} className="w-5 h-5 rounded object-cover border border-slate-200 shrink-0" />
              ) : (
                <span className="w-5 h-5 rounded bg-gradient-to-br from-[var(--m-accent)] to-[var(--m-clay)] text-white text-[10px] font-semibold inline-flex items-center justify-center shrink-0">
                  {o.name.charAt(0).toUpperCase()}
                </span>
              )}
              <span className="text-[12.5px] font-medium text-slate-900 truncate flex-1">{o.name}</span>
              <span className="text-[10px] text-slate-400 capitalize shrink-0">{o.role}</span>
              {o.id === currentOrgId && <span className="text-[var(--m-accent)] text-[12px] shrink-0">✓</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
