# GitHub App setup — reliable org repo tracking

The per-user OAuth approach can't see a private org's repos (org third-party
policies + SSO block it). The **GitHub App** is the fix: the org admin installs
it once, picks repos, and MARINA reads those repos' commits + PRs server-side —
private repos included — attributing each to the teammate who authored it.

You create the App **once** (it's reusable across all customer orgs). Then each
customer org installs it and selects their repos.

---

## 1. Create the GitHub App (one time)

1. github.com → your profile → **Settings → Developer settings → GitHub Apps → New GitHub App**
   (or do it under the **marina-dummy org** → Settings → Developer settings if you want it org-owned).
2. Fill in:
   - **GitHub App name**: `MARINA Tracker` (the slug becomes `marina-tracker` — note it).
   - **Homepage URL**: your app URL (e.g. `https://app.marina.in`).
   - **Setup URL**: `https://<your-domain>/api/github/app/callback`
     and **check "Redirect on update"** (so reconfiguring repos re-binds the install).
   - **Webhook**: **uncheck "Active"** for now (we poll; webhooks can be added later).
3. **Repository permissions** (read-only is enough):
   - **Contents**: Read-only  ← needed to read commits
   - **Pull requests**: Read-only
   - **Metadata**: Read-only (auto-selected)
4. **Where can this GitHub App be installed?**: **Any account** — REQUIRED.
   > ⚠️ If you pick *"Only on this account"*, the install screen will only ever offer your
   > **personal** account (you'll see just personal repos, never your orgs). To install on an
   > org like `marina-dummy`, the App MUST be **"Any account"**. If you already created it as
   > "Only on this account", go to the App's settings → **Advanced / "Make public"** (or the
   > install-target setting) → switch to **Any account** → Save.
5. Click **Create GitHub App**.
6. On the App page:
   - Note the **App ID** (a number near the top).
   - Scroll to **Private keys → Generate a private key** → downloads a `.pem` file. Keep it safe.

---

## 2. Set environment variables

Add these to your **Vercel Production env** (Settings → Environment Variables) and to
local `.env` if you want to test locally:

```
GITHUB_APP_ID=123456
GITHUB_APP_SLUG=marina-tracker          # from the App's URL: github.com/apps/<slug>
GITHUB_APP_PRIVATE_KEY="-----BEGIN RSA PRIVATE KEY-----\n....\n-----END RSA PRIVATE KEY-----\n"
```

> The private key is multi-line. Paste the **whole** `.pem` (BEGIN/END lines included).
> MARINA self-heals the formatting at runtime: real newlines, literal `\n` escapes, **and**
> the case where an env-var UI (Vercel included) flattens the newlines into spaces — all are
> repaired before signing. Locally you may also point `GITHUB_APP_PRIVATE_KEY` at a path to
> the `.pem` file.
>
> ⚠️ **This was the bug.** A PEM whose newlines got stripped fails to parse with the opaque
> `DECODER routines::unsupported`, the App JWT is never made, and every sync silently reports
> "0 repos · 0 events". If you see that, it's almost always the key — run the diagnostic below.

No redeploy logic needed — the app reads these at runtime.

---

## 3. Install it on an org (per customer)

1. As an **admin** of the workspace, go to **Settings → Integrations** in MARINA.
2. Click **Install GitHub App**. You'll land on GitHub's install screen.
3. Choose the org (e.g. **marina-dummy**), pick **Only select repositories** → choose
   `test-web` (or *All repositories*), and **Install**.
4. GitHub redirects back to MARINA's integrations page; the App is now **Installed**, and a
   first sync runs automatically.
5. Click **Sync now** any time to pull again. It reports `repos · new events · unlinked authors`.

---

## 4. Map activity to people

The App reads the repos, but to show "Priya pushed X" we map each commit/PR author to a
MARINA user by GitHub identity. So each teammate clicks **Link my GitHub** (the per-teammate
card on the same Integrations page) once. Anyone not linked shows up as an "unlinked author"
in the sync result — link them and re-sync.

---

## 5. Verify quickly (before relying on it)

With a token that can see the org, the standalone verifier proves the data is reachable:

```bash
GITHUB_TOKEN=<PAT with repo+read:org> GH_ORG=marina-dummy pnpm tsx scripts/gh-verify.ts
```

Once the App is installed, **Sync now** is the real end-to-end test — it should report
commits from `marina-dummy/test-web` and they'll appear in the org's Activity feed.

---

### Troubleshooting

**"Sync says 0 repos · 0 events" (the most common one).**
Run the diagnostic — it talks to GitHub directly and tells you exactly where it breaks
(key won't parse / App not installed / which account / how many repos):
```bash
pnpm tsx scripts/gh-app-diag.ts                 # uses .env
ENV_FILE=.env.production pnpm tsx scripts/gh-app-diag.ts
```
If it prints `JWT sign : FAILED` your private key is malformed — re-check it's the full PEM.
If it lists repos but **Sync now** still inserts 0, the commit authors aren't linked to MARINA
users yet (the sync result now names the unlinked authors — have them click **Link my GitHub**).

**"It only lets me select personal repos / my orgs aren't listed."**
The App is set to *"Only on this account"*. Switch it to **"Any account"** (App settings →
make it public / install-target). Then re-open the install link — you'll get an **account
picker**; choose your **org** (e.g. `marina-dummy`), then **Only select repositories → test-web**.
(You also need to be an **owner** of that org, or an org member allowed to install apps.)

**"No Install button in MARINA at all."**
The deployment doesn't have the App env vars loaded. Set `GITHUB_APP_ID` /
`GITHUB_APP_PRIVATE_KEY` / `GITHUB_APP_SLUG` and **restart** the server (env is read at boot).

---

### Future: real-time webhooks (optional)
To get instant updates instead of polling, re-enable the App's Webhook (URL
`https://<domain>/api/github/app/webhook`, set a secret) and we'll add a webhook handler that
writes `push` / `pull_request` events as they happen. Polling via **Sync now** / the team-sync
cron is fine to launch with.
