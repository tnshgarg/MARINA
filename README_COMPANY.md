# MARINA — Company / Manager Feature Reference

This document lists **every feature on the company side of Marina** — the product an
organisation's managers, team leads, and HR use to run a remote team. It is the
manager/org counterpart to the individual-employee product.

> **What Marina is (company side):** an AI "chief of staff" for managers and HR.
> It turns the team's real activity (GitHub, calendar, punch-ins, self-reported
> work) into a live picture of who's working, who's blocked, who's off, and who
> needs attention — with leave approvals, attendance, standups, performance
> reviews, recognition, and a Slack app, all in one place. Managers open one
> calm dashboard instead of chasing status across five tools.

Entry point for companies: the **`/company`** marketing page → sign up → **create
an organisation** (org onboarding) → the org workspace lives at **`/org/<id>`**.

---

## 1. Roles & permissions

Every sensitive action is gated by a **capability**, not just a role, so a
specific manager can be granted extra powers without being made an admin.

**Base roles**
- **Admin / Owner** — holds **all** capabilities implicitly.
- **Manager** — `manage_members`, `view_reports_only`, `decide_leaves`, `schedule_meetings`, `export_data`.
- **Lead** — `view_reports_only`, `schedule_meetings` (lightweight manager).
- **Member** — no org powers; sees only their own data (lands on their personal dashboard).

**Capabilities** (assignable individually as "extra caps")
- `manage_billing` — change plan, view invoices, manage payment.
- `manage_members` — invite, remove, edit role/discipline/title.
- `manage_integrations` — configure Slack / GitHub / Calendar.
- `manage_workspace` — org name, logo, holidays, workday hours, leave policy.
- `view_all_data` — HR-grade: see **every** employee's drilldown (overrides normal scoping).
- `view_reports_only` — see direct + indirect reports and members of teams you manage.
- `decide_leaves` — approve / deny leave requests.
- `schedule_meetings` — create 1:1s on other people's calendars.
- `manage_celebrations` — edit other people's birthdays / joining dates.
- `export_data` — export reports (CSV / PDF) of attendance, shifts, etc.

**Visibility scoping** — Admins (and anyone with `view_all_data`) see the whole
org. Managers/leads see only themselves, their reporting chain, and the members
of teams they manage. Scoping is enforced server-side on every page, so the nav
only ever shows what a viewer can actually use.

---

## 2. The sidebar (company navigation)

The left sidebar is the spine of the manager experience. Groups are ordered for a
manager's daily flow and each item is capability-filtered.

- **Dashboard** — the team pulse + AI morning brief (`/org/<id>`).
- **People**
  - **Members** — roster, invites, roles.
  - **Attendance** — monthly attendance calendar.
  - **Work shifts** — recent punch-in/out work sessions.
  - **Teams & org chart** — teams and the visual reporting chart.
- **Time off**
  - **Leave requests** — approve / deny (shows a pending-count badge).
  - **Who's off** — coverage / absence calendar with overlap warnings.
  - **Breaks** — live and recent pauses.
  - **Attendance fixes** — attendance regularization requests.
- **Activity**
  - **Activity feed** — merged GitHub + deliverables stream.
  - **Insights** — "what needs me today" signals.
  - **Workload** — overload / capacity balance.
- **Culture**
  - **Recognition** — kudos.
  - **Announcements** — org-wide posts.
- **Performance**
  - **Weekly reports** — org-wide weekly performance (HR/owner only — needs `view_all_data`).
  - **Reviews & 1:1s** — review cycles + 1:1 cadence.
- **Blockers** — the blocker queue / resolver.
- **Daily standup** — full-screen Scrum Mode (`/scrum/<id>`, opens in a new tab).
- **Help & docs** — the help centre.
- **Settings** — for workspace managers this expands to **Workspace**, **Integrations**, and **My settings**; everyone else gets a single link to their personal settings.

**Also in the sidebar**
- **Connected-integration pins** — small Arc-style icon buttons for the integrations actually connected (GitHub / Calendar / Slack), each opening that integration's hub.
- **Org switcher** — switch between workspaces you belong to.
- **Notification bell** — unread badge + recent notifications.
- **"My dashboard"** — jump to your **personal** employee view (managers are employees too: punch in/out, breaks, leave, morning brief).
- **Collapse-to-rail** toggle + per-group expand/collapse (persisted).

---

## 3. Dashboard — the team command centre (`/org/<id>`)

A live, at-a-glance view of the whole (visible) team.

- **Marina's morning brief** — a personalised, one-line greeting + the single most
  important thing to do today (e.g. "2 teammates are waiting on you; 6 of 8 shipping
  — clear the blockers first"), signed "Marina, your chief of staff." Deterministic
  (built from real numbers, no hallucination).
- **Team snapshot KPI tiles** — org productivity (active-vs-idle %), how many are
  actively shipping, how many need follow-up, who's on leave, who's blocked, who's
  waiting on review.
- **Active blockers panel** — who's stuck, on what, who they're waiting on, and for
  how long; click to resolve.
- **Team-at-a-glance member cards** — one card per report showing: status
  (Working / Paused / Blocked / Off), live presence (active / idle / locked) and top
  app, AI daily state (High / Steady / Blocked / Disengaged), latest self-written
  narrative, most recent shipped deliverable, any ongoing break (reason + who they're
  waiting on), and current shift. Click → the **Member detail** modal.
- **Side widgets** — pending leaves (quick approve), recent breaks feed, upcoming
  meetings, and upcoming celebrations (birthdays / work anniversaries).
- **Ask Marina dock** — a floating assistant to ask grounded questions about the team.
- **Dashboard tour** — a first-run walkthrough for new managers.

---

## 4. People

### Members (`/org/<id>/members`)
- **Invite teammates** — by email with a **role** (member / manager / admin), a
  **discipline** (engineering, design, product, sales, support, marketing, ops, HR,
  finance, exec, other), and a job title. Generates a shareable invite link; gated on
  `manage_members`.
- **Roster** — searchable list with name, email, role, discipline badge, job title.
- **Manage** — edit role/discipline/title; **remove** a member (owners); **view
  performance report** (with `view_all_data`) via a date-picker → PDF.
- **Pending invites** — resend, copy link, or delete.
- **Setup guide card** — desktop-agent download + the onboarding handout, right where you invite people.

### Attendance (`/org/<id>/attendance`)
- **Monthly calendar** per employee, colour-coded: Present, Absent, Leave, Holiday,
  Weekend, Pre-join, Future.
- **Month + member pickers**; click any day to see the reason (shift times / leave / holiday).
- Built from shifts + approved leaves + the org's holiday calendar. Scoped to your reports.

### Work shifts (`/org/<id>/shifts`)
- **Recent punch-in/out sessions** with a range filter (Today / 7d / 30d / All).
- Each row: who, punch-in, punch-out (or "ongoing"), and an **AI work summary** of what
  they did. When the optional screenshot feature is on, a verification badge + score.
- Grouped by day; scoped to your reports.

### Teams & org chart (`/org/<id>/teams`)
- **Teams** — create teams with a name, description, colour, and a team manager/lead;
  see member counts; open a **team report**.
- **Org chart** — interactive, draggable reporting chart with reports-to edges,
  **multi-manager** support, edit mode (rearrange, reassign managers, edit role/title),
  and **export** to image/PDF.
- **Team report** (`/org/<id>/teams/<teamId>/report`) — per-team summary for any date
  range: total hours, deliverables, GitHub events (commits/PRs/reviews/issues), blockers
  opened/resolved, leave days, a per-member breakdown, and a recent-deliverables feed.

---

## 5. Time off

### Leave requests (`/org/<id>/leaves`)
- **Approval queue** of all time-off requests (scoped to your reports): requester,
  date range + day count, reason, status (pending / approved / denied), decision note.
- **Approve / Deny** with an optional note; rescind a decision. A sidebar badge shows
  the pending count. Leave types and annual allowances come from the org leave policy.
- Decisions notify the employee (in-app / email / Slack). Leave emails carry **one-click,
  signed approve/deny links** so managers can act without logging in.

### Who's off / coverage (`/org/<id>/coverage`)
- **Forward-looking absence view** grouped by week.
- Summary pills: "X people out" and "Y overlap days," with **overlap warnings** when
  2+ people are off on the same day (coverage-gap alerts). Each card shows the person,
  leave type, dates, day count, and status.

### Breaks (`/org/<id>/breaks`)
- **Paused now** — live list of people on break: category (focus / meeting / blocked /
  lunch / errand / personal / other), reason, how long, and a **check-in** action to end it.
- **Recent breaks** — last ~72 hours with durations and reasons. Scoped to your reports.

### Attendance fixes / regularization (`/org/<id>/regularizations`)
- **Correction queue** — when an employee disputes a wrongly-marked day: the day, what
  they claim (present / WFH / half-day…), their note, and status. **Approve / Deny** with
  a note; approving updates the attendance record. Scoped to your reports.

---

## 6. Activity

### Activity feed (`/org/<id>/activity`)
- **One merged stream** of the team's GitHub events (commit / PR opened / review / issue
  closed, each linked) and self-reported **deliverables** ("shipped"), newest first,
  last 30 days.
- **Auto-syncs** GitHub in the background (~10 min when stale); shows a sync indicator,
  surfaces any sync errors, and notes teammates who haven't linked GitHub yet.

### Insights (`/org/<id>/insights`)
- A "what should I do today" board of contextual cards: **active blockers**,
  **velocity vs last week** (up/down movers), **stale PRs** (open >24h with no review),
  **long-day alert** (still working after a 9h+ shift), **out next 7 days**, and **quiet
  engineers** (no GitHub activity in 3 days). Engineering-specific cards hide for
  non-engineering teams.

### Workload (`/org/<id>/workload`)
- **Load balance** per person with a risk badge (OK / Watch / High), an hours bar
  relative to the busiest teammate, and the team average. Helps spot overload and spare
  capacity. Computed from hours logged, open blockers, and pending leaves.

---

## 7. Culture

### Recognition / kudos (`/org/<id>/recognitions`)
- **Give recognition** to a teammate with a message; it posts to the team Slack channel
  and notifies the recipient. A scrollable **recognition feed** shows who recognised whom.
  Everyone can give and see kudos.

### Announcements (`/org/<id>/announcements`)
- **Post org-wide announcements** (title + body); broadcasts to the team Slack channel and
  every member's inbox. A chronological feed of past announcements. Composing is manager+.

---

## 8. Performance

### Weekly reports (`/org/<id>/reports/weekly`) — HR/owner only (`view_all_data`)
- **Org-wide weekly performance snapshot**: date range, top and bottom performers, a
  per-member ranking with a composite score and trajectory vs the prior week, and
  team-wide totals. Printable to PDF.

### Individual performance report (`/org/<id>/reports/performance`) — `view_all_data`
- A **printable one-page review** for a single employee over any date range: executive
  summary, work output (commits/PRs/deliverables with links), health indicators
  (productivity %, focus %, blockers, attendance), recent activity, risks, and
  recommendations. A4 / "Save as PDF" optimised. Reachable from the Members page.

### Reviews & 1:1s (`/org/<id>/reviews`)
- **Review cycles** — create/open/close cycles with a period; see, per member, whether
  they've been reviewed in the window.
- **1:1 cadence tracking** — last 1:1 date and "days since," with a flag when it's gone
  stale (e.g. >45 days).
- **Schedule a 1:1** — book a meeting on a teammate's Google Calendar (needs
  `schedule_meetings`), with a Meet link and invite.

---

## 9. Blockers (`/org/<id>/blockers`)
- **Active blockers** — who's stuck, the reason, who/what they're waiting on, and how
  long, with a **Resolve** action.
- **Blocker resolver** — context cards + suggested next steps / resolution types and a
  resolution note.
- **Recently resolved** — last 7 days, with how long each blocker was active. Scoped to your reports.

---

## 10. Daily standup — Scrum Mode (`/scrum/<id>`)
- A **full-screen, projector-friendly** standup helper (no chrome), one brief per person.
- Pick a teammate (arrow-key navigation through the roster). Each brief shows **yesterday's
  work** (AI narrative / recent deliverables), **active blockers**, **recent context**
  (last commits/PRs, top app, last shift), and **today's calendar**.
- Designed to run a 25-minute standup in ~9. Scoped to your reports.

---

## 11. Member detail modal
Opened from any dashboard card — a deep dive on one person across four tabs:
- **Today** — an AI **daily story** (an hourly timeline of what they did: meetings,
  coding, breaks, idle), today's shift breakdown (work / break / idle / locked minutes +
  AI summary), and today's meetings (with a **Schedule 1:1** button).
- **Output** — recent deliverables and full GitHub activity: last-7-day output, PR status
  breakdown (open / in-review / merged / closed / draft), reviews **given** and
  **received** with verdicts, commit titles, blocked work, and meeting load.
- **Time** — attendance calendar, shift list, breaks by category, and hours-this-week.
- **About** — profile (name, email, birthday, joined-on), discipline / job title / role,
  reporting line and teams, paired **devices** (with revoke), GitHub link status, granted
  **capabilities** (owner-editable), and any flagged **risks**.

---

## 12. AI & intelligence layer
- **Morning brief** — the deterministic one-liner on the dashboard (see §3).
- **Ask Marina** — a grounded assistant (dashboard dock + Slack DM) that answers questions
  about team health, blockers, workload, and individuals from real data.
- **Daily state** — a per-person daily classification (High / Steady / Blocked /
  Disengaged …) with output count and focus-work ratio, built nightly.
- **Daily story / narrative** — an AI summary of each person's day/yesterday, used on the
  dashboard, in standups, and in reviews.
- **Work summaries** — a one-line AI description of what each shift accomplished.
- **Blocker resolver** — context-aware unblock suggestions.
- All grounded in the org's own data; the morning brief makes no model call (instant, free).

---

## 13. Integrations
Configured under **Settings → Integrations** (`manage_integrations`); each has a detail hub
linked from the sidebar pins.

### GitHub (the **GitHub App**)
- Install the Marina GitHub App on the org and **select which repos** to share (public +
  private). Marina reads **commit and PR metadata** (never code) and attributes it to the
  teammate who authored it.
- **Sync now** / **manage repos / reinstall**; sync results show repos pulled and new/updated
  commits, PRs, and reviews, and flag unlinked authors.
- Teammates link their own GitHub (identity only) so their activity is attributed; a badge
  shows "N of M linked."

### Google Calendar
- **Per-person** connection (each teammate connects their own). Brings meetings into the
  daily brief, flags meeting overload, and uses busy time to derive focus blocks. Also
  powers 1:1 scheduling (events + Meet links).

### Slack (full bot)
- Install the Marina Slack app and pick a **default channel**. Enables the App Home, slash
  commands, DMs, and channel posts (see §14). A legacy incoming-webhook path exists for
  notifications-only and prompts an upgrade to the full bot.

### Request more
- An "other integrations" section lists tools on the roadmap (Figma, Linear, Jira, HubSpot,
  Salesforce, Zendesk, Notion, Asana, ClickUp) with a request link.

---

## 14. The Slack app
Run much of Marina without leaving Slack.

- **App Home tab** — a personal brief (clock status, blockers, shipped today) plus, for
  managers, a team pulse (on shift, blocked, top blockers), with context-aware action
  buttons (Punch in/out, Log work, Give kudos, Request leave, Raise/resolve blocker).
- **Slash commands** (`/marina …`):
  - `help` — list commands.
  - `status` / `me` — your day at a glance.
  - `in` / `out` — punch in / out (out opens a work-summary modal).
  - `done <title>` — log a deliverable.
  - `blocker <reason>` / `blockers` — flag yourself blocked / (managers) list active blockers.
  - `off [reason]` / `back` — start / end a break.
  - `leave` — open the leave-request modal.
  - `standup` — open a standup modal pre-filled from your daily state.
  - `kudos` — recognise a teammate.
  - `announce <message>` — post to the whole team (managers).
  - `pulse` — today's team snapshot (managers).
  - `nudge @user <message>` — send a logged DM (shows in both sides' activity).
- **Modals** — leave request, punch-out summary, standup, kudos, raise/resolve blocker.
- **Ask Marina in DMs** — conversational, grounded answers.
- **Posted to channels** — the morning brief (weekday mornings), birthday & anniversary
  celebrations, and standup reminders (a kickoff line to the scrum channel + DMs to people
  who haven't filed yet, each with a "Do my standup" button).
- **Leave-decision links** — one-click, signed approve/deny in notifications.

---

## 15. Automations (scheduled jobs)
Times are UTC (≈ +5:30 for IST).

- **Nightly sweep** (02:00) — housekeeping (e.g. purge expired screenshots, close stale shifts).
- **Calendar sync** (03:30) — pull everyone's Google Calendar and reconcile attendance.
- **Daily states** (18:30) — build each person's daily state (focus / activity metrics).
- **Daily stories** (19:00) — build each person's narrative of the day.
- **Weekly digest** (Mon 02:30) — email the owner a weekly CEO digest (skipped for tiny orgs).
- **Daily digest** (14:30) — a daily email digest.
- **Slack morning brief** (Mon–Fri 02:30) — post the team brief to the Slack channel.
- **Celebrations** (03:00) — post birthdays / work anniversaries to Slack.
- **Standup reminder** (Mon–Fri 04:00) — DM people who haven't filed a standup + kick off the scrum channel.

---

## 16. Notifications
- **In-app bell** — unread badge + recent items, polled live.
- **Events** — leave requested / decided, break started, punched out, suspicious shift,
  marked blocked, deliverable logged, standup submitted, recognition given, birthday /
  anniversary, and manager nudges.
- **Channels** — in-app bell (all events), email (leave requests/decisions, digests),
  Slack (brief, celebrations, standup reminders, decisions, nudges), and desktop.

---

## 17. Onboarding & workspace setup
- **Create the org** — "spin up an HQ" with a name; a short guided welcome tour explains
  the core features.
- **Invite teammates** — a one-time setup with pre-filled rows (email + role + discipline + title).
- **Configure** (during setup or later in Settings): org name & **logo** (SVG/PNG/WebP/JPEG,
  up to 3 MB), **holiday region** (e.g. India national + state holidays), **leave policy**
  (casual / sick / earned allowances), **workday hours**, **avatar style** (pixel hero vs
  GitHub photo), and **connect Slack/GitHub/Calendar**.
- **Plan & billing** — current plan (Free / Team / Scale) + trial status; early-access
  promo-code redemption. (Paid tiers are gated during the early-access phase.)

---

## 18. The desktop agent (optional)
A lightweight macOS/Windows menu-bar/tray app that feeds the manager dashboard with
real presence — entirely consent-based.

- **Collects** (every ~30s, uploaded in ~5-min batches): the **active app name** and an
  **active / idle / locked** state. The **window title** is opt-in (off by default).
- **Never** collects file contents, keystrokes, or mouse position, and collects **nothing
  while paused**.
- **Disclosed screenshots** are an **optional, off-by-default** capability (behind a feature
  flag): when enabled they're a few per hour at random times, with a visible flash, and are
  auto-skipped during video calls — used only for shift verification.
- **Pairing** via a short single-use code from the employee's settings; tokens are
  encrypted on-device; devices can be revoked instantly. The dashboard then shows presence,
  focus blocks, and (if enabled) verification.

---

## 19. Managers are employees too
Every manager also has the full **personal** employee product (via "My dashboard"): punch
in/out, breaks, leave, their own morning brief, auto-generated status report, booking link,
and Ask Marina — so they manage the team and prove their own day in the same product.

---

*Generated as a feature inventory of Marina's company/manager surface. Section
order roughly follows the sidebar.*
