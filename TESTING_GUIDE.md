# MARINA — End-to-End Testing Guide

A complete, role-by-role QA checklist to run before selling MARINA to companies.
Work top to bottom. Each test has **Steps**, **Expected**, and a **☐** to tick.
Anything that fails → note the screen + what you saw, and we fix before launch.

> **Scope:** every route, every role, every feature, every integration, every
> agent, every background job. Budget ~3–4 focused hours for a full pass.

---

## 0. Setup & test accounts

### 0.1 Environment
- [x] Dev server running: `npm run dev` → open `http://localhost:3000`.
- [x] DB seeded with the 50-person demo org (just done). Org is **"Acme Demo Squad"**.
- [x] You can sign in instantly as any seeded user via **`/dev/login`** (dev only; it's `notFound()` in production).

### 0.2 Who to test as (seeded accounts)
| Login | Name | Role | Caps to verify |
|---|---|---|---|
| `tanish` | Tanish Garg | **Owner/admin** | everything |
| `maya` | Maya Iyengar | **Owner/admin** | everything (tests multi-owner) |
| `aisha` | Aisha Khan | **HR head** | full HR caps + `view_all_data` |
| `rahul` | Rahul Sharma | **Manager (Eng)** | `manage_integrations` + `export_data`, **not** billing |
| `vikram` | Vikram Joshi | **Manager (Finance)** | `manage_billing` only — must be denied members/integrations |
| `meghna` | Meghna Iyer | **Manager (Eng)** | `manage_members`; has direct reports |
| `harish` | Harish Menon | **Manager (Sales)** | `manage_members`; has direct reports |
| `fatima` | Fatima Ansari | **Manager (HR ops)** | `manage_members` + `decide_leaves` |
| `kavya` | Kavya Krishnamurthy | **Manager (Mktg)** | reports-only, **no** `manage_members` |
| `arjun`, `sneha`, `sid`, `mei` | … | **Member** | no extra caps |

- **3-level reports chain** to test scope: `tanish → aisha → sid → mei`.
- ~25 generated ICs (`aarav1`, `diya2`, …) across engineering/design/product/sales/support/marketing/ops/hr/finance.

### 0.3 Golden rule for RBAC tests
For every "manager can X" test, **also** sign in as a role that should NOT be able to X and confirm it's blocked (button hidden **and** the API returns 403). Leakage = the #1 launch risk.

---

## 1. Authentication & onboarding

### 1.1 Sign-up / sign-in methods
- [ ] **GitHub OAuth** — "Continue with GitHub" → authorize → lands on dashboard or onboarding.
- [x] **Google SSO** — "Continue with Google" → consent → lands correctly.
- [ ] **Magic link** — request link with an email → check inbox → click → signed in. Link is single-use (click again → rejected) and expires.
- [x] **Dev login** (`/dev/login`) — pick a user → instant session.
- [x] **Sign out** (sidebar footer ↩) → returns to landing, session cleared.

### 1.2 Onboarding a brand-new org
- [x] Sign in as a **fresh** account (new GitHub/Google with no membership) → redirected to `/onboarding`.
- [x] Create a workspace → you become **owner/admin** → land on the org dashboard.
- [x] First-visit nudge points you to add members.

### 1.3 Invites
- [x] As admin: **People → Members → Invite** (or `/org/{id}/setup/invite`). Set email, role, discipline, job title → send.
- [x] Pending invite appears in the list with expiry.
- [x] Open the invite link (`/invite/{token}`) in an incognito window → accept → new member joins with the assigned role/discipline.
- [x] **Invite email must match** — accepting with a different email is rejected.
- [x] Expired/*already-accepted* invite link → clean error, no crash.
- [x] Seat cap: if the plan limit is reached, accepting is blocked with a clear message.

### 1.4 Connect integrations to an existing account
- [ ] Email-signup user can later **Connect GitHub** (My settings / Integrations) without a "Configuration error".
- [ ] Google SSO user gets Calendar auto-linked; others can connect manually.

---

## 2. RBAC matrix (run as each role)

For each role, confirm the **sidebar only shows what they can reach** and **direct-URL access to forbidden pages redirects/403s**.

- [x] **Member** (`arjun`): hitting `/org/{id}` (any manager page) → redirected to `/dashboard`. They only get the personal console.
- [x] **Manager (kavya, reports-only)**: can view People/Activity but **cannot** invite/remove members (button hidden; `POST /api/orgs/{id}/members…` → 403).
- [x] **Manager scope (meghna/harish)**: People/Workload/Reports show **only their reports + teams they manage**, not the whole company.
- [ ] **HR (aisha)** with `view_all_data`: sees everyone.
- [ ] **Finance (vikram)**: can reach **Billing** but **not** Members or Integrations management.
- [x] **Owner (tanish/maya)**: everything, including workspace settings, billing, admin actions.
- [x] **Cross-org isolation**: a user in Acme cannot load another org's data by changing the `orgId` in the URL (→ 403/redirect).
- [x] **Self-action guard**: you cannot schedule a meeting with / nudge / route a blocker to **yourself**.

---

## 3. Dashboard (org `/org/{id}`)

- [x] KPI strip renders (members, focus %, shipped, open blockers) with real seeded numbers.
- [x] **Team member cards** are **equal height**, show name, role, productivity %, and **live activity** (✓ Shipped: … · timeAgo / current daily-state reason / "No recent activity logged today") — **not** a stale brief.
- [x] **Wellbeing nudge** banner appears for at-risk people (overwork / no leave taken / long blockers).
- [ ] **Leave-balance** card shows your remaining casual/sick/earned.
- [x] Cards open the **member detail modal** (see §11).
- [x] "Worth a look" / attention items surface correctly.
- [x] Data refreshes silently (visibility-aware polling) — no manual refresh button.

---

## 4. People

### 4.1 Members (`/org/{id}/members`)
- [x] Roster table lists all 50 with avatar, name, role, discipline, job title — **no horizontal overflow** at any width.
- [x] **Manager toolkit** card is here (top): "Open guide", "Print → PDF", "Open download page", "Copy share link" all work.
- [x] Invite form works (§1.3). Owner can **remove** a member; manager cannot.
- [x] Search/sort/scope behaves per role.

### 4.2 Attendance (`/org/{id}/attendance`)
- [x] Monthly calendar grid renders for the org.
- [x] Present / leave / WFH / holiday / **auto-absent** states are color-coded.
- [x] Switch months; pick a member; weekends/holidays respect `holidayRegion` (IN) and per-person **working days** (the 6-day and 4-day fillers should differ).

### 4.3 Work shifts (`/org/{id}/shifts`)
- [x] Shift list/timeline shows punched-in + last 5 days of completed shifts with summaries.
- [x] Hover a shift segment → rich hover card. Verification badge (verified/suspect) shows.

### 4.4 Teams & org chart (`/org/{id}/teams`)
- [x] 5 seeded teams listed with leads + members; create/edit/delete a team (as admin).
- [x] **Org chart** renders the full tree incl. the multi-owner roots and the `tanish → aisha → sid → mei` chain and new managers (meghna/harish/fatima) with their reports.
- [x] Pan/zoom; **Print / export SVG** produces a clean chart (no sidebar).
- [x] Per-team report link works (`/org/{id}/teams/{teamId}/report`).

---

## 5. Time off

### 5.1 Leave requests (`/org/{id}/leaves`)
- [x] Pending requests show (seeded: sneha, natasha, logan, dev). Sidebar badge count matches.
- [x] **Approve** / **Deny** (with note) → status updates; decision is **reversible**.
- [ ] Employee gets in-app + email notification of the decision.
- [ ] **One-click approve/deny** from the email link (`/leave-action/{token}`) → requires login + capability + scope; GET does not mutate; expired token rejected.
- [ ] History view shows the seeded approved/denied leaves.

### 5.2 Who's off (`/org/{id}/coverage`)
- [ ] Shows who is on leave and when; flags overlapping absences ("another teammate is also out").

### 5.3 Breaks (`/org/{id}/breaks`)
- [ ] "Paused now" shows current breaks (seeded: priya coffee, kavya meeting + the blocked ones).
- [ ] Categories render (blocked / focus / lunch / meeting / other). Recent breaks list works.

### 5.4 Attendance fixes (`/org/{id}/regularizations`)
- [ ] Employee submits a correction request (`/me/regularizations`): pick a day + requested state + note.
- [ ] Manager sees it here and **approves/denies** (`…/regularizations/{id}/decide`); attendance reflects the change.

---

## 6. Activity

### 6.1 Activity feed (`/org/{id}/activity`)
- [ ] Stream shows GitHub events **and** self-reported deliverables; auto-syncs on visit (no sync button).
- [ ] Seeded GitHub data excluded from "honest" counts where appropriate; sync errors surface if a token is bad.

### 6.2 Insights (`/org/{id}/insights`)
- [ ] Action-oriented cards: active blockers, velocity vs last week, shipped events 7d vs prior, unproductive-activity alerts.
- [ ] Works for **non-engineering** disciplines too (universal metrics, not just GitHub).

### 6.3 Workload (`/org/{id}/workload`)
- [ ] "Workload Balance" shows over/under-loaded people from signals (hours, output, blocked time, break days).
- [ ] Empty/edge states render ("Nobody to show").

---

## 7. Performance

### 7.1 Weekly reports (`/org/{id}/reports/weekly`)
- [ ] Header KPIs (members, avg focus, shipped, open blockers) + band tabs (Exceptional/Steady/Worth watching/Struggling).
- [ ] **"Worth checking in on" / "Worth celebrating"** callouts now render as **calm neutral cards** (dot + colored eyebrow), **not** a loud red/green fill.
- [ ] Per-person rows show score, hours, focus, shipped, blockers; "Report →" opens the performance PDF.
- [ ] **Performance PDF** (`/org/{id}/reports/performance?userId=…`) generates with a date range.

### 7.2 Reviews & 1:1s (`/org/{id}/reviews`)
- [ ] **"Open a review cycle"** card now has **proper padding** (not flush to edges). Create a cycle (name + start/end) → appears in Cycles; Open/Close/Delete work.
- [ ] Review-status table shows each member's **review-on-file** + **1:1 cadence** (overdue flag for no 1:1 in 45+ days).
- [ ] No padding/margin glitches on the page.

---

## 8. Blockers (`/org/{id}/blockers`)
- [ ] Active blockers list (seeded: arjun→rahul, sneha→kavya, natasha→external).
- [ ] **Blocker Resolver** opens only for `blocked`-category breaks (not for focus/lunch/meeting).
- [ ] Manager can **resolve** or **route to a different teammate**; the assignee is notified.
- [ ] Employee can resolve their **own** blocker.

---

## 9. Daily standup / Scrum mode (`/scrum/{id}`, opens new tab)
- [ ] Opens in a new tab; works for **any** team (not just engineering).
- [ ] Coverage state persists per org+day.
- [ ] Walk the standup flow end to end; confirm it reflects the seeded team.

---

## 10. Settings

### 10.1 Workspace (`/org/{id}/settings`)
- [ ] Edit org name, logo upload (**SVG is rejected**), holiday region, workday start/end (start<end enforced).
- [ ] **Leave policy** + **cost-per-hour (INR)** save (API-validated). Workforce cost shows in the digest.

### 10.2 Integrations (`/org/{id}/settings/integrations`)
- [ ] Reachable from sidebar **Settings → Integrations** (no top tab strip anywhere).
- [ ] GitHub: connect org, set tracked GitHub orgs allowlist. Slack + Calendar cards show status.

### 10.3 My settings (`/settings`)
- [ ] Reachable from sidebar **Settings → My settings** (and the page has **no top tab strip** — that was removed).
- [ ] **Pair a Mac** → Generate code → (with agent) pair within 10 min. Tracking Pause/Resume. Window-titles toggle. Connect Google Calendar. Profile photo upload / pixel character. Working days.

---

## 11. Member detail modal
Open from a dashboard/People card. Verify tabs:
- [ ] **Overview** — status, today's metrics, recent deliverable.
- [ ] **Attendance** — real monthly data.
- [ ] **Shifts** — segmented timeline + hover.
- [ ] **Activity** — day picker for breaks, app/GitHub activity.
- [ ] **Profile** — discipline, job title, reports-to, birthday/anniversary.
- [ ] **Schedule meeting** (§14) and **Nudge** actions present (not for yourself).

---

## 12. Personal console (employee `/dashboard`)
Sign in as a **member** (`arjun`):
- [ ] **Punch in / out** (or via agent); no double-punch race.
- [ ] **Take a break** with category + "waiting on" autocomplete; **mark blocked** routes to a teammate.
- [ ] **Log a deliverable** ("mark work as done") → appears in feed/insights.
- [ ] **Request leave** → shows pending → manager decision flows back.
- [ ] **"Your day"** live panel (not a stale story); compact, fits viewport.
- [ ] **My data** (`/me/data`) export and **My shots** (`/me/shots`) render.
- [ ] Notification bell shows decisions/meetings; popover sits above content.

---

## 13. AI features & agents (the USP)
- [ ] **AI Employee Chat** — ask grounded questions ("How is sneha doing this week?", "Who's blocked?") → answers cite real seeded data; refuses ungrounded claims. Sticky chat bar opens it.
- [ ] **Daily story engine** — punch out → a story/narrative is generated for the shift (budget-gated).
- [ ] **Shift verification** — summary vs commits/activity → verified/suspect score (seeded examples present).
- [ ] **Screenshot story analysis** — with the agent sending shots, the timeline shows what the person is working on.
- [ ] **1:1 prep brief** — generate for a report; concrete artifacts + hoverable timeline.
- [ ] **AI budget** — exhaust the org budget and confirm AI calls **fail closed** (no spend over cap; missing-org fails closed too).

---

## 14. Schedule meeting + conflict detection
- [ ] From a member card/modal → **Schedule meeting** → dialog opens (no blank screen).
- [ ] Pick a time that **clashes** with the attendee's calendar/MARINA meeting → amber **"⚠ {name} already has something then"** + **Schedule anyway**.
- [ ] Pick a free time → schedules; attendee gets in-app + email; if organiser has Google Calendar linked, a Meet link is added to both calendars.
- [ ] Without Google linked → still works (MARINA row + email is source of truth).

---

## 15. Integrations (deep)
### 15.1 GitHub
- [ ] Connect → sync pulls last 30 days via Search API; `lastSyncedAt` updates; events appear in Activity.
- [ ] Bad/expired token → visible sync error, not a silent failure.
- [ ] Org-level tracked-orgs allowlist filters events.

### 15.2 Google Calendar
- [ ] OAuth connect (session-bound, no dev-secret leakage); today's meetings panel shows events; disconnect works.
- [ ] Scheduled 1:1 pushes to Calendar with Meet link (see §14).

### 15.3 Slack
- [ ] `/marina pulse` → returns team pulse (authorized workspace only).
- [ ] `/marina nudge @user` → sends a nudge. Unauthorized workspace → rejected.

---

## 16. Desktop agent (Mac / Windows)
- [ ] **Download** from `/download`; **setup guide** at `/setup-guide` (print → PDF).
- [ ] **Pair** with a code from My settings (10-min expiry, single-use).
- [ ] Agent **punch in/out**, samples active app + idle (window titles only if enabled), uploads honored.
- [ ] **Break dialog** with waiting-on autocomplete; **mark self blocked** endpoint.
- [ ] Agent **deliverable** API dedupes; **desktop notifications** arrive (meeting, decision, nudge, stagnant-break ping).
- [ ] **Paired devices** list in My settings; revoke a device → its token stops working.
- [ ] Tracking **Pause** → agent stops sampling, server discards in-flight uploads.

---

## 17. Billing (Razorpay)
- [ ] Plans show; **early-access** program copy in place (pricing tabs commented out as intended).
- [ ] **Early-bird code** redemption (atomic claim — can't double-redeem).
- [ ] Subscription create → webhook is **idempotent** + **sub-bound**; plan→budget sync; seat cap enforced on accept.
- [ ] Plan **downgrade** handled in the sweep cron; **GST invoice** generates.
- [ ] Finance role (`vikram`) can manage billing; others cannot.

---

## 18. Notifications & email
- [ ] In-app bell: leave decision, meeting scheduled, nudge, blocker routed.
- [ ] Emails (check the mail sink / inbox): magic link, invite, **leave decision**, **meeting scheduled** (with Join/Calendar/MARINA buttons), **CEO weekly digest** (with workforce cost strip), **weekly digest**.
- [ ] Every notification path from the audit fires exactly once (no dupes).

---

## 19. Founder admin console
Sign in as an email in `MARINA_ADMIN_EMAILS` → open the admin console:
- [ ] Workspaces list + drill-down; health; feature flags; **AI cost** dashboard; **broadcast** an announcement (shows as the banner in-app); ops actions.
- [ ] Non-admin cannot reach it (403/redirect).

---

## 20. Background jobs (cron)
Trigger each cron endpoint with the **cron secret** (constant-time check; wrong/missing secret → 401):
- [ ] **Nightly story** batch (per-invocation budget respected).
- [ ] **Sweep** (stale magic links, pairing codes, audit retention, plan downgrades).
- [ ] **Weekly digest / CEO digest** send.
- [ ] Calendar/Story auto-trigger on punch-out.

---

## 21. Mobile & responsive
Resize to a phone width (or device mode):
- [ ] **Hamburger top bar appears**; tapping it slides in the sidebar drawer (full labels); backdrop + Esc close it.
- [ ] Sidebar **collapse-to-rail** is desktop-only (toggle « / »); rail shows icons + tooltips; **My settings** still reachable.
- [ ] Collapsing a group whose sub-page is active actually **collapses** (and stays).
- [ ] No horizontal page overflow; tables scroll inside their own container.
- [ ] Every RBAC surface is usable on mobile.

---

## 22. Security / leakage sweep (do this last, deliberately)
- [ ] **Scope**: as `meghna`, try to open `mei`'s detail or another team's report by URL → denied.
- [ ] **Cross-tenant**: change `orgId` in any `/org/{id}/…` URL to another org → denied.
- [ ] **Client-supplied IDs**: APIs validate membershipId/userId belong to the scope (no IDOR).
- [ ] **Uploads**: path traversal in `/api/uploads/[...key]` blocked; SVG org logo rejected; avatar size limit enforced.
- [ ] **Health** (`/api/health`) doesn't leak secrets; probe secret required for detail.
- [ ] **Account deletion** requires typing the exact username to confirm.
- [ ] **Prohibited as a tester**: confirm the app never asks *you* to do banking/credentials inside an iframe, etc. (sanity check of trust pages: `/security`, `/dpa`, `/privacy`, `/terms`).

---

## 23. Pre-launch sign-off
- [ ] All sections above pass.
- [ ] Rotate prod secrets: `AUTH_SECRET`, Google client secret (per-env); set `MARINA_ADMIN_EMAILS`, `HEALTH_PROBE_SECRET`.
- [ ] Deploy DB with **`npm run db:apply:prod`** (idempotent, additive) — **never** `db:push:prod`.
- [ ] Encrypt OAuth/Slack tokens at rest (deferred item — confirm before real customer data).
- [ ] Smoke-test the production URL with a fresh org + one invited teammate.

---

### Quick re-seed (if you want a clean slate again)
```bash
DEMO_RESET=1 npm run seed:demo     # wipes "Acme Demo Squad" and recreates 50 people
```
> The org **id changes** on every reset, and the old seeded users are deleted —
> re-login via `/dev/login` afterward. Change headcount via `TARGET_HEADCOUNT`
> in `scripts/seed-demo.ts`.
