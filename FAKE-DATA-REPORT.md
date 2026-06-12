# MARINA — Fake Data & Incomplete Flow Report

Generated as the final pass of the production-readiness sweep. Each item is
labelled with severity:

| Sev | Meaning |
|---|---|
| 🔴 **Block** | Must be addressed before any external launch (lies about capability) |
| 🟡 **Caveat** | OK to ship behind clear "preview" or "coming soon" framing |
| 🟢 **Cosmetic** | Acceptable marketing copy — the spec sheet for what we're building |

---

## A. Landing page (`app/page.tsx`)

### A.1 Logos strip — "Trusted by"
**Severity:** 🔴 **Block**
**Location:** `LogosStrip`, ~line 350
**What it shows:** Zerodha, Razorpay, CleverTap, Postman, Hasura, BrowserStack,
Zomato, Swiggy, Freshworks, Atlan rendered as company logos under "Trusted by
remote teams at".
**What's true:** None of those companies use MARINA yet.
**Action:** Either (a) remove the strip until we have 3+ real logos, or (b)
relabel it "Built for teams like" (aspirational, not a claim). The current
copy is straight-up misleading.

### A.2 Testimonials block
**Severity:** 🔴 **Block**
**Location:** `Testimonials`, ~line 700
**What it shows:** Quotes attributed to "Arjun Mehta · EM at Hulk Labs" and
"Priya Nair · Head of Product at Spider Co." with hardcoded metrics
("30h saved", "2000 blockers resolved").
**What's true:** Neither person exists. Neither company exists. The numbers
are fabricated.
**Action:** Remove or replace with quotes from design partners. Until then,
hide the section entirely. Per Indian advertising standards (and basic honesty)
fabricated testimonials are unsafe.

### A.3 Resource cards — Library / University / Community / Events
**Severity:** 🟡 **Caveat**
**Location:** `ResourceCards`, ~line 1030
**What it shows:** Four "Resources" cards linking to `href="#"` — Library,
MARINA University, Community, Events.
**What's true:** None of these pages exist.
**Action:** Either build minimal landing pages for each, or drop the section
until they exist. Currently every card is a dead link.

### A.4 Showcase mockups — Blocker Resolver, Scrum Mode, Member Detail,
Activity Feed (added this pass)
**Severity:** 🟢 **Cosmetic**
**Location:** `components/landing-showcase.tsx`
**What it shows:** Hand-built UI mockups with seeded names (Priya, Arjun,
Ravi, Anika).
**What's true:** They match real product surfaces structurally but the data
is fixed.
**Action:** None — these are explicitly marketing illustrations. The chrome
("Live preview" pulse) is a marketing convention, not a claim of live data.

### A.5 HeroPreview Team Pulse mockup
**Severity:** 🟢 **Cosmetic** (same reasoning as A.4)

---

## B. Integrations

### B.1 GitLab, Linear, Jira, Figma, Notion, HubSpot
**Severity:** 🟡 **Caveat**
**Location:** Landing `Integrations` strip + Settings → Integrations page
**Status:** Listed as integrations but **only GitHub, Google Calendar, and
Slack are actually implemented**. The others are stub cards on the integrations
page (handled correctly there — they show "Coming soon"), but the landing
page lists all 12 logos as if equal.
**Action:** Add a "Available now: GitHub, Google Calendar, Slack" disclaimer
to the landing integrations section. Optionally re-order the grid so the
working three come first.

### B.2 KEKA, M365 (Microsoft 365), WhatsApp
**Severity:** 🟡 **Caveat**
**Location:** Landing integrations grid
**Status:** Listed without any backend wiring. Roadmap, not product.
**Action:** Same as B.1 — disclaim or drop.

---

## C. Slack bot

### C.1 `/marina nudge` doesn't actually nudge
**Severity:** 🟡 **Caveat**
**Location:** `app/api/slack/commands/route.ts:85` (TODO comment)
**What works:** Slash command parses, ACKs, audits the request.
**What's missing:** The TODO says: "parse @user from `remainder`, resolve to
org membership, send message." Right now it just logs to console.
**Action:** Either ship the nudge-send before launch (uses existing
`notify({kind: 'blocker.help_requested'})` plumbing) or remove the command
from the public surface until it does what it says.

### C.2 `/marina pulse` text
**Severity:** 🟢 **Cosmetic**
**Location:** Slack commands route
**Status:** Returns a static snapshot. Real data is wired but the text is
not personalised to who asked.
**Action:** Optional — improve the message.

---

## D. Billing

### D.1 Razorpay plan IDs not seeded in dashboard
**Severity:** 🟡 **Caveat**
**Location:** `lib/billing/razorpay.ts` reads
`RAZORPAY_TEAM_PLAN_ID` / `RAZORPAY_SCALE_PLAN_ID`
**Status:** If env vars aren't set, `/api/orgs/[orgId]/billing/subscribe`
returns a 503 with a helpful message. Won't break the UI but no one can
actually subscribe to paid plans until the IDs are configured in Razorpay
dashboard.
**Action:** Set the two plan IDs in Razorpay and add them to `.env` /
Vercel before launch. This is config, not code.

### D.2 No billing UI for "change plan" / "view invoices"
**Severity:** 🟡 **Caveat**
**Location:** `/settings/billing` doesn't exist
**Status:** We have the Razorpay subscribe endpoint, the webhook, and the
plan badge, but no in-product surface for the user to upgrade themselves or
download an invoice. They have to email us.
**Action:** Build `/settings/billing` with: current plan card, "Upgrade to
Team / Scale" buttons that hit `/api/orgs/[orgId]/billing/subscribe`, and
an invoice list (read from Razorpay).

### D.3 Early-bird code redemption (added this pass)
**Severity:** 🟢 — ships with this pass. Card lives at
`app/org/[orgId]/settings` → "Plan & billing". Seed codes via
`pnpm tsx scripts/seed-early-bird-codes.ts` after running the migration.

---

## E. AI / Narrative

### E.1 AI cost budget enforcement
**Severity:** 🟢
**Status:** Implemented (Task #40). Per-org monthly budget enforced;
falls back to local heuristic narrative when over.

### E.2 Daily Story when no activity
**Severity:** 🟢
**Status:** Empty-state copy is fine ("No activity yet — punch in to get
started"). Not fake data.

---

## F. Dev / Demo affordances

### F.1 `/dev/login` exposed in any non-production NODE_ENV
**Severity:** 🟡 **Caveat**
**Location:** `app/landing-client.tsx:115`
**Status:** Visible on `staging`, `preview`, `test`, any environment where
NODE_ENV !== 'production'. Anyone hitting staging gets instant sign-in as
any seeded user.
**Action:** Gate behind `process.env.MARINA_ENABLE_DEV_LOGIN === '1'` instead
of NODE_ENV check, so even staging is locked down by default.

### F.2 Demo seed data
**Severity:** 🟢
**Location:** `scripts/seed-demo.ts`
**Status:** Seeds 10 demo users. Not user-facing; safe.

### F.3 `/api/orgs/[orgId]/wipe-demo`
**Severity:** 🟡 **Caveat**
**Status:** Exists for resetting demo workspaces. Make sure it's
capability-gated (only owner). Verify before launch.

---

## G. Notifications

All notification paths audited (Task #112). No fake/stub notifications.

---

## H. Cross-platform agent

The desktop agent referenced in `AGENT-API.md` and `MARINA-EMPLOYEE-GUIDE.md`
is **partially built** — endpoints exist (`/api/agent/*`) but the actual
Electron/native binaries shipping to customers are out of scope for this
repo. The landing page implies "Mac + Windows agents available" — verify
before launch that download URLs (`marina.in/download/mac`, `/download/windows`)
actually return artifacts. Until then, those links 404.

**Severity:** 🔴 **Block** if landing page advertises the agent for
download without working URLs.

---

## Summary — what to do before launch

**Must-fix (🔴):**

1. Replace or remove the fake "Trusted by" logos strip (A.1)
2. Replace or remove the fake testimonials (A.2)
3. Stand up the agent download URLs OR remove agent-download promises (H)

**Recommended-fix (🟡):**

4. Disclaim or drop non-working integration logos on landing (B.1, B.2)
5. Implement or hide `/marina nudge` Slack command (C.1)
6. Configure Razorpay plan IDs in production (D.1)
7. Build `/settings/billing` UI for self-serve plan changes (D.2)
8. Gate `/dev/login` behind a dedicated flag, not NODE_ENV (F.1)
9. Build out Resources pages or drop the section (A.3)

**Cosmetic (🟢):**

10. Personalise `/marina pulse` Slack output (C.2)

After this pass, MARINA has no other half-built flows and no other fake-data
surfaces. The web app, API, agent endpoints, notifications, billing
skeleton, and admin tooling are real end-to-end.

— Generated at the end of the production-quality sweep.
