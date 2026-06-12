# MARINA — Production deployment guide

This is the canonical runbook for taking MARINA from a working dev tree to a
running production deployment. Read it top-to-bottom the first time; after
that, the **Pre-flight checklist** section is the only one you need.

We deploy to Vercel + Neon Postgres. Other targets (Render, Fly, Railway) work
but aren't covered here.

---

## 1. Pre-flight checklist

Run these in order. Each step blocks the next.

- [ ] Latest `main` is green: `pnpm tsc --noEmit && pnpm build`
- [ ] `.env.production` filled per **Environment variables** below
- [ ] Database created on Neon, `DATABASE_URL` copied
- [ ] All OAuth apps created and callbacks pointed at the production domain
- [ ] DNS for the product domain pointed at Vercel
- [ ] DNS for the marketing site → same Vercel project (one domain serves both)
- [ ] `pnpm tsx --env-file=.env scripts/db-apply-pending.ts` run against the prod DB
- [ ] `vercel.json` cron secret matches the prod env
- [ ] Sentry project created, `SENTRY_DSN` set
- [ ] At least one early-bird code seeded (`scripts/seed-early-bird-codes.ts`)
- [ ] First org created in prod; smoke-tested via `/dev/login` (gated by `MARINA_ENABLE_DEV_LOGIN`)

After deploy:

- [ ] `https://your-domain/api/health` returns `200 OK` with `{ ok: true }`
- [ ] `/download` page loads and shows live download links
- [ ] Magic-link email lands in inbox (not spam)
- [ ] GitHub OAuth round-trips: sign in → dashboard
- [ ] Google OAuth round-trips and auto-syncs calendar
- [ ] Slack install OAuth completes from the integrations page
- [ ] First sync writes events into `github_events`
- [ ] Cron endpoints answer when called manually with the secret
- [ ] An invite email actually arrives and the link still works after 24 hours

---

## 2. Environment variables

The complete set, grouped by feature. Anything marked **REQUIRED** must be set
in production or the corresponding code path will throw.

### Core

| Var | Required | Note |
|---|---|---|
| `DATABASE_URL` | **yes** | Neon HTTP-compatible Postgres URL |
| `AUTH_SECRET` | **yes** | `openssl rand -base64 32` |
| `AUTH_URL` | **yes** | e.g. `https://app.marina.in` — used by NextAuth |
| `NEXT_PUBLIC_APP_URL` | **yes** | Public base URL the email + UI links point at |
| `MARINA_POLICY_VERSION` | yes | `v1` initially. Bump to force agents to re-accept ToS |
| `LOG_LEVEL` | no | `info` (default) / `debug` / `warn` / `error` |

### Identity / OAuth

| Var | Required when… | Note |
|---|---|---|
| `GITHUB_ID` / `GITHUB_SECRET` | always | Callback: `<AUTH_URL>/api/auth/callback/github` |
| `GOOGLE_SSO_CLIENT_ID` / `GOOGLE_SSO_CLIENT_SECRET` | for Google SSO | Callback: `<AUTH_URL>/api/auth/callback/google` |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | for Calendar | Callback: `<AUTH_URL>/api/connect/google/callback` |
| `MARINA_ENABLE_DEV_LOGIN` | dev only | Set to `1` to expose `/dev/login`. **Leave unset in prod.** |

### AI

| Var | Required | Note |
|---|---|---|
| `GROQ_API_KEY` | recommended | Cheap + fast. Used for narratives, briefs, perf reviews. |
| `OPENAI_API_KEY` | recommended | Fallback when Groq is down or rate-limited |
| `DEFAULT_AI_PROVIDER` | yes | `groq` or `openai` |
| `NEXT_PUBLIC_DEFAULT_AI_PROVIDER` | yes | Mirror of above for the client |

### Email

| Var | Required when… | Note |
|---|---|---|
| `RESEND_API_KEY` | always | Verified domain in Resend dashboard |
| `RESEND_FROM` | always | e.g. `MARINA <hello@marina.in>` |
| `SMTP_URL` *or* `SMTP_HOST` + `SMTP_PORT` + `SMTP_USER` + `SMTP_PASS` | optional | Routes weekly/daily digests through nodemailer SMTP. Falls back to Resend when unset. |
| `SMTP_FROM` | with SMTP | Defaults to `SMTP_USER` if unset |

### Slack

| Var | Required for Slack | Note |
|---|---|---|
| `SLACK_CLIENT_ID` / `SLACK_CLIENT_SECRET` | yes | Slack app OAuth credentials |
| `SLACK_SIGNING_SECRET` | yes | Verifies slash-command requests |

Slash command setup: `/marina` → `https://<your-domain>/api/slack/commands`.
Install URL: `https://<your-domain>/api/connect/slack/install?orgId=<id>`.

### Billing

| Var | Required for billing | Note |
|---|---|---|
| `RAZORPAY_KEY_ID` / `RAZORPAY_KEY_SECRET` | yes | From Razorpay dashboard |
| `RAZORPAY_TEAM_PLAN_ID` / `RAZORPAY_SCALE_PLAN_ID` | yes | Plan IDs created in Razorpay before launch |
| `RAZORPAY_WEBHOOK_SECRET` | yes | For the subscription-event webhook |

### Storage

| Var | Required | Note |
|---|---|---|
| `BLOB_DRIVER` | yes | `vercel_blob` in prod |
| `BLOB_READ_WRITE_TOKEN` | with vercel_blob | From Vercel Blob dashboard |

### Cron & observability

| Var | Required | Note |
|---|---|---|
| `CRON_SECRET` | yes | Vercel Cron sends `Authorization: Bearer <CRON_SECRET>` |
| `SENTRY_DSN` | yes | Server + client errors |
| `SENTRY_AUTH_TOKEN` | optional | For source-map uploads at build time |
| `NEXT_PUBLIC_MAC_DOWNLOAD_URL` / `NEXT_PUBLIC_WIN_DOWNLOAD_URL` | yes | Pointed at the latest signed installer |
| `NEXT_PUBLIC_AGENT_VERSION` / `NEXT_PUBLIC_AGENT_RELEASED_AT` | optional | Shown on `/download` |

---

## 3. Database setup

1. **Create the Neon project**, copy the pooled connection string into `DATABASE_URL`.
2. **Apply the full migration set** — this creates every table from scratch:
   ```bash
   DATABASE_URL="…" pnpm db:migrate
   ```
   This runs `drizzle/0000_*.sql` → `0006_*.sql` in order via the standard
   Drizzle migrator. Re-running it is a no-op after the journal is written.
3. **Seed early-bird codes** for design partners:
   ```bash
   DATABASE_URL="…" pnpm tsx scripts/seed-early-bird-codes.ts
   ```
4. **Verify** by reading any one of the new tables:
   ```bash
   psql "$DATABASE_URL" -c '\d teams; \d membership_managers; \d early_bird_codes'
   ```

### When to use `scripts/db-apply-pending.ts` instead

`db-apply-pending.ts` is a **recovery script**, not a fresh-install script.
Reach for it when:
- The drizzle journal got out of sync with the real DB (a column exists but
  the migrator thinks it doesn't, or vice-versa)
- A migration partially applied and you need to re-converge without resetting

It assumes the base tables (`memberships`, `orgs`, `users`, …) already
exist and only applies idempotent `ADD COLUMN IF NOT EXISTS` / `CREATE TABLE
IF NOT EXISTS` deltas on top. Running it against an empty DB fails with
`relation "memberships" does not exist` — that's a signal you wanted
`pnpm db:migrate` instead.

For future schema changes:

1. Edit `lib/db/schema.ts`
2. `pnpm db:generate` (produces a new `drizzle/00XX_*.sql`)
3. Deploy — Vercel's build runs `pnpm db:migrate` automatically before `next build`
4. Confirm the new column exists in the Neon SQL editor

---

## 4. Vercel project

```bash
vercel link     # Connect this repo to a Vercel project
vercel env pull # Pull existing env vars locally for debugging
```

### Build settings

The defaults work, but verify:

- **Build command:** `pnpm db:migrate && next build` (already in `vercel.json`)
- **Output directory:** `.next`
- **Install command:** `pnpm install --frozen-lockfile`
- **Node version:** 20.x (set in `package.json` engines if your team enforces)

### Cron jobs

`vercel.json` already declares the cron schedule:

| Path | Schedule (UTC) | What it does |
|---|---|---|
| `/api/cron/sweep` | every hour | Closes stale invites, magic-links, pairing codes, etc. |
| `/api/cron/calendar` | weekday business hours | Re-syncs calendars |
| `/api/cron/states` | 18:30 daily | Computes per-user daily state |
| `/api/cron/stories` | 19:00 daily | AI per-user daily story |
| `/api/cron/digest` | Monday 02:30 | CEO weekly digest |
| `/api/cron/digest/daily` | Tue–Sat 02:30 | Manager daily digest |

Vercel sends `Authorization: Bearer <CRON_SECRET>` on every call.

### Domains

- Add the apex (`marina.in`) and `app.marina.in` in the Vercel project
- Point the root A record at Vercel's IP and CNAME `app.` to `cname.vercel-dns.com`
- Verify TLS certificate issuance before flipping production traffic

---

## 5. Marketing + product on one project

We serve both surfaces from the same Next.js app — saves a deployment, keeps
the login redirect simple:

- `/` (landing), `/download`, `/setup-guide`, `/security`, `/privacy`, `/dpa`, `/terms` — public
- `/dashboard`, `/org/[orgId]/*`, `/settings/*` — auth required
- `/api/*` — mixed; each route guards itself

The middleware is configured in `auth.ts` via NextAuth; redirects unauthenticated
hits on protected routes back to `/`.

---

## 6. Smoke tests after deploy

Run these from a fresh browser session:

1. `https://your-domain/` loads the landing page with the 50 character grid
2. `https://your-domain/download` loads with the two platform cards
3. `https://your-domain/api/health` returns `{ ok: true, db: "ok" }`
4. Sign in with GitHub → arrives on `/pick` → picks character → lands on `/dashboard`
5. Owner creates a workspace → routed to `/org/[id]/setup/invite`
6. Sends an invite to a real email → email arrives within 30 seconds
7. Accepts the invite, becomes a member of the org
8. Opens the **Org chart** tab → sees both people, drags one onto another to set reports-to → relationship persists on refresh
9. Manager opens any blocker → sends a workaround suggestion → the blocked user's dashboard shows the coaching card within 30 seconds
10. Notification bell shows the suggestion as unread

If any step fails, **roll back via Vercel's instant rollback** (Dashboard → Deployments → previous → Promote to production), then debug.

---

## 7. Rollback procedure

We follow a no-drama rollback policy:

1. **App rollback** — Vercel → Deployments → previous → Promote. Takes seconds.
2. **DB rollback** — Drizzle migrations are forward-only. If a schema change broke prod, deploy a **forward migration that removes the column / table** rather than reverting. Never restore a backup on prod data older than the latest deploy unless you're explicitly OK with losing minutes of writes.
3. **Cron incidents** — pause the affected cron in `vercel.json` (move to a comment) and redeploy. Then fix and re-enable.

---

## 8. Day-2 ops

| Concern | Where it lives |
|---|---|
| Errors | Sentry dashboard |
| Cron failures | Vercel Cron tab + Sentry |
| Slow queries | Neon dashboard |
| AI cost | `lib/ai/budget.ts` — per-org monthly cap, default ₹5k worth of tokens |
| Email deliverability | Resend dashboard |
| Slack uninstalls | Check `orgs.slack_bot_token` is NULL |
| Billing webhooks | Razorpay dashboard → Webhooks → Recent deliveries |

### Common 200-line postmortems

- **Login loop after deploy** → `AUTH_URL` doesn't match the actual domain
- **All GH syncs failing** → users' OAuth tokens expired; the connect-flow refresh covers most, but a bulk re-auth email might be needed
- **Slack DMs silently dropping** → `slack_bot_token` was revoked; run the install OAuth again
- **Dashboard says "Configuration"** → see `app/auth/error/page.tsx` for the canonical mapping

---

## 9. What's NOT yet production-ready (and OK to ship without)

These are deliberately deferred — we ship without them and add them post-launch
based on early customer feedback:

- **Linux desktop agent** — Mac and Windows cover ~95% of remote-team employees
- **Self-serve plan downgrade** — currently requires emailing `hello@marina.in`
- **Mobile-optimised manager dashboard** — usable on tablets, cramped on phones
- **Audit-log export** — rows are written, but the export-to-CSV UI is pending

None of these block first revenue.

---

## 10. Versioning

We tag every production deploy:

```bash
git tag -a v2026.06.12 -m "Production deploy: teams + multi-manager + blocker coaching"
git push origin v2026.06.12
```

Tag the agent binary separately when it ships (`agent-v0.9.1`, etc.) — agent
and web are independent release tracks.

— Built with care in Bangalore. If something breaks, `hello@marina.in`.
