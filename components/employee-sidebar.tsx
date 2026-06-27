'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { CharacterAvatar } from '@/components/character-avatar'
import { MarinaMark } from '@/components/marina-mark'
import { NotificationBell } from '@/components/notification-bell'
import { PunchControl } from '@/components/punch-control'

/**
 * Employee dashboard sidebar — turns the personal console into a real,
 * navigable powerhub (like the manager side). Every item is its own page so
 * each feature gets room to breathe (e.g. the standup page lists past days).
 * Punch in/out is pinned in the footer.
 */
type Item = { href: string; label: string; icon: React.ReactNode; exact?: boolean; orgOnly?: boolean }

export function EmployeeSidebar({
  orgId,
  canSeeTeam,
  isOrgMember,
  userName,
  userLogin,
  userAvatarUrl,
  characterKey,
  activeSince,
  signOutAction,
}: {
  orgId: number | null
  canSeeTeam: boolean
  isOrgMember: boolean
  userName: string | null
  userLogin: string
  userAvatarUrl: string | null
  characterKey: string | null
  activeSince: string | null
  signOutAction: () => Promise<void> | void
}) {
  const pathname = usePathname() ?? ''

  const primary: Item[] = [
    { href: '/dashboard', label: 'Overview', icon: <HomeIcon />, exact: true },
    { href: '/dashboard/standup', label: 'Daily standup', icon: <ScrumIcon />, orgOnly: true },
    { href: '/dashboard/report', label: 'My report', icon: <PulseIcon />, orgOnly: true },
    { href: '/dashboard/meetings', label: 'Meetings', icon: <CalIcon /> },
    { href: '/dashboard/team', label: 'My team', icon: <TeamIcon />, orgOnly: true },
    { href: '/dashboard/connections', label: 'Connections', icon: <PlugIcon /> },
  ].filter((i) => isOrgMember || !i.orgOnly)

  const isActive = (i: Item) => (i.exact ? pathname === i.href : pathname === i.href || pathname.startsWith(i.href + '/'))

  return (
    <aside className="app-sidebar">
      <div className="shrink-0">
        <div className="px-5 pt-5 pb-2 flex items-center gap-2.5">
          <MarinaMark size={26} className="shrink-0" label="" />
          <div className="min-w-0">
            <p className="font-semibold text-[15px] tracking-tight text-[var(--m-ink)]">MARINA</p>
            <p className="text-[11px] text-[var(--m-ink-3)] -mt-0.5">My console</p>
          </div>
        </div>
      </div>

      <nav className="app-sidebar-scroll mt-1">
        {primary.map((i) => (
          <Link
            key={i.href}
            href={i.href}
            prefetch
            className={`nav-item ${isActive(i) ? 'nav-item-active' : ''}`}
          >
            <span className="nav-icon">{i.icon}</span>
            <span className="nav-label flex-1 min-w-0 truncate">{i.label}</span>
          </Link>
        ))}

        <div className="my-2.5 mx-5 border-t border-[var(--m-border-soft)]" aria-hidden />

        {canSeeTeam && orgId && (
          <Link href={`/org/${orgId}`} prefetch className="nav-item">
            <span className="nav-icon"><GridIcon /></span>
            <span className="nav-label flex-1 min-w-0 truncate">Team dashboard</span>
          </Link>
        )}
        <Link href="/dashboard/data" prefetch className={`nav-item ${pathname.startsWith('/dashboard/data') ? 'nav-item-active' : ''}`}>
          <span className="nav-icon"><ChartIcon /></span>
          <span className="nav-label flex-1 min-w-0 truncate">My data</span>
        </Link>
        <Link href="/dashboard/attendance" prefetch className={`nav-item ${pathname.startsWith('/dashboard/attendance') ? 'nav-item-active' : ''}`}>
          <span className="nav-icon"><ClockIcon /></span>
          <span className="nav-label flex-1 min-w-0 truncate">Attendance</span>
        </Link>
        <Link href="/help" prefetch className="nav-item">
          <span className="nav-icon"><HelpIcon /></span>
          <span className="nav-label flex-1 min-w-0 truncate">Help &amp; docs</span>
        </Link>
        <Link href="/settings" prefetch className={`nav-item ${pathname.startsWith('/settings') ? 'nav-item-active' : ''}`}>
          <span className="nav-icon"><CogIcon /></span>
          <span className="nav-label flex-1 min-w-0 truncate">Settings</span>
        </Link>
      </nav>

      <div className="nav-footer shrink-0 px-4 pb-4 pt-3 border-t border-[var(--m-border-soft)] bg-white">
        <div className="mb-2.5">
          <PunchControl activeSince={activeSince} />
        </div>
        <div className="flex items-center gap-2 flex-nowrap min-h-[44px]">
          <div className="flex items-center gap-2 min-w-0 flex-1">
            <CharacterAvatar characterKey={characterKey} name={userName ?? userLogin} imageUrl={userAvatarUrl} size={32} />
            <div className="min-w-0 flex-1 leading-tight">
              <p className="text-[12.5px] font-medium text-[var(--m-ink)] truncate leading-tight">
                {userName ?? `@${userLogin}`}
              </p>
              <p className="text-[11px] text-[var(--m-ink-3)] truncate leading-tight">@{userLogin}</p>
            </div>
          </div>
          <div className="shrink-0 flex items-center gap-1">
            <NotificationBell />
            <form action={signOutAction}>
              <button
                type="submit"
                className="w-8 h-8 inline-flex items-center justify-center rounded-md text-[var(--m-ink-3)] hover:text-rose-600 hover:bg-rose-50 transition"
                title="Sign out"
                aria-label="Sign out"
              >
                <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                  <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4" />
                  <path d="M10 17l-5-5 5-5M5 12h12" />
                </svg>
              </button>
            </form>
          </div>
        </div>
      </div>
    </aside>
  )
}

/* ---- icons ---- */
function HomeIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <path d="M4 11l8-7 8 7M6 10v9a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1v-9" strokeLinecap="round" strokeLinejoin="round" />
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
function PlugIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <path d="M9 2v6M15 2v6M7 8h10v3a5 5 0 0 1-10 0V8ZM12 16v6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}
function CalIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
      <rect x="3" y="4.5" width="18" height="16" rx="2" />
      <path d="M3 9h18M8 3v3M16 3v3" />
    </svg>
  )
}
function ScrumIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <path d="M4 19a8 8 0 0 1 16 0" strokeLinecap="round" />
      <circle cx={6} cy={10} r={2} />
      <circle cx={12} cy={8} r={2.4} />
      <circle cx={18} cy={10} r={2} />
    </svg>
  )
}
function TeamIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <circle cx={9} cy={8} r={3} />
      <circle cx={17} cy={9} r={2.5} />
      <path d="M3 20c0-3 3-5 6-5s6 2 6 5" />
      <path d="M14 20c.6-2.5 2.5-4 4-4 2 0 3 1.5 3 4" />
    </svg>
  )
}
function GridIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <rect x="3" y="3" width="7" height="7" rx="1.5" />
      <rect x="14" y="3" width="7" height="7" rx="1.5" />
      <rect x="3" y="14" width="7" height="7" rx="1.5" />
      <rect x="14" y="14" width="7" height="7" rx="1.5" />
    </svg>
  )
}
function ChartIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <path d="M4 20V4M4 20h16M8 16v-4M12 16V8M16 16v-7" strokeLinecap="round" />
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
function HelpIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <circle cx={12} cy={12} r={9} />
      <path d="M9.5 9a2.5 2.5 0 1 1 3.5 2.3c-.8.4-1 .9-1 1.7" strokeLinecap="round" />
      <circle cx={12} cy={16.5} r={0.6} fill="currentColor" stroke="none" />
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
