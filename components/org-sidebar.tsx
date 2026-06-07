'use client'

import { usePathname } from 'next/navigation'
import { CharacterAvatar } from '@/components/character-avatar'
import { NavLink } from '@/components/nav-link'
import { getCharacter } from '@/lib/characters/data'

const NAV: { key: string; label: string; matches: RegExp; href: (orgId: number) => string; icon: React.ReactNode }[] = [
  { key: 'pulse', label: 'Team Pulse', matches: /^\/org\/\d+$/, href: (o) => `/org/${o}`, icon: <PulseIcon /> },
  { key: 'members', label: 'Team Members', matches: /^\/org\/\d+\/members(\/|$)/, href: (o) => `/org/${o}/members`, icon: <PeopleIcon /> },
  { key: 'shifts', label: 'Shifts', matches: /^\/org\/\d+\/shifts(\/|$)/, href: (o) => `/org/${o}/shifts`, icon: <ClockIcon /> },
  { key: 'activity', label: 'Activity Feed', matches: /^\/org\/\d+\/activity(\/|$)/, href: (o) => `/org/${o}/activity`, icon: <FeedIcon /> },
  { key: 'leaves', label: 'Leave Requests', matches: /^\/org\/\d+\/leaves(\/|$)/, href: (o) => `/org/${o}/leaves`, icon: <LeafIcon /> },
  { key: 'breaks', label: 'Breaks & Updates', matches: /^\/org\/\d+\/breaks(\/|$)/, href: (o) => `/org/${o}/breaks`, icon: <PauseIcon /> },
  { key: 'insights', label: 'Insights', matches: /^\/org\/\d+\/insights(\/|$)/, href: (o) => `/org/${o}/insights`, icon: <ChartIcon /> },
  { key: 'orgSettings', label: 'Org Settings', matches: /^\/org\/\d+\/settings(\/|$)/, href: (o) => `/org/${o}/settings`, icon: <CogIcon /> },
  { key: 'settings', label: 'My Settings', matches: /^\/settings(\/|$)/, href: () => `/settings`, icon: <UserIcon /> },
]

export function OrgSidebar({
  orgId,
  orgName,
  userLogin,
  characterKey,
  role,
  pendingLeaveCount = 0,
  signOutAction,
}: {
  orgId: number
  orgName: string
  userLogin: string
  characterKey: string | null
  role: string
  pendingLeaveCount?: number
  signOutAction: () => Promise<void> | void
}) {
  const pathname = usePathname() ?? ''
  const me = getCharacter(characterKey)

  return (
    <aside className="app-sidebar">
      <div className="px-5 pt-5 pb-2">
        <NavLink href={`/org/${orgId}`} prefetch className="flex items-center gap-2.5 group">
          <LogoMark />
          <div>
            <p className="font-semibold text-[15px] tracking-tight text-slate-900 group-hover:text-indigo-600 transition-colors">MARINA</p>
            <p className="text-[11px] text-slate-400">Your team, your way.</p>
          </div>
        </NavLink>
      </div>

      <div className="mx-4 my-3 rounded-xl bg-slate-50 border border-slate-200 px-3 py-2 flex items-center gap-2">
        <span className="w-6 h-6 rounded-md bg-gradient-to-br from-indigo-500 to-violet-500 text-white text-[11px] font-semibold inline-flex items-center justify-center">
          {orgName.charAt(0).toUpperCase()}
        </span>
        <div className="min-w-0">
          <p className="text-[10px] text-slate-500 uppercase tracking-wider font-medium">Workspace</p>
          <p className="text-[13px] font-medium text-slate-900 truncate">{orgName}</p>
        </div>
      </div>

      <nav className="mt-1 flex-1">
        {NAV.map((n) => {
          const isActive = n.matches.test(pathname)
          const badge = n.key === 'leaves' && pendingLeaveCount > 0 ? pendingLeaveCount : null
          return (
            <NavLink
              key={n.key}
              href={n.href(orgId)}
              prefetch
              className={`nav-item ${isActive ? 'nav-item-active' : ''}`}
            >
              <span className="nav-icon">{n.icon}</span>
              <span className="flex-1">{n.label}</span>
              {badge !== null && (
                <span className="text-[11px] font-medium px-1.5 rounded bg-indigo-100 text-indigo-700 tabular">
                  {badge}
                </span>
              )}
            </NavLink>
          )
        })}
      </nav>

      <div className="px-4 pb-4">
        <div className="rounded-2xl border border-slate-200 p-3 flex items-center gap-3">
          <CharacterAvatar characterKey={characterKey} size={36} />
          <div className="min-w-0 flex-1">
            <p className="text-[13px] font-medium text-slate-900 truncate">
              {me?.name ?? `@${userLogin}`}
            </p>
            <p className="text-[11px] text-slate-500 truncate">{role}</p>
          </div>
          <form action={signOutAction}>
            <button type="submit" className="btn-ghost" title="Sign out" aria-label="Sign out">
              <LogoutIcon />
            </button>
          </form>
        </div>
      </div>
    </aside>
  )
}

/* ---------- Icons (inline) ---------- */

function LogoMark() {
  return (
    <svg width={28} height={28} viewBox="0 0 28 28" fill="none" aria-hidden>
      <path d="M14 3 L24 24 H4 Z" fill="#6366f1" />
      <circle cx={14} cy={18} r={3} fill="#fff" />
    </svg>
  )
}
function PulseIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <path d="M3 12h3l3-8 4 16 3-8h5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}
function PeopleIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <circle cx={9} cy={8} r={3} />
      <circle cx={17} cy={9} r={2.5} />
      <path d="M3 20c0-3 3-5 6-5s6 2 6 5" />
      <path d="M14 20c.6-2.5 2.5-4 4-4 2 0 3 1.5 3 4" />
    </svg>
  )
}
function FeedIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <path d="M4 6h12M4 12h16M4 18h10" strokeLinecap="round" />
    </svg>
  )
}
function LeafIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <path d="M5 19c10 0 14-7 14-14-7 0-14 4-14 14Z" strokeLinejoin="round" />
      <path d="M5 19l7-7" strokeLinecap="round" />
    </svg>
  )
}
function PauseIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <rect x={6} y={5} width={4} height={14} rx={1} />
      <rect x={14} y={5} width={4} height={14} rx={1} />
    </svg>
  )
}
function ChartIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <path d="M4 20V8M10 20v-6M16 20V4M22 20H2" strokeLinecap="round" />
    </svg>
  )
}
function ClockIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <circle cx={12} cy={12} r={9} />
      <path d="M12 7v5l3 2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}
function UserIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <circle cx={12} cy={8} r={4} />
      <path d="M4 21c0-4 4-7 8-7s8 3 8 7" strokeLinecap="round" />
    </svg>
  )
}
function CogIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <circle cx={12} cy={12} r={3} />
      <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3h0a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5h0a1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8v0a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z" />
    </svg>
  )
}
function LogoutIcon() {
  return (
    <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4" />
      <path d="M10 17l-5-5 5-5M5 12h12" />
    </svg>
  )
}
