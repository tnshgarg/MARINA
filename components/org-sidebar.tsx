"use client";

import { usePathname } from "next/navigation";
import { CharacterAvatar } from "@/components/character-avatar";
import { NavLink } from "@/components/nav-link";
import { NotificationBell } from "@/components/notification-bell";
import { getCharacter } from "@/lib/characters/data";

type NavEntry = {
  key: string;
  label: string;
  matches: RegExp;
  href: (orgId: number) => string;
  icon: React.ReactNode;
  openInNewTab?: boolean;
};

const NAV: NavEntry[] = [
  {
    key: "pulse",
    label: "Dashboard",
    matches: /^\/org\/\d+$/,
    href: (o) => `/org/${o}`,
    icon: <PulseIcon />,
  },
  // People combines Team Members + Shifts + Attendance via a tab strip inside the page
  {
    key: "people",
    label: "People",
    matches: /^\/org\/\d+\/(members|shifts|attendance)(\/|$)/,
    href: (o) => `/org/${o}/members`,
    icon: <PeopleIcon />,
  },
  // Activity combines feed + Insights via a tab strip inside the page
  {
    key: "activity",
    label: "Activity",
    matches: /^\/org\/\d+\/(activity|insights)(\/|$)/,
    href: (o) => `/org/${o}/activity`,
    icon: <FeedIcon />,
  },
  {
    key: "leaves",
    label: "Leave Requests",
    matches: /^\/org\/\d+\/leaves(\/|$)/,
    href: (o) => `/org/${o}/leaves`,
    icon: <LeafIcon />,
  },
  {
    key: "breaks",
    label: "Breaks",
    matches: /^\/org\/\d+\/breaks(\/|$)/,
    href: (o) => `/org/${o}/breaks`,
    icon: <PauseIcon />,
  },
  // Scrum Mode — projection-friendly view for live standups. Opens in a new tab.
  {
    key: "scrum",
    label: "Scrum Mode",
    matches: /^\/scrum\/\d+(\/|$)/,
    href: (o) => `/scrum/${o}`,
    icon: <ScrumIcon />,
    openInNewTab: true,
  },
  // Settings combines Org Settings (workspace) + My Settings (profile) via tabs
  {
    key: "settings",
    label: "Settings",
    matches: /^(?:\/settings|\/org\/\d+\/settings)(\/|$)/,
    href: (o) => `/org/${o}/settings`,
    icon: <CogIcon />,
  },
];

export function OrgSidebar({
  orgId,
  orgName,
  userLogin,
  characterKey,
  role,
  pendingLeaveCount = 0,
  signOutAction,
}: {
  orgId: number;
  orgName: string;
  userLogin: string;
  characterKey: string | null;
  role: string;
  pendingLeaveCount?: number;
  signOutAction: () => Promise<void> | void;
}) {
  const pathname = usePathname() ?? "";
  const me = getCharacter(characterKey);

  return (
    <aside className="app-sidebar">
      {/* Pinned header */}
      <div className="shrink-0">
        <div className="px-5 pt-5 pb-2">
          <NavLink
            href={`/org/${orgId}`}
            prefetch
            className="flex items-center gap-2.5 group"
          >
            <LogoMark />
            <div>
              <p className="font-semibold text-[15px] tracking-tight text-slate-900 group-hover:text-indigo-600 transition-colors">
                MARINA
              </p>
              <p className="text-[11px] text-slate-400">Your team, your way.</p>
            </div>
          </NavLink>
        </div>

        <div className="mx-4 my-3 rounded-xl bg-slate-50 border border-slate-200 px-3 py-2 flex items-center gap-2">
          <span className="w-6 h-6 rounded-md bg-gradient-to-br from-indigo-500 to-violet-500 text-white text-[11px] font-semibold inline-flex items-center justify-center">
            {orgName.charAt(0).toUpperCase()}
          </span>
          <div className="min-w-0">
            <p className="text-[10px] text-slate-500 uppercase tracking-wider font-medium">
              Workspace
            </p>
            <p className="text-[13px] font-medium text-slate-900 truncate">
              {orgName}
            </p>
          </div>
        </div>
      </div>

      {/* Scrollable nav */}
      <nav className="app-sidebar-scroll mt-1">
        {NAV.map((n) => {
          const isActive = n.matches.test(pathname);
          const badge =
            n.key === "leaves" && pendingLeaveCount > 0
              ? pendingLeaveCount
              : null;
          const isExternal = n.openInNewTab === true;
          return (
            <NavLink
              key={n.key}
              href={n.href(orgId)}
              prefetch={!isExternal}
              target={isExternal ? "_blank" : undefined}
              rel={isExternal ? "noopener noreferrer" : undefined}
              className={`nav-item ${isActive ? "nav-item-active" : ""}`}
            >
              <span className="nav-icon">{n.icon}</span>
              <span className="flex-1">{n.label}</span>
              {isExternal && <ExternalLinkIcon />}
              {badge !== null && (
                <span className="text-[11px] font-medium px-1.5 rounded bg-indigo-100 text-indigo-700 tabular">
                  {badge}
                </span>
              )}
            </NavLink>
          );
        })}
      </nav>

      {/* Pinned footer — always visible regardless of scroll */}
      <div className="shrink-0 px-4 pb-4 pt-3 border-t border-slate-100 bg-white">
        <div className="flex items-center gap-2">
          <CharacterAvatar characterKey={characterKey} size={32} />
          <div className="min-w-0 flex-1">
            <p className="text-[12.5px] font-medium text-slate-900 truncate">
              {me?.name ?? `@${userLogin}`}
            </p>
            <p className="text-[11px] text-slate-500 truncate">{role}</p>
          </div>
          <NotificationBell />
          <form action={signOutAction}>
            <button
              type="submit"
              className="btn-ghost"
              title="Sign out"
              aria-label="Sign out"
            >
              <LogoutIcon />
            </button>
          </form>
        </div>
      </div>
    </aside>
  );
}

/* ---------- Icons (inline) ---------- */

function LogoMark() {
  return (
    <svg width={28} height={28} viewBox="0 0 28 28" fill="none" aria-hidden>
      <path d="M14 3 L24 24 H4 Z" fill="#6366f1" />
      <circle cx={14} cy={18} r={3} fill="#fff" />
    </svg>
  );
}
function PulseIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <path
        d="M3 12h3l3-8 4 16 3-8h5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
function PeopleIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <circle cx={9} cy={8} r={3} />
      <circle cx={17} cy={9} r={2.5} />
      <path d="M3 20c0-3 3-5 6-5s6 2 6 5" />
      <path d="M14 20c.6-2.5 2.5-4 4-4 2 0 3 1.5 3 4" />
    </svg>
  );
}
function FeedIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <path d="M4 6h12M4 12h16M4 18h10" strokeLinecap="round" />
    </svg>
  );
}
function LeafIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <path d="M5 19c10 0 14-7 14-14-7 0-14 4-14 14Z" strokeLinejoin="round" />
      <path d="M5 19l7-7" strokeLinecap="round" />
    </svg>
  );
}
function PauseIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <rect x={6} y={5} width={4} height={14} rx={1} />
      <rect x={14} y={5} width={4} height={14} rx={1} />
    </svg>
  );
}
function CogIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <circle cx={12} cy={12} r={3} />
      <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3h0a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5h0a1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8v0a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z" />
    </svg>
  );
}
function ScrumIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      {/* Three people in a huddle / presentation arc */}
      <path d="M4 19a8 8 0 0 1 16 0" strokeLinecap="round" />
      <circle cx={6} cy={10} r={2} />
      <circle cx={12} cy={8} r={2.4} />
      <circle cx={18} cy={10} r={2} />
    </svg>
  );
}
function ExternalLinkIcon() {
  return (
    <svg
      width={11}
      height={11}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      className="opacity-50"
    >
      <path
        d="M14 4h6v6M20 4l-9 9"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M19 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h5"
        strokeLinecap="round"
      />
    </svg>
  );
}
function LogoutIcon() {
  return (
    <svg
      width={16}
      height={16}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
    >
      <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4" />
      <path d="M10 17l-5-5 5-5M5 12h12" />
    </svg>
  );
}
