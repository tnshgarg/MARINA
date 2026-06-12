# MARINA — Feature Inventory & Flow Audit

This document is the canonical map of every feature in MARINA, the surfaces it
appears on, the actions it exposes, and any inconsistencies we still need to
fix before shipping. It is grouped by **product area** rather than file, so
the same area may span the web app, the desktop agent, the Slack bot, and
email.

Each feature is graded:

| Status | Meaning |
|---|---|
| **GA** | Production-ready, no known gaps |
| **Polish** | Works end-to-end; needs visual/UX tightening |
| **Stub** | Schema and skeleton exist; not user-ready |
| **Fake** | UI exists but data isn't real yet (covered in FAKE-DATA-REPORT.md) |

---

## 1. Auth & Onboarding

### 1.1 Sign-up / Sign-in
- **Surfaces:** Landing hero, Landing Final CTA, `/auth/error`, `/dev/login`, `/invite/[id]`
- **Methods:** GitHub OAuth, Google OAuth (SSO), Email magic link, Credentials (dev only)
- **Status:** GA
- **Audit notes:**
  - ✅ Google added alongside GitHub on Hero and Final CTA (this pass).
  - ✅ Magic link rate-limited per IP + per email.
  - ⚠️ `/dev/login` link is currently shown on the landing page in any non-production NODE_ENV — fine for now but worth gating to a `MARINA_ENABLE_DEV_LOGIN` flag before public deploy.

### 1.2 Character pick (`/pick`)
- **Surfaces:** Post-signup wedge for first-time users
- **Status:** GA
- **Audit notes:** Consistent button styling (sage primary, neutral secondary). No inconsistencies.

### 1.3 Org onboarding (`/onboarding`)
- **Surfaces:** First-org creation page for users with no memberships
- **Status:** GA
- **Audit notes:** Single "Create workspace" primary CTA; copy is friendly.

### 1.4 Invite acceptance (`/invite/[id]`)
- **Surfaces:** Email invite landing, cookie-survives-OAuth flow
- **Status:** GA
- **Audit notes:** Asks for discipline + job title (Task #86).

---

## 2. Personal Dashboard (`/dashboard`)

### 2.1 Your Day card
- **Surfaces:** Top of dashboard, live-polling every 30s
- **Status:** GA (Task #116)
- **Audit notes:**
  - Three KPI tiles: productivity %, shipped today, meetings left.
  - Animated focus bar.
  - Replaces the prior static StoryCard.

### 2.2 Punch in / Punch out
- **Surfaces:** Dashboard primary CTA, desktop agent (Mac/Windows)
- **Status:** GA
- **Action verbs:** "Punch in" / "End shift" — ✅ consistent across web + agent.

### 2.3 Take a break / End break
- **Surfaces:** Dashboard secondary CTA, desktop agent
- **Status:** GA
- **Action verbs:** "Take a break" / "End break" — ✅ consistent.

### 2.4 Mark work as done (Deliverables)
- **Surfaces:** Dashboard "Log deliverable" card, desktop agent `/api/agent/deliverables`
- **Status:** GA (Task #89, Task #114)
- **Audit notes:**
  - Shared validation in `lib/deliverables/create.ts`.
  - 4-hour dedupe key, 10–200 char title, optional URL.
  - ✅ Same shape on web + agent.

### 2.5 Notification bell
- **Surfaces:** Top-right of every authenticated page
- **Status:** GA (z-300 to sit above modals).

### 2.6 Today's meetings
- **Surfaces:** Dashboard, desktop agent `/api/agent/meetings/today`
- **Status:** GA (Task #33, Task #118).

### 2.7 Deep dive (collapsible)
- **Surfaces:** Dashboard `<details>` element
- **Status:** GA (Task #117) — narrative + telemetry + GitHub events hidden by default.

---

## 3. Team Pulse (Org Dashboard) (`/org/[orgId]`)

### 3.1 Team member cards
- **Surfaces:** Org dashboard grid
- **Status:** GA (Task #5, Task #115)
- **Audit notes:**
  - Productivity pill (≥65% sage, 45-64% amber, <45% rose) — ✅ added.
  - Status filter chip strip with live counts — ✅ added.
  - Status badge consistent: 4 states (Working/Paused/Blocked/Off).

### 3.2 Blockers panel
- **Surfaces:** Org dashboard right rail
- **Status:** GA (Task #10, Task #106)
- **Action verbs:** "Nudge", "Resolve", "Route to teammate" — ✅ consistent.

### 3.3 Blocker Resolver modal
- **Surfaces:** Click any blocker → Modal
- **Status:** GA (Task #106, #109, #110)
- **Primary action:** "Unblock teammate" (sage)
- **Secondary actions:** "Nudge", "Suggest fix", "Route to teammate" (neutral)

### 3.4 Member detail modal
- **Surfaces:** Click any team member card → Modal with 5 tabs
- **Status:** GA (Task #24, #61, #75, #107)
- **Tabs:** Overview · Attendance · Shifts · Activity · Profile

### 3.5 Celebrations widget
- **Surfaces:** Org dashboard
- **Status:** GA (Task #90, #105)

### 3.6 Worth-a-look card
- **Surfaces:** Org dashboard
- **Status:** GA (Task #31, #48)

---

## 4. People & Roster Management

### 4.1 Members page
- **Surfaces:** `/org/[orgId]/people`
- **Status:** GA
- **Actions:** Invite, Edit role, Edit discipline, Edit capabilities, Remove

### 4.2 Invites
- **Surfaces:** Members page → "Invite teammate" button → Modal
- **Status:** GA (Task #86)
- **Fields:** Email, role, discipline, job title

### 4.3 Capabilities (granular RBAC)
- **Surfaces:** Edit member modal
- **Status:** GA (Task #94, #99)
- **Capabilities:** `manage_billing`, `manage_members`, `manage_integrations`, `manage_workspace`, `view_all_data`, `view_reports_only`, `decide_leaves`, `schedule_meetings`, `manage_celebrations`, `export_data`

### 4.4 Working days per employee
- **Surfaces:** Edit member modal
- **Status:** GA (Task #92)

### 4.5 Reports-to chain
- **Surfaces:** Edit member modal → "Reports to" select
- **Status:** GA

---

## 5. Time Tracking

### 5.1 Shifts
- **Surfaces:** Dashboard, Member modal Shifts tab, `/org/[orgId]/punch-outs`
- **Status:** GA
- **Actions:** Punch in, Punch out, Edit shift summary (Task #44)

### 5.2 Breaks (4 categories)
- **Surfaces:** Dashboard, agent break.html, Member modal Activity tab
- **Status:** GA (Task #8, Task #14)
- **Categories:** Coffee, Lunch, Personal, Blocked

### 5.3 Leaves
- **Surfaces:** `/org/[orgId]/leaves`, employee dashboard, notification email
- **Status:** GA
- **Actions:** Request, Approve, Reject, Reverse (Task #25)

### 5.4 Holidays
- **Surfaces:** Settings, Attendance calendar
- **Status:** GA

### 5.5 Attendance calendar
- **Surfaces:** Member modal Attendance tab
- **Status:** GA (Task #26, #64)

---

## 6. Activity & Insights

### 6.1 Activity Feed
- **Surfaces:** `/org/[orgId]/activity`
- **Status:** GA (Task #102)
- **Audit notes:** Includes deliverables, breaks, shifts, GitHub events, meetings.

### 6.2 Insights
- **Surfaces:** `/org/[orgId]/insights`
- **Status:** GA (Task #12, #91)
- **Cards:** universal-first (deliverables, focus %, meetings, blockers).

### 6.3 GitHub events stream
- **Surfaces:** Dashboard deep dive, Activity Feed, Member modal Activity tab
- **Status:** GA (Task #1, #30, #36)

### 6.4 Screen activity timeline
- **Surfaces:** Member modal Activity tab — story-driven timeline
- **Status:** GA (Task #96, #97)

---

## 7. Scrum Mode (`/scrum`)

### 7.1 Live standup driver
- **Surfaces:** Standalone projection-friendly page
- **Status:** GA (Task #29, #74, #78)
- **Audit notes:**
  - Arrow keys to navigate, Space to mark covered.
  - Per-person card with yesterday/today/blocker prompts.
  - Coverage persisted per org+day (Task #32).

---

## 8. Meetings

### 8.1 Google Calendar sync
- **Surfaces:** Settings → Integrations, Meetings panel everywhere
- **Status:** GA (Task #33)

### 8.2 Schedule a 1:1
- **Surfaces:** Member modal → "Schedule 1:1" button
- **Status:** GA (Task #93)

---

## 9. AI Briefs

### 9.1 Daily story per teammate
- **Surfaces:** Member modal Overview tab, narrative emails
- **Status:** GA (Task #34, #38)

### 9.2 CEO Weekly Digest
- **Surfaces:** Monday morning email
- **Status:** GA (Task #52)

### 9.3 Manager 1-on-1 Prep Brief
- **Surfaces:** Friday email + on-demand fetch
- **Status:** GA (Task #54)

---

## 10. Settings

### 10.1 Profile
- **Surfaces:** `/settings/profile`
- **Status:** GA
- **Fields:** Birthday, Joined on, Discipline, Job title

### 10.2 Org settings
- **Surfaces:** `/settings/org` (manage_workspace cap)
- **Status:** GA
- **Fields:** Tracked GitHub orgs (Task #84), name, holidays

### 10.3 Devices (agent pairing)
- **Surfaces:** `/settings/devices`
- **Status:** GA

### 10.4 Notifications preferences
- **Surfaces:** `/settings/notifications`
- **Status:** GA (Task #43, #112)

### 10.5 Account / Export
- **Surfaces:** `/settings/account`
- **Status:** GA
- **Actions:** Export data, Delete account

---

## 11. Integrations (`/settings/integrations`)

| Integration | Connect flow | Status |
|---|---|---|
| GitHub | OAuth | GA (Task #95, #103) |
| Google Calendar | OAuth | GA (Task #33) |
| Slack | OAuth + slash commands | GA (Task #57) |
| GitLab | Stub | Stub |
| Linear | Stub | Stub |
| Jira | Stub | Stub |
| Figma | Stub | Stub |
| Notion | Stub | Stub |
| HubSpot | Stub | Stub |

Modular cards (Task #85) — stubs show "Coming soon" pill, not a broken connect button. ✅

---

## 12. Billing (`/settings/billing`)

- **Plans:** Free (≤5), Team (₹499), Scale (₹899)
- **Provider:** Razorpay subscription + GST invoice
- **Status:** GA skeleton (Task #39, #58)
- **Audit notes:**
  - Trial countdown chip on dashboard.
  - HMAC webhook verification.
  - 🟡 **Pending:** Early Bird Code redemption (Task #122).

---

## 13. Desktop Agent (Mac + Windows)

- **Auth:** Pairing code → bearer token (`lib/agent/auth.ts`)
- **Endpoints used:** `/api/agent/{heartbeat,day,meetings/today,deliverables,breaks,shifts,leaves,notifications,team,events,pair,pause,screenshots}`
- **Status:** GA — full feature parity (Task #118, #119)
- **Spec:** `AGENT-API.md` with menubar layout + hotkey table.

---

## 14. Slack Bot

- **Slash commands:** `/marina pulse`, `/marina nudge`
- **Status:** GA skeleton (Task #57)

---

## 15. Landing Page (`/`)

- **Sections:** Hero, Logos strip, ValueProps, ProductSection, Workflows, Testimonials, Integrations, Pricing, ResourceCards, FinalCTA, Footer
- **Status:** GA — premium pass complete (Task #51, #62, #72)
- **Audit notes:**
  - 🟡 **Pending:** Build 4 more mockup components (Blocker Resolver, Scrum Mode, Member Detail, Activity Feed) — Task #121
  - ✅ HeroPreview (Team Pulse) and BriefPreview (Daily Story) exist.
  - ✅ Google sign-in added alongside GitHub (this pass).

---

## Cross-cutting consistency rules

These are the conventions we lint against by eye until we automate them.

### Button styling
- **Primary CTA:** `bg-[var(--m-ink)] text-white` (dark sage-ink) — used for "Punch in", "Mark done", "Create workspace", "Save".
- **Secondary CTA:** `border border-[var(--m-border)] bg-white text-[var(--m-ink)]` — used for "Cancel", "Nudge", "Suggest fix".
- **Destructive:** `bg-rose-600 text-white` — used for "Remove member", "Delete account".
- **Sage accent:** `bg-[var(--m-accent)] text-white` — used for in-tile actions like "Resolve blocker".

### Action verb conventions
| Surface | Verb |
|---|---|
| Time tracking | "Punch in" / "End shift" (NOT "Start" / "Stop") |
| Breaks | "Take a break" / "End break" |
| Deliverables | "Mark done" (web), "Log deliverable" (button label) |
| Blockers | "Nudge" / "Unblock teammate" / "Route to teammate" |
| Leaves | "Request leave" / "Approve" / "Decline" (NOT "Reject") |
| Meetings | "Schedule 1:1" / "Join" |
| Members | "Invite teammate" / "Remove" |

### Status taxonomy (4 states only)
Working · Paused · Blocked · Off — locked in Task #19. No other strings allowed.

### Modal primitive
All modals inherit `components/modal.tsx` at `z-200`. Notification bell sits at `z-300`. Toasts at `z-400`.

### Polling cadence
- Heartbeat: 30s
- Day snapshot: 60s
- Meetings: on-open
- Notifications: 30s

### Empty state
Every list view has an illustrated empty state with a clear next-action button.

---

## Known gaps still pending

These map to live tasks:

- **#121** Build 4 more landing mockup components
- **#122** Early Bird Code redemption system
- **#124** Tutorial hints for complex features (Blocker Resolver, Scrum Mode, Capabilities)
- **#125** HR onboarding guide as PDF/Markdown
- **#126** Fake data + incomplete flow audit (final sweep)

See `FAKE-DATA-REPORT.md` (generated by Task #126) for the explicit list of mock data and half-built flows.
