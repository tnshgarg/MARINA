# MARINA — Pre-Launch Audit (every route + flow)

_Generated 2026-06-14. Nine parallel deep-read passes over all 43 pages, 95 API routes, and 50+ lib modules. Each finding was verified against actual source, not speculated._

**Raw totals across clusters:** 31 CRITICAL · 32 HIGH · 41 MEDIUM · 41 LOW ≈ **145 findings** (before dedup). After merging cross-cutting duplicates, the unique issues are grouped below by the 6 systemic themes + the standalone items.

> Severity key: **CRITICAL** = remotely exploitable / data leak / privilege escalation / money. **HIGH** = broken flow, cross-scope leak, cost DoS. **MEDIUM** = within-org over-exposure, logic bug, missing validation. **LOW** = polish, robustness, minor inconsistency.

---

## ⚠️ The 6 systemic themes (fix these patterns once, close ~70% of findings)

| # | Theme | Root cause | Closes |
|---|-------|-----------|--------|
| **T1** | **Scope not enforced** | `getVisibleScope` is called in only 6 places; every other manager page/API gates on `requireMembership('manager')` + orgId only | ~30 findings |
| **T2** | **Client-supplied IDs trusted** | `orgId`, `reportsToMembershipId`, `managerMembershipId` taken from request body with no membership/ownership validation | ~7 findings |
| **T3** | **AI budget not enforced** | Only `vision` + `employee_chat` call `canSpend`/`recordSpend`; `story`, `verify_shift`, `narrative`, `performance` are uncapped & unrecorded | ~8 findings |
| **T4** | **`lead` == `manager` rank** | `ROLE_RANK = {lead:2, manager:2}` so `requireMembership('manager')` admits leads everywhere | ~3 findings |
| **T5** | **Non-atomic check-then-act** | neon-http has no multi-statement txn; find-then-update races on magic tokens, pairing codes, seat caps, early-bird codes | ~5 findings |
| **T6** | **Secrets / config fail-open** | committed/reused `AUTH_SECRET`, `'dev-secret'` HMAC fallback, admin-email default, non-constant-time cron compare | ~5 findings |

**Single highest-leverage fix:** add a shared `requireScopedMembership(orgId, membershipId, minRole)` helper (= `requireMembership` + `getVisibleScope` membership check) and a `scope.userIds` filter for list endpoints; route every `membershipId`/`breakId`/`leaveId`/`teamId`-bearing handler and every teammate-listing page through it.

---

## CRITICAL

### Auth & accounts
1. **Invite acceptance never verifies the invite email matches the signed-in user.** `app/api/invites/accept/route.ts:17-45` & `app/invite/[token]/page.tsx:76-98`. Anyone with an invite link redeems it on their own account as the granted role (incl. manager). → Verify `invite.email === user.email` before inserting membership.
2. **Magic-link `devLink` returned in the HTTP JSON response in production** when `RESEND_FROM` is unset (defaults to `onboarding@resend.dev` → "test domain" → always-show-link). `app/api/auth/magic/start/route.ts:47-65,104`. POST any email → get a one-click sign-in link = any-account takeover. → Gate `devLink` on `NODE_ENV !== 'production'` only.
3. **Real secrets present in `.env` / `.env.production`, `AUTH_SECRET` reused across envs.** `.env:5`, `.env.production:6`. With the secret, anyone forges valid NextAuth JWTs (`requireSession` trusts JWT claims). Repo is not currently git-tracked, but rotate + per-env secrets before any deploy/CI. → Rotate `AUTH_SECRET` + Google client secret; inject via secret store.
4. **`consumeMagicToken` is non-atomic** (find-then-update, no `WHERE consumed_at IS NULL` on the update). `lib/auth/magic.ts:21-36`. Concurrent requests reuse a single-use link. → `UPDATE … SET consumed_at=now() WHERE token_hash=$1 AND consumed_at IS NULL RETURNING email`.

### Integrations (OAuth / Slack)
5. **Slack `/marina pulse` & `/marina blockers` leak the team snapshot to any Slack workspace user** — org resolved by `team_id` only, no membership/role check. `app/api/slack/commands/route.ts:86-90`. Names + blocker reasons exposed to any guest. → Require `findCallerMembership()` non-null; gate sensitive fields by role.
6. **Google OAuth `state` is never bound to the browser/session** (docstring claims a cookie; none is set) and the callback never calls `requireSession()`. `app/api/connect/google/start/route.ts:28-44`, `callback/route.ts:29-35,52-92`. → Set an httpOnly nonce cookie in `/start`; in `/callback` require a session AND `state.userId === session.appUserId` AND cookie match.
7. **Google state signing key falls back to literal `'dev-secret'` and is truncated to 64 bits.** `lib/google/oauth.ts:83-86`. If `AUTH_SECRET` unset, anyone forges state for any `userId`. → Fail closed; full-length HMAC + `timingSafeEqual`.
8. **Google callback writes `accounts.userId` straight from the forgeable `state`** with no session check → bind attacker's Google to victim, or victim's to attacker. `app/api/connect/google/callback/route.ts:81`. → (covered by #6 fix).

### Uploads / observability
9. **Unauthenticated path traversal → arbitrary file read.** `app/api/uploads/[...key]/route.ts:24-31` + `lib/storage/blob.ts:26`. `GET /api/uploads/avatars/../../etc/passwd` passes the `startsWith('avatars/')` check and the resolve regex permits `.`/`/`, escaping the storage root (verified empirically). Reads `.env`, source, any tenant's files. → `path.normalize` + strip leading `../` + assert resolved path stays under root; reject keys containing `..`.
10. **`/api/health` leaks raw DB error (DSN/host), AI-key presence, env, commit SHA to anonymous callers.** `app/api/health/route.ts:40-50`. → Public body = `{ok, db:'ok'|'fail'}` only; gate details behind a secret.
11. **Stored XSS via org-logo SVG upload, served same-origin as `image/svg+xml`.** `app/api/uploads/org-logo/route.ts:10` + `[...key]/route.ts:44`. A `manage_workspace` user uploads `<svg><script>…`. → Drop SVG from allowlist (or sanitize/rasterize); serve uploads with `Content-Disposition: attachment` + restrictive CSP.

### RBAC scope (Theme T1)
12. **Member drill-down APIs skip `getVisibleScope`** — any manager/lead reads full HR-grade data for ANY org member by ID: `detail` (`members/[membershipId]/detail/route.ts:29`), `narrative`, `story`, `oneonone`, `sync`, `schedule-meeting`, and **`devices/[deviceId]` DELETE revokes another team's agent device**. The profile *page* scope-checks, but the client calls the unscoped API directly. → Add the `chat/route.ts:95-101` scope pattern to every member sub-route.
13. **Six manager list pages load the whole org with no scope filter:** Attendance (`attendance/page.tsx:44`, honors `?member=` for anyone), Activity (`activity/page.tsx:43`), Insights (`insights/page.tsx:34`), Breaks (`breaks/page.tsx:15`), Shifts (`shifts/page.tsx:48`), Leaves (`leaves/page.tsx:14`). → Filter `userIds` to `scope.userIds`.
14. **Any manager can soft-delete (remove) any non-admin member org-wide.** `members/[membershipId]/route.ts:196-216` — `manage_members` cap + org check, no scope. → Scope-gate the target.
15. **Manager can self-grant visibility** by PATCHing any member's `reportsToMembershipId` to themselves (mass-assignment, no scope, no cycle/org validation) — `members/[membershipId]/route.ts:101-134`; same via team `managerMembershipId` (`teams/route.ts:74-94`, `teams/[teamId]/route.ts:22-70`) and the managers-edge route (`members/[membershipId]/managers/route.ts:30-45`). `getVisibleScope` then walks the chain → instant org-wide drill-down. → Validate IDs belong to org + are active; forbid non-admins adding self as manager.
16. **`getVisibleScope` queries `membership_managers` with no `orgId` filter** — loads every manager-edge in the DB; membership IDs are a global serial PK so cross-org edges can enter the scope graph. `lib/auth/scope.ts:86-89`. → Join to `memberships` and filter both sides by `orgId`.

### Multi-tenant writes (Theme T2)
17. **Client-supplied `orgId` accepted with no membership check → cross-org data injection.** `app/api/me/deliverables/route.ts:60` → `lib/deliverables/create.ts:120`, `app/api/me/breaks/route.ts:75`, and `app/api/agent/breaks/route.ts:55` (also fans out a manager notification into the forged org). → `requireMembership(body.orgId)` when an explicit orgId is supplied.

### Billing
18. **Razorpay webhook is not idempotent.** `app/api/billing/razorpay/webhook/route.ts:74-103`. Razorpay retries (and replays of a captured valid payload) re-apply the plan + re-send receipts; a replayed `activated` re-upgrades a downgraded org. → Persist event/payment id; short-circuit if seen.
19. **Webhook trusts `notes.orgId` and never binds the event to the org's stored `billingSubscriptionId`.** `webhook/route.ts:58-62,104-113`. A validly-signed `cancelled`/`paused` with a chosen orgId downgrades an arbitrary org. → Look up org by `sub.id`; assert it matches.
20. **Seat cap enforced only at invite *create*, not *accept*.** `app/api/invites/accept/route.ts:32-45`. Pending invites accepted after a downgrade, or accepted concurrently, blow past the cap (revenue leak). → Re-check cap inside accept; unique partial index `(orgId,userId) where ended_at is null`.
21. **Expired paid plans / early-bird grants are never downgraded — effectively permanent.** No cron resets `orgs.plan` (`lib/billing/early-bird.ts:75-86` claims one exists; it doesn't). → Add an `authorizeCron` job: `plan='free' where billing_provider is null and trial_ends_at < now()`.

### Agent / AI cost
22. **Pairing code not single-use under concurrency** (SELECT-unconsumed → UPDATE without `AND consumed_at IS NULL` → INSERT token, 3 non-transactional round-trips). `app/api/agent/pair/complete/route.ts:60-76`. Two completes mint two tokens. → Conditional atomic update + only mint on rows-affected.
23. **Daily-story & shift-verify LLM calls have zero budget gate on every path** (incl. user-triggerable `POST /api/me/story` and every punch-out). `lib/engine/story.ts:530`, `lib/engine/verify-shift.ts:120`. Uncapped AI cost DoS + spend invisible to the ledger that powers `canSpend`. → Gate with `canSpend`, fall back to rules, `recordSpend` after.

---

## HIGH

### RBAC scope / cross-team actions (Theme T1)
24. **Cross-team blocker actions** — `resolve` (`blockers/[breakId]/resolve/route.ts:29`), `route-to` (`route-to/route.ts:39`, emails/Slacks any helper), `ping` (`ping/route.ts:28`) all lack scope checks; any manager acts on any org blocker. → Scope-gate the break's user (+ helper).
25. **Cross-team leave decision + self-approval.** `leaves/[leaveId]/decide/route.ts:27` — `decide_leaves` cap, no scope, no self-guard (manager approves own leave). → Scope-gate; reject `leave.userId === self`.
26. **Cross-team narrative / story / 1:1 generation** (also Theme T3 budget bypass). `members/[membershipId]/narrative|story|oneonone/route.ts`. → Scope-gate + budget-gate.
27. **Cross-team GitHub re-sync** for any member (`members/[membershipId]/sync/route.ts:21`) and **org-wide bulk sync** (`sync-team/route.ts:23`, unscoped + unthrottled, "team" is actually whole-org). → Scope + rate-limit.
28. **Cross-team schedule-meeting** (calendar invite + email to anyone). `schedule-meeting/route.ts:32`. → Scope-gate.
29. **Team report all-or-nothing scope:** seeing any one team member unlocks per-employee detail for the whole team. `teams/[teamId]/report/page.tsx:86`. → Filter rows to `scope.userIds`.

### Auth / roles (Theme T4)
30. **`requireMembership('manager')` admits `lead`** (rank tie). `lib/auth/guards.ts:13`. Leads can create/revoke invites (incl. manager-role invites → escalation), reach manager AI surfaces. → Give `lead` a distinct lower rank, or gate member-mgmt on `manage_members` capability.
31. **Account-merge-by-email links unverified identities.** `auth.ts:51,87,186-205` — `allowDangerousEmailAccountLinking` + merge by GitHub `profile.email` without checking verified flag. → Only link on provider-asserted verified email.

### Integrations
32. **GitHub OAuth `repo`-scoped access token is exposed to the browser via the session** (`auth.ts:46,330`, `types/next-auth.d.ts:5`). Any XSS or `/api/auth/session` read exfiltrates full private-repo access. → Keep token server-side only; reduce scope if write isn't needed.
33. **All OAuth/bot tokens stored plaintext at rest** (`users.access_token`, `accounts.*_token`, `orgs.slack_bot_token`). `schema.ts:14,39-40,191`. DB read = standing access to every tenant's GitHub/Google/Slack. → Encrypt with an app/KMS key.
34. **`/api/sync/github` has no rate limit** (`route.ts:9-41`) and **`nudge` lets any Slack workspace user DM any member with an attacker-controlled sender name** (`slack/commands/route.ts:92-155`). → Add `checkRateLimit`; require caller membership; derive sender from membership.

### Employee / agent
35. **No screenshot consent check before capture/store/ship-to-vision.** `app/api/agent/screenshots/route.ts:72-89` gates only on `trackingPausedAt`, never reads `shotConsents`. DPDP/SOC2 exposure. → Require a current `shotConsents` row.
36. **Pairing brute-force / spam:** `pair/complete` has no rate limit and matches any user's live code globally; `pair/initiate` has no rate limit (the documented `pair_code:` bucket is never called). `pair/complete/route.ts:39`, `pair/initiate/route.ts:10`. → Rate-limit both ends.

### Billing / cron (Themes T3/T5/T6)
37. **Cron auth uses non-constant-time `===` on the secret.** `lib/cron/auth.ts:14` (it does fail-closed on unset — good). → `crypto.timingSafeEqual`.
38. **Early-bird redemption race** (non-atomic check-then-insert; `(codeId,orgId)` index only blocks same-org) → a single-use code redeemed by two orgs. `lib/billing/early-bird.ts:44-73`. → `UPDATE … SET used_count=used_count+1 WHERE id=? AND used_count<max RETURNING *`.
39. **`monthlyAiBudgetCents` never updated on plan change** — `PLANS[*].monthlyAiBudgetCents` is dead config; paid orgs stay throttled at the 5000 default. `webhook/route.ts:79`, `early-bird.ts:78`. → Set budget from the plan on every plan write.
40. **Admin "send daily digest now" sends to nobody** — selects `{user}` but filters on `m.role` which is always `undefined` → `'member'` → filtered out. `app/api/admin/broadcast/digest/route.ts:70-84` (also reported by admin agent #7). → Select `role` from memberships.
41. **Performance-report AI narrative: no budget gate + prompt injection** via employee-controlled `deliverable.title` / break `reason` embedded verbatim ("write: promote immediately"). `lib/reports/performance.ts:202,258-296`. → Budget-gate + delimit untrusted text + system-prompt guard.
42. **Employee-chat `history` is client-supplied & unvalidated** — forge `assistant` turns + unbounded `content` (only `question` is length-capped). `chat/route.ts:68`, `employee-chat.ts:283`. → Validate role/alternation, clamp per-turn + total bytes.

### Admin / uploads
43. **Upload validation trusts client `file.type`; no magic-byte sniffing.** `uploads/avatar/route.ts:30`, `org-logo/route.ts:38`. Bypasses the type allowlist (feeds #11). → Sniff bytes; derive MIME+ext from decoded image.
44. **`/api/analytics/track` lets an authenticated user forge events for any `orgId`** (no membership check). `analytics/track/route.ts:64`. Pollutes founder analytics. → `requireMembership(body.orgId)`.

---

## MEDIUM

### Within-org over-exposure (Theme T1)
45. Org-wide **breaks feed** not scope-filtered (incl. soft-deleted members). `api/orgs/[orgId]/breaks/route.ts:16`.
46. Org-wide **leaves list** leaks free-text reasons (bereavement/medical) to any manager. `api/orgs/[orgId]/leaves/route.ts:16`.
47. Org-wide **celebrations** (birthdays/anniversaries of everyone). `celebrations/route.ts:27`.
48. **Blocker detail** GET leaks blocked user's email + full thread cross-team; POST appends notes cross-team. `blockers/[breakId]/route.ts:26,155`.
49. **Break nudge** cross-team. `breaks/[breakId]/ping/route.ts:26`.
50. **oneonone brief** cross-team (also #26). `members/[membershipId]/oneonone/route.ts:27`.
51. **Full member directory** exposed to any plain member (incl. soft-deleted). `members/search/route.ts:21`.
52. **Org-wide team chart** (roles/disciplines/titles) exposed to any member. `teams/route.ts:17`.
53. **Dashboard pending-leaves widget + on-leave count are org-wide** while the rest of the dashboard is scoped. `org/[orgId]/page.tsx:85,176`.
54. **`digest/daily` mis-scopes:** managers whose reports are only via `membership_managers` (m:n) get `scope=null` → whole-org digest; admins always whole-org. `cron/digest/daily/route.ts:50`.
55. **Digest preview** returns org-wide aggregate to any manager. `digest/preview/route.ts:22`.
56. **Scrum coverage:** any manager can wipe/toggle another manager's coverage; DELETE wipes all org/day rows. `scrum/coverage/route.ts:42,106`.

### Logic / correctness
57. **`canSpend` fails open when the org row is missing** (`allowed:true, budget:0`). `lib/ai/budget.ts:43`. → Fail closed.
58. **AI budget window is rolling 31 days, not the calendar month** the schema/UX promises (reported twice: `budget.ts:21`). → Compute from first-of-month in org tz.
59. **`recordSpend` skipped when the AI call throws / on fallback** — Groq error or empty-then-OpenAI path under-records spend → budget drift. `chat/route.ts:117`, `registry.ts:25-38`.
60. **Chat cost estimate can be ~4× off** (byte/4 heuristic, wrong provider rate, excludes history bytes). `chat/route.ts:129`, `budget.ts:97`.
61. **Verify-shift score is injectable** by the employee's own summary ("return score:100") → evades the suspicious-shift alert. `verify-shift.ts:148`.
62. **Unbounded chat context** — long free-text fields (`narrative.body`, `todayStory.narrative`, summaries) included untruncated → cost blowup. `employee-chat.ts:64-133`.
63. **Webhook maps unknown `plan_id` → `'free'` even on activation** (env name mismatch: `..._TEAM_ID` vs `..._TEAM`) → paid customer silently downgraded. `webhook/route.ts:66`.
64. **`states`/`stories` crons compute day boundaries in UTC, not org tz** (`Asia/Kolkata` default) → wrong-day bucketing near IST midnight. `cron/states/route.ts:28`, `cron/stories/route.ts:39`.
65. **Cron batching never self-chains** — one batch (15 stories / 40 states) per 24h; large orgs never drain, cursor resets next day. `cron/stories/route.ts:83`, `cron/states/route.ts:69`.
66. **`blocker.pinged` notify resolves `waitingOnUserId` not constrained to the org** → possible cross-org notification of blocker reason. `lib/notify/send.ts:241`.
67. **Agent `leaves` membership check uses the user's *first* membership**, not the requested org → multi-org users rejected. `api/agent/leaves/route.ts:57`.
68. **In-memory agent rate-limiter is per-instance** (Map) — useless on serverless cold-starts; screenshot/event/vision spam not bounded in prod. `lib/agent/rate-limit.ts:14`.
69. **Unbounded vision spend** via client-controlled screenshot uploads (throttle is the bypassable in-memory limiter). `api/agent/screenshots/route.ts:138`.

### Auth / validation
70. **JWT callback swallows all DB errors and returns a partial token** → half-authenticated session / redirect loop for new users on a transient DB error. `auth.ts:322`.
71. **Account deletion has no confirmation/re-auth** — single DELETE wipes everything. `api/me/account/route.ts:13`. Owner-protection count ignores `endedAt`.
72. **Leave PATCH accepts unvalidated `leaveType`** (POST validates; PATCH doesn't) → enum corruption / `undefined` labels. `api/me/leaves/[id]/route.ts:46`.
73. **Invite creation has no rate limit** (documented `invite:<orgId>` bucket never wired) → email-bomb/enumeration. `api/orgs/[orgId]/invites/route.ts`.
74. **Slack callback uses non-constant-time state compare** + doesn't re-check `manage_integrations` capability on callback. `connect/slack/callback/route.ts:28-38`.
75. **GitHub sync tracked-org filter is a union across all of a user's orgs**, and any org with an empty list disables filtering for all → cross-org activity bleed. `api/sync/github/route.ts:18`, `lib/github/sync.ts:36`.
76. **Calendar `accounts` row updated by `userId` alone** when a user has >1 Google account → token overwrites wrong row. `auth.ts:295`.

### UX dead-ends / broken
77. **"Reports" sidebar item is a dead-end** for managers without `view_all_data` (redirects to dashboard). `components/org-sidebar.tsx:54`. Same for per-row "Report"/"Performance review" buttons (`members/client.tsx:441`, `people/[membershipId]/client.tsx:208`) and the Leaves Approve/Deny buttons shown to leads who get 403 (`leaves/page.tsx:47` hardcodes `isManager`).
78. **`/api/analytics/track` accepts unauthenticated events + no rate limit** → table bloat / skewed KPIs. `analytics/track/route.ts:51`.
79. **Broken public links / 404 CTAs:** `/pricing` (download nav `:279` — _now repointed to early-access_, terms `:43` _fixed_), `/sub-processors` (privacy `:56`, dpa `:46`), `/dpa/marina-dpa.pdf` (dpa `:16`). → Create routes/files or repoint. _(Partially addressed in this session.)_

---

## LOW

### Auth
80. `pickUniqueLogin` random fallback isn't uniqueness-checked; `users.login` isn't `unique` in schema. `auth.ts:16`, `schema.ts:8`.
81. Rate-limiter `Math.min(...empty)` foot-gun if `limit=0`. `lib/auth/rate-limit.ts:48`.
82. Sliding-window rate limiter is non-atomic (check-then-insert race). `lib/auth/rate-limit.ts:37`.
83. Plaintext sign-in/invite URLs logged to console (non-prod / no-key). `auth/magic/start/route.ts:99`, `email/send.ts:20`.
84. Root honors `marina_pending_invite` cookie before validating the token → confusing redirect to "invite not found". `app/page.tsx:37`.
85. Auth-error page tells end users to run `pnpm db:push` (info disclosure + bad UX). `auth/error/page.tsx:5`.
86. Open-redirect guard only checks `startsWith('/')` → `//evil.com` / `/\evil.com` slip through. `auth/verify/page.tsx:13`.
87. `dev` Credentials provider is registered in prod (page is `notFound`, authorize returns null) — single `NODE_ENV` guard, no build-time exclusion. `auth.ts:136`.

### Agent / AI
88. Dead `constantTimeEqualHex` helper in agent auth (hash-lookup is fine, but the unused helper is a smell). `lib/agent/auth.ts:20`.
89. Token `lastSeenAt`/`agentVersion` updates are fire-and-forget (may drop on serverless teardown). `lib/agent/auth.ts:53`.
90. Agent notifications POST prunes the **entire** notifications table (>60d) on every call. `api/agent/notifications/route.ts:107`. → Move to `cron/sweep`.
91. Screenshot `expiresAt`/path derive from client `capturedAt`. `api/agent/screenshots/route.ts:118`.
92. `displayIndex` accepted unvalidated (negative/fractional). `api/agent/screenshots/route.ts:115`.
93. `/api/narrative` (self) makes an LLM call with no budget gate and unattributed org. `api/narrative/route.ts:36`.
94. `parseNarrative` fence-strip only handles single leading/trailing fences → raw model text stored on parse failure. `lib/ai/narrative-prompt.ts:109`.
95. Chat analytics event mislabeled as `profile.opened` → can't see chat-volume abuse spikes. `chat/route.ts:150`.

### Employee
96. `story` GET day-key in server-local time vs POST cache → cache miss near midnight. `api/me/story/route.ts:79`.
97. Notifications GET runs a dead `unreadCount` query (placed after `return`) + unread badge capped at 50. `api/me/notifications/route.ts:27`.
98. Account-delete owner-count ignores `endedAt` → owner blocked by already-removed members. `api/me/account/route.ts:24`.

### Manager APIs / settings
99. members PATCH `workingDays` accepts truthy junk (`!!b`); no "≥1 working day" check. `members/[membershipId]/route.ts:107`.
100. settings PATCH: `holidayRegion` is an arbitrary string that wipes+reseeds the holidays table; no `start<end` check on workday hours. `settings/route.ts:49`.
101. Scrum Mode tutorial hint says ←/→ but only ↑/↓/j/k are wired. `scrum/[orgId]/client.tsx:162`.
102. `SettingsTabs` renders both Workspace+Integrations tabs regardless of caps (clicking the lacked one redirects). `org-tabs.tsx`.

### Billing / notify / integrations
103. `subscribe` writes `billingSubscriptionId` before payment (fine once #19 fixed). `billing/subscribe/route.ts:56`.
104. Weekly + daily digest crons have no time-budget/cursor → tail orgs dropped if a send stalls. `cron/digest/route.ts:30`.
105. `redeem-code` (capability) vs `subscribe` (admin role) RBAC inconsistency. `billing/redeem-code/route.ts:25`.
106. `inbox()`/`notify()`/audit writes swallow errors via `afterResponse` with only `console.error` — no metric/alert on failure (compliance concern for audit). `lib/after.ts:22`.
107. Slack disconnect doesn't call `auth.revoke` → leaked token stays valid. `connect/slack/disconnect/route.ts:9`.
108. Google `userinfo` failure falls back to `providerAccountId = userId` → orphan/duplicate accounts rows. `connect/google/callback/route.ts:38`.
109. Slack install ignores `authed_user.id` → no record of who authorized. `lib/slack/client.ts:58`.
110. Raw exception strings returned to clients (github sync `:45`, google callback redirect `:118`). Info disclosure.

### Admin / misc
111. Founder allowlist defaults to a hard-coded personal Gmail if `MARINA_ADMIN_EMAILS` unset. `lib/auth/admin.ts:23`. → Require env in prod.
112. Avatar/org-logo blobs never deleted on re-upload/reset → unbounded orphans + DPDP retention gap (publicly fetchable after "deletion"). `uploads/avatar/route.ts:43`.
113. Differentiated 403 messages let a logged-in user enumerate org membership. `guards.ts:104`.
114. Analytics `payload` is unvalidated free-form → can carry PII into the "PII-free" analytics table. `analytics/track.ts:16`.

---

## Verified-OK (checked, not bugs — don't re-investigate)
- Slack request-signature verification (`lib/slack/verify.ts`) is correct: raw body, ±300s replay window, `timingSafeEqual`, fails closed.
- Razorpay **signature** verification is correct (raw body, HMAC-SHA256, `timingSafeEqual`, length-guarded) — only idempotency (#18) + sub-binding (#19) are missing.
- Cron routes all call `authorizeCron` (GET+POST) and fail closed on unset secret; `?secret=` query gated to non-prod.
- Admin console: layout gates all `/admin/*` pages **and** every `/api/admin/*` route independently re-checks `isAdminSession()`; founder identity is server-derived from the JWT (not client-spoofable).
- Employee `/api/me/*` `[id]` routes all have ownership checks; punch-in double-race blocked by a partial unique index; export is caller-scoped and strips tokens.
- Agent tokens are SHA-256-hashed at rest; `events` validates/caps timestamps + batch size; blob `resolve()` is the only traversal sink (#9).
- `members PATCH` does **not** accept a `role` field and `extraCaps` edits are admin-gated → no *direct* self-promote-to-admin (the escalation is indirect via #15).
- `wipe-demo` is admin-gated and only deletes `seed-%` rows.
- No missing `await params` found anywhere (Next 16 Promise params handled correctly across all clusters).

---

## Suggested fix order (pre-launch blockers first)
1. **#9, #10, #11** (uploads traversal, health leak, SVG XSS) — remotely exploitable, zero auth, ~1 file each.
2. **#1, #2, #4** (invite email, magic devLink, magic race) + **#3/#6/#7** secret hygiene.
3. **T1 scope** — ship `requireScopedMembership` + filter the 6 list pages and ~15 member sub-APIs (#12–#16, #24–#29, #45–#56).
4. **#5, #6–#8** Slack/Google OAuth.
5. **T2** client-`orgId` (#17), **T3** AI budget (#23, #26, #41), **#18–#21** billing.
6. **T4** lead rank (#30), **T5** races (#22, #38), **T6** config (#37, #39, #111).
7. MEDIUM, then LOW.
