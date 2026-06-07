# Project MARINA — v1 complete (Days 1–7)

AI Workforce Intelligence — track meaningful work output (commits, PRs, reviews) instead of mouse jiggles, and generate AI-written work narratives.

All 7 days of the plan are now in: single-user narrative → multi-tenant orgs + invites → macOS menubar agent → disclosed-randomized screenshots + vision labels → combined-signal stagnation engine.

> The agent lives in [`../marina-agent`](../marina-agent). This README covers the web app; agent setup lives there.

## What's in this slice

**Day 1 — personal**
- GitHub OAuth login (NextAuth v5)
- Sync last 7 days of your own commits / PRs opened / reviews given / issues closed
- AI narrative generation with **Groq** (Llama 3.3 70B) and **OpenAI** (gpt-4o-mini)
  - Provider abstraction with automatic fallback when one isn't configured
  - Dashboard toggle to pick either provider per generation
- Personal dashboard at `/dashboard` with activity feed, totals, and a Work Narrative card showing signal (High / Steady / Low / Blocked) and inferred blockers

**Day 6–7 — Vision pipeline + combined-signal engine**
- Pluggable `BlobStore` (`lib/storage/blob.ts`) — `local` driver writes to `.marina-storage/` for dev, `vercel_blob` via `@vercel/blob` for prod
- `VisionProvider` (`lib/ai/vision.ts`) — strict-JSON OpenAI gpt-4o-mini vision call returning `appCategory` × `workAppLabel` × `visibleContentHint` × confidence; heuristic `progressScore` compares consecutive shots without a second LLM call
- `POST /api/agent/screenshots` — token-auth + rate-limit + magic-bytes JPEG sniff; stores blob, runs vision inline, persists `shot_analyses`. Returns labels only; never echoes the image
- **48-hour retention is enforced** via `/api/cron/sweep` (Vercel Cron, hourly) — deletes blob originals + sets `screenshots.deletedAt`. Labels persist.
- **`/me/shots`** — employee transparency: reviews their own captures + labels in the last 48 hours. Raw images are never accessible to any other user (no endpoint serves them to managers).
- `lib/engine/state.ts` `computeDailyState(userId, day)` combines: GitHub output count, agent presence (online + active hours), shot focus % + longest static-idle run → returns `High` / `Steady` / `Blocked` / `Disengaged` / `PossiblyDummying` / `NoData` with a one-sentence reason
- `/api/cron/states` runs daily, computing states for yesterday + today across all users. The team dashboard also lazy-computes on-demand so a manager opening the page never sees stale signals.
- Team dashboard surfaces the state badge per member + a top-banner alert summary ("⚠️ 2 may be blocked, 1 may be dummying — worth a check-in")

**Production hardening**
- All agent endpoints (events, heartbeat, pause, screenshots) are sliding-window rate-limited per token, with standard `X-RateLimit-*` response headers
- Structured JSON logger (`lib/log/log.ts`) on every ingest path
- Cron routes gated by `Authorization: Bearer ${CRON_SECRET}` (Vercel format) or `?secret=` query

**Day 4–5 — Mac agent + activity surface**
- `agent_tokens` (sha256-hashed bearer tokens, never stored in plaintext), `pairing_codes` (8-char base32, 10-min TTL, single-use), `user_settings` (pause / window-titles / consent), `local_activity` (per-window-per-app aggregates)
- Agent endpoints: `POST /api/agent/pair/initiate` (user-auth), `POST /api/agent/pair/complete` (anonymous code exchange), `POST /api/agent/events` (token-auth, server discards if paused), `POST /api/agent/heartbeat` (token-auth, returns config), `POST /api/agent/pause` (token-auth, agent-initiated pause toggle)
- User endpoints: `GET/PATCH /api/me/settings`, `GET /api/me/devices`, `DELETE /api/me/devices/[id]`
- **/settings page**: pause / resume tracking, opt in/out of window titles, generate pairing codes with 10-min countdown, list of paired devices with last-seen + revoke
- **Personal dashboard**: "Today" panel with online / active / idle and top apps, sourced from the agent
- **Team dashboard**: per-member card now includes today's online time + top app + paused badge
- All authentication paths use sha256 of high-entropy tokens — no plaintext secrets in DB
- Pause is honoured by the server: paused users' batches are discarded before insert (defence in depth)

**Day 2–3 — teams**
- Onboarding: new user creates an org (becomes owner) or accepts a pending invite by email
- Team dashboard at `/org/[orgId]`: per-member cards with their latest narrative + signal + (manager-only) Sync / Generate buttons
- Members page at `/org/[orgId]/members` (manager+): invite by email + role, see pending invites, copy invite links, revoke invites; owners can remove members
- Invite acceptance flow at `/invite/[token]`: signed-out users sign in with GitHub and land back to accept
- Role hierarchy: `member` < `manager` < `owner`. Every API route checks membership + role.
- Resend integration for invite emails. If `RESEND_API_KEY` is unset, the UI surfaces the invite link to copy manually — nothing else breaks.

## Stack

- Next.js 16 (App Router) + TypeScript + Tailwind
- NextAuth v5 (`next-auth@beta`)
- Drizzle ORM + Neon (Postgres over HTTP)
- `@octokit/rest` for GitHub
- `groq-sdk` + `openai`

## Setup

1. **Database (Neon).** Sign up at https://neon.tech, create a project, copy the connection string.

2. **GitHub OAuth app.** https://github.com/settings/developers → New OAuth App.
   - Homepage URL: `http://localhost:3000`
   - Authorization callback URL: `http://localhost:3000/api/auth/callback/github`
   - Generate a client secret; copy both ID and secret.

3. **API keys.**
   - Groq: https://console.groq.com (free tier is plenty for v1)
   - OpenAI: https://platform.openai.com/api-keys

4. **Env vars.** Copy `.env.example` to `.env.local` and fill it in. Generate `AUTH_SECRET` with:
   ```sh
   openssl rand -base64 32
   ```

5. **Push schema.**
   ```sh
   pnpm db:push
   ```

6. **Run.**
   ```sh
   pnpm dev
   ```

   Open http://localhost:3000.

## Verification (Day 3 ship criteria)

After pulling Day 2–3 changes, re-run `pnpm db:push` to add the new `orgs`, `memberships`, `invites` tables.

**Personal flow (unchanged):**
1. `/dashboard` → Sync GitHub → Generate → narrative + signal appears, both providers work

**Team flow:**
1. New user signs in → lands on `/onboarding` → creates org "Acme" → redirected to `/org/[orgId]`
2. Open `/org/[orgId]/members` → invite a second email as `member`
3. Without Resend: invite link is shown in the form — copy it
4. Open the link in a private browser → sign in with a second GitHub account → land back on `/invite/[token]` → click Accept → redirected to `/org/[orgId]` as that member
5. Second user connects their GitHub via signing in (already done in step 4) → owner returns to `/org/[orgId]` → clicks Sync, then Generate on the second member's card → narrative appears
6. Owner opens `/org/[orgId]/members` → revokes a pending invite, removes a member → both update
7. Try `DELETE /api/orgs/[orgId]/members/[ownerMembershipId]` as the owner → 409 "can't remove the owner"

## Notes on the broader plan

This is the **Day 1** slice. The approved 7-day plan in `~/.claude/plans/hey-this-is-the-piped-finch.md` continues with:
- Day 2–3: multi-tenant orgs + team invites (Resend)
- Day 4–5: Electron menubar agent (active app, idle, paired to web account)
- Day 6: disclosed-randomized screenshots + vision analysis (OpenAI gpt-4o-mini vision); 48h image retention; never shown raw to managers
- Day 7: combined-signal stagnation detection (Blocked / Disengaged / Possibly dummying)

Build in plan order. Don't skip ahead until single-user works end-to-end.

## Deploy

The simplest path:

1. Push this directory to a new GitHub repo.
2. Import into Vercel.
3. Add env vars in the Vercel project settings (same as `.env.local`).
4. Add a second redirect URI on the GitHub OAuth app for your Vercel URL.
5. Deploy.
