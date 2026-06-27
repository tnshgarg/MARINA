"use client";

import { useCallback, useSyncExternalStore } from "react";
import { usePathname } from "next/navigation";
import { CharacterAvatar } from "@/components/character-avatar";
import { MarinaMark } from "@/components/marina-mark";
import { NavLink } from "@/components/nav-link";
import { NotificationBell } from "@/components/notification-bell";
import { OrgSwitcher, type SwitcherOrg } from "@/components/org-switcher";

// A leaf is a single navigable destination. It can live at the top level
// (a "single link" group) or nested inside an expandable group.
type NavLeaf = {
  key: string;
  label: string;
  matches: RegExp;
  href: (orgId: number) => string;
  icon: React.ReactNode;
  openInNewTab?: boolean;
  /** When set, render this sub-item's pending-count badge from the prop. */
  badge?: "pendingLeaves";
  /** Hide this item unless the viewer holds this capability. */
  requiredCap?: string;
};

// A group is either a single link (no `children`) rendered as a plain
// nav-item, or an expandable section header that toggles its `children`.
type NavGroup = {
  key: string;
  label: string;
  icon: React.ReactNode;
  /** Single-link groups carry their own destination here. */
  href?: (orgId: number) => string;
  matches?: RegExp;
  openInNewTab?: boolean;
  /** Expandable groups carry their sub-items here. */
  children?: NavLeaf[];
  /** Hide this whole group unless the viewer holds this capability. */
  requiredCap?: string;
};

const dot = <NavDot />;

// The five features that ARE the product, pinned to the very top of the sidebar
// so a manager/HR never has to hunt for them: the daily standup, the team, live
// work statuses, blockers, and reports. Each is a single, unmissable link.
// "Work statuses" is the team home (/org/{id}) — the live board of who's
// working / heads-down / blocked right now.
const PRIORITY_NAV: NavGroup[] = [
  {
    key: "statuses",
    label: "Work statuses",
    icon: <PulseIcon />,
    matches: /^\/org\/\d+$/,
    href: (o) => `/org/${o}`,
  },
  {
    key: "scrum",
    label: "Daily standup",
    icon: <ScrumIcon />,
    matches: /^\/scrum\/\d+(\/|$)/,
    href: (o) => `/scrum/${o}`,
  },
  {
    key: "teams",
    label: "Teams",
    icon: <PeopleIcon />,
    matches: /^\/org\/\d+\/teams(\/|$)/,
    href: (o) => `/org/${o}/teams`,
  },
  {
    key: "blockers",
    label: "Blockers",
    icon: <BlockerIcon />,
    matches: /^\/org\/\d+\/blockers(\/|$)/,
    href: (o) => `/org/${o}/blockers`,
  },
  {
    key: "reports",
    label: "Reports",
    icon: <ReportIcon />,
    matches: /^\/org\/\d+\/reports(\/|$)/,
    href: (o) => `/org/${o}/reports/weekly`,
    // Org-wide reports — HR/owners only. Plain managers use Reviews below.
    requiredCap: "view_all_data",
  },
];

// Everything else — collapsed below a divider so the focus stays up top. The
// user scrolls here when they need the occasional tool.
const SECONDARY_NAV: NavGroup[] = [
  {
    key: "people",
    label: "People",
    icon: <PeopleIcon />,
    children: [
      {
        key: "members",
        label: "Members",
        matches: /^\/org\/\d+\/members(\/|$)/,
        href: (o) => `/org/${o}/members`,
        icon: dot,
      },
      {
        key: "attendance",
        label: "Attendance",
        matches: /^\/org\/\d+\/attendance(\/|$)/,
        href: (o) => `/org/${o}/attendance`,
        icon: dot,
      },
      {
        key: "shifts",
        label: "Work shifts",
        matches: /^\/org\/\d+\/shifts(\/|$)/,
        href: (o) => `/org/${o}/shifts`,
        icon: dot,
      },
    ],
  },
  {
    key: "timeoff",
    label: "Time off",
    icon: <LeafIcon />,
    children: [
      {
        key: "leaves",
        label: "Leave requests",
        matches: /^\/org\/\d+\/leaves(\/|$)/,
        href: (o) => `/org/${o}/leaves`,
        icon: dot,
        badge: "pendingLeaves",
      },
      {
        key: "coverage",
        label: "Who's off",
        matches: /^\/org\/\d+\/coverage(\/|$)/,
        href: (o) => `/org/${o}/coverage`,
        icon: dot,
      },
      {
        key: "breaks",
        label: "Breaks",
        matches: /^\/org\/\d+\/breaks(\/|$)/,
        href: (o) => `/org/${o}/breaks`,
        icon: dot,
      },
      {
        key: "regularizations",
        label: "Attendance fixes",
        matches: /^\/org\/\d+\/regularizations(\/|$)/,
        href: (o) => `/org/${o}/regularizations`,
        icon: dot,
      },
    ],
  },
  {
    key: "activity",
    label: "Activity",
    icon: <FeedIcon />,
    children: [
      {
        key: "feed",
        label: "Activity feed",
        matches: /^\/org\/\d+\/activity(\/|$)/,
        href: (o) => `/org/${o}/activity`,
        icon: dot,
      },
      {
        key: "insights",
        label: "Insights",
        matches: /^\/org\/\d+\/insights(\/|$)/,
        href: (o) => `/org/${o}/insights`,
        icon: dot,
      },
      {
        key: "workload",
        label: "Workload",
        matches: /^\/org\/\d+\/workload(\/|$)/,
        href: (o) => `/org/${o}/workload`,
        icon: dot,
      },
    ],
  },
  {
    key: "culture",
    label: "Culture",
    icon: <SparkIcon />,
    children: [
      {
        key: "recognitions",
        label: "Recognition",
        matches: /^\/org\/\d+\/recognitions(\/|$)/,
        href: (o) => `/org/${o}/recognitions`,
        icon: dot,
      },
      {
        key: "announcements",
        label: "Announcements",
        matches: /^\/org\/\d+\/announcements(\/|$)/,
        href: (o) => `/org/${o}/announcements`,
        icon: dot,
      },
    ],
  },
  {
    key: "performance",
    label: "Performance",
    icon: <StarIcon />,
    children: [
      {
        key: "reviews",
        label: "Reviews & 1:1s",
        matches: /^\/org\/\d+\/reviews(\/|$)/,
        href: (o) => `/org/${o}/reviews`,
        icon: dot,
      },
    ],
  },
  {
    key: "help",
    label: "Help & docs",
    icon: <HelpIcon />,
    matches: /^\/help(\/|$)/,
    href: () => `/help`,
    openInNewTab: true,
  },
  // Settings — link target depends on whether the viewer can manage the
  // workspace. Plain members + managers without workspace caps land on
  // their PERSONAL /settings (agent pairing, profile) so they don't bounce.
  // Owners + managers with manage_workspace get an EXPANDABLE Settings group
  // (Workspace + Integrations) — see SETTINGS_CHILDREN, wired in the component.
  {
    key: "settings",
    label: "Settings",
    icon: <CogIcon />,
    matches: /^(?:\/settings|\/org\/\d+\/settings)(\/|$)/,
    href: (o) => `/org/${o}/settings`, // overridden per-viewer below
  },
];

// Sub-items revealed under Settings for workspace managers. Integrations is no
// longer here — connections live inline on the dashboard now.
const SETTINGS_CHILDREN: NavLeaf[] = [
  {
    key: "workspace",
    label: "Workspace",
    matches: /^\/org\/\d+\/settings\/?$/,
    href: (o) => `/org/${o}/settings`,
    icon: dot,
    requiredCap: "manage_workspace",
  },
  {
    // The viewer's PERSONAL settings — pair the MARINA desktop agent, profile,
    // working days, etc. Distinct from "Workspace" (the org-wide settings).
    // Members + non-workspace managers reach this via the single Settings link;
    // workspace managers would otherwise lose it, so it lives here too.
    key: "my-settings",
    label: "My settings",
    matches: /^\/settings(\/|$)/,
    href: () => `/settings`,
    icon: dot,
  },
];

const STORAGE_KEY = "marina:nav:open";

/** A child leaf is active when its own route matches. */
function leafActive(leaf: NavLeaf, pathname: string): boolean {
  return leaf.matches.test(pathname);
}

/** A group is active when it (single link) or any of its children matches. */
function groupActive(group: NavGroup, pathname: string): boolean {
  if (group.children) {
    return group.children.some((c) => leafActive(c, pathname));
  }
  return group.matches ? group.matches.test(pathname) : false;
}

/* ----------------------------------------------------------------------------
 * Persisted group open/closed store.
 *
 * We keep this in an external store (read via useSyncExternalStore) rather than
 * useState + effects for two reasons:
 *   1. No setState-in-effect (keeps the React Compiler hooks lint clean).
 *   2. SSR-safe: getServerSnapshot returns a stable empty value so the server
 *      and first client paint agree — React then re-reads localStorage on the
 *      client without a hydration mismatch warning.
 *
 * The store maps groupKey → explicit open(true)/closed(false). A group the
 * user has never toggled is ABSENT, and defaults to open-if-it-owns-the-active-
 * route. Storing the absolute state (not just "force open") is what lets the
 * user COLLAPSE a group even while one of its sub-pages is active.
 * -------------------------------------------------------------------------- */

const EMPTY_OPEN: ReadonlyMap<string, boolean> = new Map();

// Cache the parsed snapshot so getSnapshot returns a stable reference between
// renders (useSyncExternalStore requires referential stability or it loops).
let openCache: { raw: string | null; value: ReadonlyMap<string, boolean> } = {
  raw: null,
  value: EMPTY_OPEN,
};

function readOpenPrefs(): ReadonlyMap<string, boolean> {
  if (typeof window === "undefined") return EMPTY_OPEN;
  let raw: string | null = null;
  try {
    raw = window.localStorage.getItem(STORAGE_KEY);
  } catch {
    return EMPTY_OPEN;
  }
  if (raw === openCache.raw) return openCache.value;
  let value: ReadonlyMap<string, boolean> = EMPTY_OPEN;
  if (raw) {
    try {
      const parsed: unknown = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        // Legacy format: array of "open" keys → treat each as explicitly open.
        value = new Map(
          parsed
            .filter((k): k is string => typeof k === "string")
            .map((k) => [k, true]),
        );
      } else if (parsed && typeof parsed === "object") {
        const m = new Map<string, boolean>();
        for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
          if (typeof v === "boolean") m.set(k, v);
        }
        value = m;
      }
    } catch {
      value = EMPTY_OPEN;
    }
  }
  openCache = { raw, value };
  return value;
}

const openListeners = new Set<() => void>();

function subscribeOpenPrefs(cb: () => void): () => void {
  openListeners.add(cb);
  // Reflect changes made in other tabs.
  const onStorage = (e: StorageEvent) => {
    if (e.key === STORAGE_KEY) cb();
  };
  if (typeof window !== "undefined") {
    window.addEventListener("storage", onStorage);
  }
  return () => {
    openListeners.delete(cb);
    if (typeof window !== "undefined") {
      window.removeEventListener("storage", onStorage);
    }
  };
}

function writeOpenPrefs(next: ReadonlyMap<string, boolean>): void {
  try {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify(Object.fromEntries(next)),
    );
  } catch {
    // Storage may be unavailable (private mode) — fall through and still notify
    // so the in-memory snapshot updates this session.
  }
  // Invalidate cache so the next getSnapshot re-reads the new value.
  openCache = { raw: null, value: EMPTY_OPEN };
  for (const cb of openListeners) cb();
}

/* ----------------------------------------------------------------------------
 * Collapse-to-rail store. A single persisted boolean: when true (desktop only)
 * the sidebar shrinks to a slim icon rail so the user gets the full screen for
 * content. Booleans are value-compared, so getSnapshot can read storage
 * directly without the referential-stability dance the Set store needs.
 * -------------------------------------------------------------------------- */
const RAIL_KEY = "marina:nav:rail";
const railListeners = new Set<() => void>();

function readRail(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(RAIL_KEY) === "1";
  } catch {
    return false;
  }
}
function subscribeRail(cb: () => void): () => void {
  railListeners.add(cb);
  const onStorage = (e: StorageEvent) => {
    if (e.key === RAIL_KEY) cb();
  };
  if (typeof window !== "undefined") {
    window.addEventListener("storage", onStorage);
  }
  return () => {
    railListeners.delete(cb);
    if (typeof window !== "undefined") {
      window.removeEventListener("storage", onStorage);
    }
  };
}
function writeRail(next: boolean): void {
  try {
    window.localStorage.setItem(RAIL_KEY, next ? "1" : "0");
  } catch {
    // ignore — still notify in-memory subscribers below
  }
  for (const cb of railListeners) cb();
}

/* ----------------------------------------------------------------------------
 * Desktop-vs-mobile store. The rail only makes sense on desktop; on a phone the
 * sidebar is a full-width slide-in drawer. We read the same 900px breakpoint
 * the CSS uses so JS and CSS never disagree. SSR-safe: getServerSnapshot
 * returns false (treat as mobile) so the server emits the full nav, then the
 * client reconciles on mount — no hydration mismatch (this is exactly what
 * useSyncExternalStore is for).
 * -------------------------------------------------------------------------- */
const DESKTOP_QUERY = "(min-width: 901px)";

function subscribeDesktop(cb: () => void): () => void {
  if (typeof window === "undefined" || !window.matchMedia) return () => {};
  const mq = window.matchMedia(DESKTOP_QUERY);
  mq.addEventListener("change", cb);
  return () => mq.removeEventListener("change", cb);
}
function readDesktop(): boolean {
  if (typeof window === "undefined" || !window.matchMedia) return false;
  return window.matchMedia(DESKTOP_QUERY).matches;
}

/** The group's "primary" destination — its first child's page. Used as the
 *  link target for the whole group when the sidebar is collapsed to a rail. */
function primaryHref(g: NavGroup, orgId: number): string {
  if (g.href) return g.href(orgId);
  const first = g.children?.[0];
  return first ? first.href(orgId) : "#";
}

/** Does this group own a sub-item that carries the pending-leaves badge? Lets
 *  the rail show a single attention dot on the group icon when expanded sub-
 *  item badges aren't visible. */
function groupHasPendingBadge(g: NavGroup): boolean {
  return (g.children ?? []).some((c) => c.badge === "pendingLeaves");
}

export function OrgSidebar({
  orgId,
  orgName,
  orgLogoUrl,
  userLogin,
  userName,
  characterKey,
  userAvatarUrl,
  role,
  caps = [],
  orgs = [],
  teams = [],
  pendingLeaveCount = 0,
  signOutAction,
}: {
  orgId: number;
  /** The viewer's resolved capability keys — drives which nav items show. */
  caps?: string[];
  /** Every workspace this user belongs to — powers the org switcher. */
  orgs?: SwitcherOrg[];
  /** Every team in this workspace — listed under "Teams" for quick access. */
  teams?: Array<{ id: number; name: string; color: string | null }>;
  orgName: string;
  orgLogoUrl?: string | null;
  userLogin: string;
  /** Real display name from the users row. Falls back to @login. */
  userName?: string | null;
  /** Kept on the signature so existing callers don't break; unused now. */
  characterKey?: string | null;
  userAvatarUrl?: string | null;
  role: string;
  pendingLeaveCount?: number;
  signOutAction: () => Promise<void> | void;
}) {
  void characterKey; // intentionally unused — character roster retired
  const pathname = usePathname() ?? "";

  // Show only what the viewer can actually use. Good UX (and less confusion):
  // never surface a nav item that would just bounce them off a permission gate.
  const can = useCallback((c?: string) => !c || caps.includes(c), [caps]);
  const hasOrgSettings = caps.includes("manage_workspace");

  // Build the per-viewer nav:
  //  - Settings becomes an expandable group (Workspace? / Integrations? / My
  //    settings) when the viewer can manage workspace or integrations; the
  //    sub-items themselves are filtered by capability. Otherwise it's a single
  //    link to their personal /settings.
  //  - Every other group's children are filtered by capability; a group left
  //    with no visible children (or a capped single link they lack) is dropped.
  const buildNav = useCallback(
    (groups: NavGroup[]): NavGroup[] =>
      groups.flatMap((g): NavGroup[] => {
        if (g.key === "settings") {
          if (!hasOrgSettings) return [g];
          return [
            { ...g, href: undefined, children: SETTINGS_CHILDREN.filter((c) => can(c.requiredCap)) },
          ];
        }
        if (!g.children) {
          return can(g.requiredCap) ? [g] : [];
        }
        const children = g.children.filter((c) => can(c.requiredCap));
        return children.length > 0 ? [{ ...g, children }] : [];
      }),
    [can, hasOrgSettings],
  );
  const priorityNav = buildNav(PRIORITY_NAV);
  const secondaryNav = buildNav(SECONDARY_NAV);

  // The user's pinned-open groups, persisted in localStorage. SSR-safe via a
  // stable empty server snapshot (no hydration mismatch).
  const openPrefs = useSyncExternalStore(
    subscribeOpenPrefs,
    readOpenPrefs,
    () => EMPTY_OPEN,
  );

  // Expanded state: an explicit saved preference wins; otherwise default to
  // open when the group owns the active route. Because the saved value is the
  // ABSOLUTE state (not just "force open"), the user can collapse a group even
  // while one of its sub-pages is active — clicking writes `false` and it stays
  // closed until they reopen it.
  const isExpanded = useCallback(
    (g: NavGroup): boolean => {
      const pref = openPrefs.get(g.key);
      return pref !== undefined ? pref : groupActive(g, pathname);
    },
    [openPrefs, pathname],
  );

  // Toggle persists the absolute next state, so it always flips what's on screen.
  const toggleGroup = useCallback(
    (g: NavGroup) => {
      const next = new Map(openPrefs);
      next.set(g.key, !isExpanded(g));
      writeOpenPrefs(next);
    },
    [openPrefs, isExpanded],
  );

  // Settings: viewers without any org-settings capability get a single link to
  // their personal /settings (the group form is reserved for those who can
  // actually open Workspace/Integrations).
  const resolveHref = useCallback(
    (g: NavGroup): string => {
      if (g.key === "settings" && !hasOrgSettings) return "/settings";
      return g.href ? g.href(orgId) : "#";
    },
    [hasOrgSettings, orgId],
  );

  // Collapse-to-rail. `railed` is the user's saved preference; it only takes
  // effect on desktop (`isDesktop`) — on a phone the sidebar is a full drawer,
  // so a rail would be meaningless. `rail` is the effective state we render by.
  const railed = useSyncExternalStore(subscribeRail, readRail, () => false);
  const isDesktop = useSyncExternalStore(
    subscribeDesktop,
    readDesktop,
    () => false,
  );
  const rail = railed && isDesktop;
  const toggleRail = useCallback(() => writeRail(!railed), [railed]);

  // One renderer, reused for the priority and secondary nav sections.
  const renderGroup = useCallback(
    (g: NavGroup) => {
      // Single-link group (no children): render a plain nav-item.
      if (!g.children) {
        const isActive = g.matches ? g.matches.test(pathname) : false;
        const isExternal = g.openInNewTab === true;
        const href = resolveHref(g);
        return (
          <NavLink
            key={g.key}
            href={href}
            prefetch={!isExternal}
            target={isExternal ? "_blank" : undefined}
            rel={isExternal ? "noopener noreferrer" : undefined}
            title={rail ? g.label : undefined}
            className={`nav-item ${isActive ? "nav-item-active" : ""}`}
          >
            <span className="nav-icon">{g.icon}</span>
            <span className="nav-label flex-1 min-w-0 truncate">{g.label}</span>
            {isExternal && !rail && <ExternalLinkIcon />}
          </NavLink>
        );
      }

      // Collapsed rail: the whole group becomes a single link to its primary
      // page (no room to expand sub-items). A dot flags pending leave requests.
      if (rail) {
        const isActive = groupActive(g, pathname);
        const showDot = groupHasPendingBadge(g) && pendingLeaveCount > 0;
        return (
          <NavLink
            key={g.key}
            href={primaryHref(g, orgId)}
            prefetch
            title={g.label}
            className={`nav-item ${isActive ? "nav-item-active" : ""}`}
          >
            <span className="nav-icon relative">
              {g.icon}
              {showDot && <span className="nav-rail-dot" aria-hidden />}
            </span>
            <span className="nav-label flex-1 min-w-0 truncate">{g.label}</span>
          </NavLink>
        );
      }

      // Expandable group: clickable header + collapsible children.
      const expanded = isExpanded(g);
      const isActive = groupActive(g, pathname);
      const childListId = `nav-group-${g.key}`;
      return (
        <div key={g.key}>
          <button
            type="button"
            onClick={() => toggleGroup(g)}
            aria-expanded={expanded}
            aria-controls={childListId}
            className={`nav-item text-left ${
              isActive && !expanded ? "nav-item-active" : ""
            }`}
          >
            <span className="nav-icon">{g.icon}</span>
            <span className="nav-label flex-1 min-w-0 truncate">{g.label}</span>
            <Chevron expanded={expanded} />
          </button>

          {expanded && (
            <div id={childListId} className="mb-1">
              {g.children.map((c) => {
                const childActive = leafActive(c, pathname);
                const badge =
                  c.badge === "pendingLeaves" && pendingLeaveCount > 0
                    ? pendingLeaveCount
                    : null;
                return (
                  <NavLink
                    key={c.key}
                    href={c.href(orgId)}
                    prefetch
                    className={`nav-item !pl-9 text-[13.5px] ${
                      childActive ? "nav-item-active" : ""
                    }`}
                  >
                    <span className="nav-icon !w-3.5 !h-3.5 opacity-50">{c.icon}</span>
                    <span className="nav-label flex-1 min-w-0 truncate">{c.label}</span>
                    {badge !== null && (
                      <span className="shrink-0 text-[11px] font-medium px-1.5 rounded bg-[var(--m-accent-soft)] text-[var(--m-accent-2)] tabular">
                        {badge}
                      </span>
                    )}
                  </NavLink>
                );
              })}
            </div>
          )}
        </div>
      );
    },
    [rail, pathname, isExpanded, toggleGroup, resolveHref, orgId, pendingLeaveCount],
  );

  return (
    <aside className={`app-sidebar${rail ? " is-rail" : ""}`}>
      {/* Pinned header */}
      <div className="shrink-0">
        <div className="nav-brand-row px-5 pt-5 pb-2 flex items-center gap-2">
          <NavLink
            href={`/org/${orgId}`}
            prefetch
            title={rail ? "MARINA — dashboard" : undefined}
            className="flex items-center gap-2.5 group min-w-0 flex-1"
          >
            <LogoMark />
            <div className="nav-brand-text min-w-0">
              <p className="font-semibold text-[15px] tracking-tight text-[var(--m-ink)] group-hover:text-[var(--m-accent)] transition-colors">
                MARINA
              </p>
            </div>
          </NavLink>
          {/* Desktop-only collapse toggle. Hidden on mobile (the sidebar is a
              full drawer there). Persists across reloads. */}
          <button
            type="button"
            onClick={toggleRail}
            className="nav-collapse-btn shrink-0 w-7 h-7 inline-flex items-center justify-center rounded-md text-[var(--m-ink-4)] hover:text-[var(--m-ink-2)] hover:bg-[var(--m-bg-soft)] transition"
            title={rail ? "Expand sidebar" : "Collapse sidebar"}
            aria-label={rail ? "Expand sidebar" : "Collapse sidebar"}
            aria-pressed={rail}
          >
            <RailToggleIcon rail={rail} />
          </button>
        </div>

        {/* Workspace card — becomes an org switcher when the user belongs to
            more than one workspace. */}
        <OrgSwitcher
          currentOrgId={orgId}
          orgName={orgName}
          orgLogoUrl={orgLogoUrl}
          orgs={orgs}
        />

      </div>

      {/* Scrollable nav */}
      <nav className="app-sidebar-scroll mt-1">
        {/* The five features that ARE the product — pinned at the top. */}
        {priorityNav.map((g) => (
          <div key={g.key}>
            {renderGroup(g)}
            {/* All teams, listed right under "Teams" for quick access. Hidden
                in the rail (no room for a list). */}
            {g.key === "teams" && !rail && teams.length > 0 && (
              <div className="mb-1">
                {teams.map((t) => {
                  const href = `/org/${orgId}/teams/${t.id}`;
                  return (
                    <NavLink
                      key={t.id}
                      href={href}
                      prefetch
                      className="nav-item !pl-9 text-[13px]"
                      title={t.name}
                    >
                      <span
                        className="shrink-0 w-2 h-2 rounded-full"
                        style={{ background: t.color || "var(--m-accent)" }}
                        aria-hidden
                      />
                      <span className="nav-label flex-1 min-w-0 truncate">{t.name}</span>
                    </NavLink>
                  );
                })}
              </div>
            )}
          </div>
        ))}

        {/* Divider between the focus features and everything else. */}
        <div className={rail ? "my-2 mx-3 border-t border-[var(--m-border-soft)]" : "my-2.5 mx-5 border-t border-[var(--m-border-soft)]"} aria-hidden />

        {secondaryNav.map((g) => renderGroup(g))}
      </nav>

      {/* Pinned footer — always visible regardless of scroll. We constrain
          every item's vertical footprint so the row stays a tidy 44px even
          when the name has a tall display font or the bell adds an unread
          dot. `flex-nowrap` keeps it on one line; `shrink-0` on the buttons
          guarantees they don't get cropped when the name is very long. */}
      <div className="nav-footer shrink-0 px-4 pb-4 pt-3 border-t border-[var(--m-border-soft)] bg-white">
        {/* Prominent context switch back to the viewer's OWN dashboard. A
            manager/HR is an employee too: the org "Dashboard" up top is the
            TEAM view, this is their PERSONAL one (punch in/out, breaks, leave,
            morning brief). It used to hide as the avatar's subtext and nobody
            found it — now it's an explicit, labelled control. Collapses to an
            icon when the sidebar is railed. */}
        <NavLink
          href="/dashboard"
          prefetch
          title="My dashboard — your personal view"
          aria-label="My dashboard — your personal view"
          className={`flex items-center rounded-lg border border-[var(--m-accent)]/30 bg-[var(--m-accent-soft)] text-[var(--m-accent-2)] hover:bg-[var(--m-accent)] hover:text-white transition-colors mb-2.5 ${
            rail ? "justify-center w-11 h-11 mx-auto" : "gap-2.5 px-2.5 py-2"
          }`}
        >
          <span
            className={`shrink-0 inline-flex items-center justify-center ${
              rail ? "" : "w-7 h-7 rounded-md bg-white/70 border border-[var(--m-border)]"
            }`}
          >
            <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden>
              <circle cx={12} cy={8} r={3.5} />
              <path d="M5.5 20a6.5 6.5 0 0 1 13 0" strokeLinecap="round" />
            </svg>
          </span>
          {!rail && (
            <>
              <span className="min-w-0 flex-1 leading-tight">
                <span className="block text-[13px] font-semibold">My dashboard</span>
                <span className="block text-[11px] opacity-70">Your personal view</span>
              </span>
              <svg width={15} height={15} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden className="shrink-0 opacity-80">
                <path d="M5 12h14M13 6l6 6-6 6" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </>
          )}
        </NavLink>

        <div className="nav-footer-row flex items-center gap-2 flex-nowrap min-h-[44px]">
          {/* Identity → personal dashboard as well (clicking yourself goes to
              your stuff). The labelled "My dashboard" button above is the
              discoverable affordance; this stays as the account chip. */}
          <NavLink
            href="/dashboard"
            prefetch
            title="Go to your personal dashboard"
            className="flex items-center gap-2 min-w-0 flex-1 rounded-md -mx-1 px-1 py-1 hover:bg-[var(--m-bg-soft)] transition"
          >
            <CharacterAvatar
              name={userName ?? userLogin}
              imageUrl={userAvatarUrl}
              size={32}
            />
            <div className="nav-footer-name min-w-0 flex-1 leading-tight">
              <p className="text-[12.5px] font-medium text-[var(--m-ink)] truncate leading-tight">
                {userName ?? `@${userLogin}`}
              </p>
              <p className="text-[11px] text-[var(--m-ink-3)] truncate leading-tight">
                {userName ? `@${userLogin}` : "Signed in"}
              </p>
            </div>
          </NavLink>
          <div className="nav-footer-actions shrink-0 flex items-center gap-1">
            <NotificationBell />
            <form action={signOutAction}>
              <button
                type="submit"
                className="w-8 h-8 inline-flex items-center justify-center rounded-md text-[var(--m-ink-3)] hover:text-rose-600 hover:bg-rose-50 transition"
                title="Sign out"
                aria-label="Sign out"
              >
                <LogoutIcon />
              </button>
            </form>
          </div>
        </div>
      </div>
    </aside>
  );
}

/* ---------- Icons (inline) ---------- */

// Small bullet used to mark sub-items inside an expanded group. Kept low-key
// so the group header (with its real icon) stays the visual anchor.
function NavDot() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <circle cx={12} cy={12} r={3.25} />
    </svg>
  );
}
// Disclosure chevron for expandable group headers. Rotates 90° when open.
function Chevron({ expanded }: { expanded: boolean }) {
  return (
    <svg
      width={14}
      height={14}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      className={`shrink-0 opacity-50 transition-transform duration-150 ${
        expanded ? "rotate-90" : ""
      }`}
      aria-hidden
    >
      <path d="M9 6l6 6-6 6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// Collapse/expand affordance for the desktop sidebar. Points left (« — "push
// the panel away") when expanded; right (» — "bring it back") when railed.
function RailToggleIcon({ rail }: { rail: boolean }) {
  return (
    <svg
      width={16}
      height={16}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      aria-hidden
      className={rail ? "rotate-180" : ""}
    >
      <path d="M14 7l-5 5 5 5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M19 7l-5 5 5 5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function LogoMark() {
  // Marina's "M" monogram mark IS the brand — same mark in the sidebar, the
  // morning brief, the tour, the onboarding and the favicon, so the product
  // reads as one identity everywhere. Decorative here (the "MARINA" wordmark
  // sits right beside it).
  return <MarinaMark size={26} className="shrink-0" label="" />;
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
function BlockerIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <circle cx={12} cy={12} r={9} />
      <path d="M5 5l14 14" strokeLinecap="round" />
    </svg>
  );
}
function ReportIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <path d="M4 20V6a2 2 0 0 1 2-2h9l5 5v11a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2z" />
      <path d="M14 4v6h6" strokeLinejoin="round" />
      <path d="M8 14l2.5 2.5L15 12" strokeLinecap="round" strokeLinejoin="round" />
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
function CogIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <circle cx={12} cy={12} r={3} />
      <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3h0a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5h0a1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8v0a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z" />
    </svg>
  );
}
function SparkIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <path d="M12 3l1.8 4.6L18 9l-4.2 1.4L12 15l-1.8-4.6L6 9l4.2-1.4L12 3Z" strokeLinejoin="round" />
      <path d="M18 14l.7 2L21 16.7l-2.3.7L18 20l-.7-2.3L15 16.7l2.3-.7L18 14Z" strokeLinejoin="round" />
    </svg>
  );
}
function HelpIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <circle cx={12} cy={12} r={9} />
      <path d="M9.5 9a2.5 2.5 0 1 1 3.5 2.3c-.8.4-1 .9-1 1.7" strokeLinecap="round" />
      <circle cx={12} cy={16.5} r={0.6} fill="currentColor" stroke="none" />
    </svg>
  );
}
function StarIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <path
        d="M12 3.5l2.6 5.27 5.82.85-4.21 4.1.99 5.78L12 16.77l-5.2 2.73.99-5.78-4.21-4.1 5.82-.85L12 3.5Z"
        strokeLinejoin="round"
      />
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
