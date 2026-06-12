# MARINA — Production Readiness Review

A walk-through of every user flow as a critical reviewer would. Each section
lists what works, what's broken, what's missing, and the priority of the gap.

Legend: **P0** ship-blocker · **P1** important · **P2** polish · ✅ verified

---

## 1. Authentication & onboarding

- ✅ Magic link sign-in (`/api/auth/magic/start` → email link → callback)
- ✅ GitHub OAuth sign-in (NextAuth `/api/auth/signin/github`)
- ✅ Google SSO (`/api/auth/signin/google`)
- ✅ Invite acceptance (`/invite/[token]`) — carries discipline & job title onto membership
- ✅ Character picker forces `/pick` before reaching the dashboard
- ✅ Onboarding flow lets a first-time user create their own org

**Known gaps**
- **P1** — `/dev/login` is gated behind `NODE_ENV !== 'production'` at the link layer but the route itself doesn't re-check. Add a server-side gate.
- **P2** — Magic link email copy is generic. Could be branded to the org name when used via invite.

---

## 2. Personal dashboard (`/dashboard`)

- ✅ Active break banner (with formatted elapsed time)
- ✅ Today's AI story card
- ✅ "New — mark work as done" hint banner
- ✅ Log-deliverable card (universal output)
- ✅ Today telemetry summary
- ✅ Work Narrative generator (Groq / OpenAI provider toggle)
- ✅ Recent activity feed (GitHub)
- ✅ Meetings panel (today)
- ✅ Quick actions: Sync, Take a break, Request leave
- ✅ Leave-request management (cancel pending)
- ✅ Recent breaks list
- ✅ 7-day stats

**Known gaps**
- **P1** — Designers/sales who don't have GitHub will see the "Recent activity" section permanently empty. Should hide unless GitHub is linked.
- **P2** — "Today telemetry" only shows when the Mac agent has been paired. Empty state could link to settings.

---

## 3. Org dashboard (`/org/[orgId]`)

- ✅ Greeting + snapshot stats (blocked / shipping / on leave)
- ✅ "Worth a look" review cards (with Resolve button for blockers)
- ✅ Active blockers panel (with Resolve button)
- ✅ Team Member cards with status + right-now line
- ✅ Search
- ✅ Meetings panel
- ✅ **NEW** Celebrations widget (with empty state)
- ✅ Pending leave panel
- ✅ Recent breaks panel
- ✅ Member detail modal (Today / Output / Time / About)
- ✅ **NEW** Blocker Resolver modal

**Known gaps**
- **P1** — "Awaiting review" counter at top includes GitHub PRs but the underlying list isn't surfaced as a clickable filter. Could route to /activity?type=pr_reviewed.
- **P2** — Blocker resolver doesn't yet show "average time to unblock" historic metric — schema is in place, surfaces TBD.

---

## 4. People page (`/org/[orgId]/members`)

- ✅ Member list table (with discipline + job title columns)
- ✅ Invite form (asks for role + discipline + optional job title)
- ✅ Pending invites with revoke
- ✅ Remove member (owner-only, soft delete)

**Known gaps**
- **P2** — Bulk-invite (CSV) flow exists in the API plan but no UI yet.
- **P2** — Edit discipline inline in the table; today it requires opening the modal Profile tab.

---

## 5. Shifts page (`/org/[orgId]/shifts`)

- ✅ Daily punch-in/out records, filterable by date
- ✅ AI-verified work summary chips

**Known gaps**
- **P2** — No CSV export. Stub exists in `export_data` capability.

---

## 6. Attendance page (`/org/[orgId]/attendance`)

- ✅ Monthly calendar per employee
- ✅ Auto-absent on weekdays without a shift

**Known gaps**
- **P1** — The page doesn't yet use the per-employee `workingDays` bitmap (only the modal Attendance section does). A 6-day worker shows Saturday as "absent" instead of "weekend" on this page.
- **P2** — No half-day attendance modelling.

---

## 7. Activity Feed (`/org/[orgId]/activity`)

- ✅ Merged feed of GitHub events + self-reported deliverables
- ✅ Time-sorted, per-item user attribution

**Known gaps**
- **P2** — Feed type filter chips (commits / PRs / deliverables) would help.

---

## 8. Insights (`/org/[orgId]/insights`)

- ✅ Active blockers card
- ✅ Velocity vs last week (engineering-only)
- ✅ Stale PRs (engineering-only)
- ✅ Long-day alert
- ✅ Out next 7 days
- ✅ Quiet engineers (engineering-only)

**Known gaps**
- **P1** — There's no universal "unusual signal" card. Non-engineering teams see only 3 cards: blockers, long-days, out-next-7. Need a "low deliverable velocity" card based on the deliverables table.

---

## 9. Settings (`/org/[orgId]/settings`)

- ✅ Workspace name
- ✅ Slack webhook
- ✅ Public holiday calendar (India regions)
- ✅ Avatar mode (hero vs photo)
- ✅ Workday hours

**Known gaps**
- **P2** — Holiday calendar UI to edit individual holidays. Today they're regenerated from the static IN holiday set on region change.

---

## 10. Integrations (`/org/[orgId]/settings/integrations`)

- ✅ GitHub card (per-user link, org allowlist editor) — actually works end-to-end
- ✅ Google Calendar card (per-user link, count of linked teammates) — works
- ✅ Slack card (org-level webhook, linked to Workspace settings) — works
- ✅ "Request an integration" CTA replacing dummy "Coming Soon" cards

**Known gaps**
- **P1** — On a fresh DB, clicking "Link my GitHub" hits the NextAuth Configuration error page if `pnpm db:push` hasn't been run. Error page tells the user to run db:push — good. But this requires manual intervention.

---

## 11. Scrum Mode (`/scrum/[orgId]`)

- ✅ Projection view with keyboard navigation
- ✅ Per-person panel with discipline-aware talking points
- ✅ Coverage tracking (persisted per org+day)

**Known gaps**
- **P1** — Coverage doesn't auto-reset at midnight. If you run scrum at 9am today, your covered list persists into tomorrow. Add a `coveredOn` date check in the GET endpoint.
- **P2** — No "skip" action to defer someone to the end of the queue.

---

## 12. Member detail modal — **NEW** tabs

- ✅ Today: 1:1 prep, story, today's meetings, latest brief
- ✅ Output: universal signal, 7-day trend, deliverables, screen mix, app usage, GitHub (eng only)
- ✅ Time: attendance strip, shift list with story-driven activity list, breaks day picker
- ✅ About: role + discipline editor, working-days, people-care dates, capabilities (owner-only)

**Known gaps**
- **P2** — `useState('today')` doesn't persist across modal closes. Could use URL params.

---

## 13. Blocker Resolver — **NEW**

- ✅ Triage tab: Nudge, Suggest alternative, Mark resolved with type
- ✅ Thread tab: full audit log of every nudge/suggestion/note/resolution
- ✅ Notifications to employee on suggestion + resolution
- ✅ Time-to-unblock returned in the resolve response

**Known gaps**
- **P1** — Audit log: the resolve action reuses `'blocker.pinged'` audit kind. Add a `'blocker.resolved'` enum.
- **P2** — Time-to-unblock metric needs a panel on Insights showing the org's rolling 30-day average.

---

## 14. AI Story generation

- ✅ Cron at /api/cron/stories generates daily stories per user
- ✅ Auto-triggered on punch-out

**Known gaps**
- **P1** — Story prompt currently leans heavily on GitHub events. For non-engineering roles, the narrative quality drops. Need to feed deliverables + screen analyses into the prompt context.

---

## 15. Notifications

- ✅ In-app bell with popover (fixed-position, z-index ≥ modal)
- ✅ Email via Resend
- ✅ Slack pings via webhook

**Known gaps**
- **P2** — No per-user notification preferences. Loudness is org-wide.

---

## 16. Billing

- ✅ Razorpay subscription create flow
- ✅ Seat-cap enforcement on invite
- ✅ GST invoice template

**Known gaps**
- **P1** — Trial expiry handling: no email reminder 3 days before, no auto-downgrade.
- **P1** — Payment-method failure recovery flow not built.

---

## 17. Capabilities & RBAC — **NEW**

- ✅ `requireCapability(orgId, cap)` server guard
- ✅ Workspace + Integrations gated by `manage_workspace` / `manage_integrations`
- ✅ Owner can grant extra caps from member modal Profile tab
- ✅ Sidebar Settings link routes to `/settings` if viewer can't manage workspace

**Known gaps**
- **P1** — Members page (remove member action) still requires `'owner'` role specifically — should use `manage_members` capability.
- **P1** — Leave decision endpoints check `'manager'` role — should use `decide_leaves` cap so a member granted that cap can act.

---

## 18. Data model & schema migrations

- ✅ Drizzle schema with migration generation
- ✅ `pnpm db:push` for dev
- ✅ Multi-tenancy: org-membership window enforced on event reads

**Known gaps**
- **P0** — Several new columns + tables shipped without explicit generated migrations: `deliverables`, `scheduled_meetings`, `blocker_thread`, `orgs.trackedGithubOrgs`, `memberships.discipline/jobTitle/extraCaps/reportsToMembershipId/workingDays`, `users.birthdayMmDd/joinedOn`, `breaks.resolvedByUserId/resolutionNote/resolutionType`, `invites.discipline/jobTitle`. **Run `pnpm db:generate && pnpm db:migrate` before deploying.**

---

## 19. Security & ops

- ✅ Sentry instrumentation
- ✅ `/api/health` endpoint
- ✅ HMAC verification on Razorpay + Slack webhooks
- ✅ Multi-tenant scope enforced via `withMembershipWindow` SQL helper
- ✅ Audit log for privileged actions

**Known gaps**
- **P1** — Rate limiting is only on magic-link starts. Should also rate-limit invite creation per-org (DoS via seat thrash) and notification create.

---

## 20. Landing page (`/`)

- ✅ Hero with animated preview
- ✅ Universal positioning ("for modern remote teams" not "engineering")
- ✅ Working scroll reveals, CountUp metrics
- ✅ Pricing + FinalCTA gradient visible
- ✅ Footer

**Known gaps**
- **P2** — No /pricing standalone page yet.

---

## Critical-path summary (P0 + P1)

| # | Area | Issue | Priority |
|---|------|-------|----------|
| 18 | Schema | Generate + run migrations for the new columns | **P0** |
| 1 | /dev/login | Server-side prod guard | P1 |
| 2 | Personal dashboard | Hide "Recent activity" when no GitHub | P1 |
| 3 | Org dashboard | "Awaiting review" → clickable filter | P1 |
| 6 | Attendance page | Honour per-employee workingDays | P1 |
| 8 | Insights | Universal "low deliverables" card | P1 |
| 10 | Integrations | db:push reminder is the only failure mode | P1 |
| 11 | Scrum Mode | Coverage doesn't auto-reset at midnight | P1 |
| 13 | Blocker Resolver | Audit enum + Insights metric | P1 |
| 14 | AI Story | Include deliverables in prompt context | P1 |
| 16 | Billing | Trial-expiry reminder + payment-failure recovery | P1 |
| 17 | RBAC | Members page + leave decisions still role-based, should use caps | P1 |
| 19 | Security | Rate limit invites + notifications | P1 |

The **P0** (migrations) must run before any production deploy. The P1s should
land in the next sprint to make MARINA feel finished to a buyer.
