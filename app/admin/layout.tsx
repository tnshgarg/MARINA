import Link from 'next/link'
import { signOut } from '@/auth'
import { requireAdminOrRedirect } from '@/lib/auth/admin'

export const dynamic = 'force-dynamic'

/**
 * Founder admin console.
 *
 * Distinct app shell from the customer-facing /org and /dashboard surfaces —
 * different navigation, different palette accents, and a "this is internal"
 * vibe so you never confuse what you're looking at when screen-sharing during
 * a sales call.
 */
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const { me } = await requireAdminOrRedirect()

  async function signOutAction() {
    'use server'
    await signOut({ redirectTo: '/' })
  }

  return (
    <div className="min-h-screen bg-[#0f1115] text-slate-100">
      <aside className="fixed inset-y-0 left-0 w-60 border-r border-white/10 bg-[#0a0c10] flex flex-col">
        <div className="px-5 py-5 border-b border-white/10">
          <div className="flex items-center gap-2.5">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo.svg" width={26} height={26} alt="" aria-hidden className="block opacity-90" />
            <div>
              <p className="font-semibold text-[15px] tracking-tight">MARINA</p>
              <p className="text-[10.5px] text-amber-400/80 uppercase tracking-widest font-medium">
                Founder console
              </p>
            </div>
          </div>
        </div>

        <nav className="flex-1 py-3 overflow-y-auto">
          <AdminNavLink href="/admin"            label="Overview"   icon={<OverviewIcon />} />
          <AdminNavLink href="/admin/workspaces" label="Workspaces" icon={<BuildingIcon />} />
          <AdminNavLink href="/admin/health"     label="Health"     icon={<PulseIcon />} />
          <AdminNavLink href="/admin/errors"     label="Errors"     icon={<BugIcon />} />
          <AdminNavLink href="/admin/features"   label="Features"   icon={<ChartIcon />} />
          <AdminNavLink href="/admin/costs"      label="AI costs"   icon={<DollarIcon />} />
          <AdminNavLink href="/admin/broadcast"  label="Broadcast"  icon={<MegaphoneIcon />} />
          <div className="mt-4 pt-3 border-t border-white/5 mx-3" />
          <AdminNavLink href="/dashboard" label="← Back to MARINA"  icon={<ExitIcon />} muted />
        </nav>

        <div className="px-4 py-3 border-t border-white/10 text-[11.5px] text-slate-400">
          <p>Signed in as</p>
          <p className="text-slate-100 truncate">{me.email ?? me.login}</p>
          <form action={signOutAction} className="mt-2">
            <button type="submit" className="text-rose-300 hover:text-rose-200 text-[11px]">
              Sign out
            </button>
          </form>
        </div>
      </aside>

      <main className="pl-60 min-h-screen">
        <div className="max-w-7xl mx-auto px-7 py-8">{children}</div>
      </main>
    </div>
  )
}

function AdminNavLink({
  href,
  label,
  icon,
  muted,
}: {
  href: string
  label: string
  icon: React.ReactNode
  muted?: boolean
}) {
  return (
    <Link
      href={href}
      className={`flex items-center gap-2.5 px-5 py-2 text-[13px] hover:bg-white/5 transition-colors ${
        muted ? 'text-slate-500 hover:text-slate-300' : 'text-slate-200'
      }`}
    >
      <span className="w-4 h-4 inline-flex">{icon}</span>
      {label}
    </Link>
  )
}

function OverviewIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}>
      <rect x={3} y={3} width={7} height={9} rx={1.5} />
      <rect x={14} y={3} width={7} height={5} rx={1.5} />
      <rect x={3} y={16} width={7} height={5} rx={1.5} />
      <rect x={14} y={12} width={7} height={9} rx={1.5} />
    </svg>
  )
}
function BuildingIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}>
      <path d="M4 21V5a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v16M14 8h4a2 2 0 0 1 2 2v11M8 7h2M8 11h2M8 15h2M17 12h.5M17 16h.5" strokeLinecap="round" />
      <path d="M3 21h18" strokeLinecap="round" />
    </svg>
  )
}
function PulseIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}>
      <path d="M3 12h3l3-8 4 16 3-8h5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}
function ChartIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}>
      <path d="M3 21h18M6 17V9M11 17V5M16 17v-6M21 17V13" strokeLinecap="round" />
    </svg>
  )
}
function DollarIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}>
      <path d="M12 3v18M16 7H9.5a2.5 2.5 0 0 0 0 5h5a2.5 2.5 0 0 1 0 5H8" strokeLinecap="round" />
    </svg>
  )
}
function MegaphoneIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}>
      <path d="M3 11v2a2 2 0 0 0 2 2h2l5 4V5L7 9H5a2 2 0 0 0-2 2zM16 9a4 4 0 0 1 0 6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}
function BugIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}>
      <path d="M8 6h8M12 2v4M5 11l-3 1M19 11l3 1M5 18l-2 2M19 18l2 2M8 22a4 4 0 0 1-4-4v-3a4 4 0 0 1 4-4h8a4 4 0 0 1 4 4v3a4 4 0 0 1-4 4z" strokeLinecap="round" />
    </svg>
  )
}
function ExitIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}>
      <path d="M14 5l-7 7 7 7M7 12h14" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}
