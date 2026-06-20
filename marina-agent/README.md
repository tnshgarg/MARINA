# Marina — desktop agent (macOS + Windows)

The cross-platform menubar / system-tray agent for [Marina](../marina). Runs silently, samples a small amount of activity every 30 seconds, batches into 5-minute windows, and uploads to your organization's dashboard.

Active-window detection is platform-specific: macOS uses the native `active-win` (needs Accessibility permission for titles); Windows uses a hidden PowerShell + Win32 `GetForegroundWindow` call (no native addon, no extra permissions). Idle / locked state uses Electron's cross-platform `powerMonitor`.

## What it collects

- **Active app name** (e.g. `Code`, `chrome`, `slack`).
- **Active / idle / locked time** (working, on-but-away, or screen-locked).
- **Foreground window title** — **off by default**. Only enabled if the user explicitly toggles it on in the web app's `/settings` page.
- **Disclosed-randomized screenshots** of the primary display — 2–4 per hour at uniformly random times. The menu-bar glyph flashes `◉` for 1.5 seconds at the moment of capture so it is always visible, never covert. Downscaled to 1280px wide, JPEG q70 (~150 KB). Skipped automatically while a video-call app is in the foreground (Zoom, Teams, FaceTime, Webex, Meet, BlueJeans).

## What it never collects

- File contents, keystrokes, mouse coordinates.
- Anything while tracking is paused. Paused state is sacred — sampler stops, shotter stops, in-flight uploads are discarded server-side, queue is not flushed.
- Screenshots while a video call is in foreground (avoids capturing customer / colleague faces).

## Architecture

```
src/main/
├── index.ts        // app lifecycle, single-instance, login-item
├── config.ts       // defaults + store-key constants
├── store.ts        // electron-store + safeStorage-encrypted token
├── state.ts        // central EventEmitter bus
├── api.ts          // bearer-authed HTTPS client
├── sampler.ts      // 30s active-win + powerMonitor tick
├── uploader.ts     // 5-min batched flush, durable queue, exp backoff
├── shotter.ts      // 2-4 captures/hour at random offsets, video-call skip
├── heartbeat.ts    // 60s config sync (paused, intervals, win-titles)
├── tray.ts         // menubar icon + menu, camera flash
├── consent.ts      // first-run consent gate (BrowserWindow)
├── pairing.ts      // 8-char code pairing flow
├── preload-*.ts    // contextBridge surfaces for the two windows
src/renderer/
├── consent.html
└── pairing.html
```

## Security

- The bearer token is generated server-side as 32 random bytes, prefixed `mka_`. The server stores only its SHA-256 hash.
- On the agent, the plaintext token is encrypted via Electron's `safeStorage` (Keychain-backed on macOS) and persisted as base64 ciphertext.
- Pairing codes are 8 characters from a 32-char base32-ish alphabet (≈40 bits of entropy), single-use, expiring in 10 minutes. Stored as SHA-256 hash server-side.
- Revoking a device from `/settings` instantly causes the server to reject the token; the agent surfaces this in the tray and stops uploading.

## Reliability

- The upload queue is persisted on disk via electron-store, so samples survive crashes and offline periods (capped at 5000 batches ≈ 17 days of full-time coverage).
- Failed uploads back off with jitter (5s → 60s ceiling).
- Heartbeat re-checks paused state + config every 60s, so server-side toggles propagate within a minute.
- `before-quit` flushes the sampler window and drains the upload queue before exiting.

## Run it (dev) — full step-by-step

**Prerequisites**

- macOS (Apple Silicon or Intel)
- Node.js **20.9+** (`node -v`)
- pnpm 9+ (`pnpm -v`)
- The web app already running and reachable at e.g. `http://localhost:3000`

**One-time setup** — install dependencies. This downloads Electron (~200 MB)
and compiles the `active-win` native module. Allow it ~2 minutes:

```sh
cd marina-agent
pnpm install
```

**Launch the agent**

```sh
# Point it at your web app — defaults to http://localhost:3000 if unset
MARINA_SERVER_URL=http://localhost:3000 pnpm dev
```

`pnpm dev` runs `tsc` → copies `src/renderer/*.html` → launches Electron from
`dist/main/index.js`. On success you'll see the **MARINA** consent window
appear and the `● MARINA` glyph in your menu bar.

**First-run flow** (≈30 seconds end-to-end):

1. **Consent window** opens → click "I understand and consent". This records
   your acceptance with timestamp + agent version.
2. **Pairing window** opens. The Server URL is pre-filled.
3. In a browser, open `http://localhost:3000/settings` while signed in →
   click **Generate pairing code**. An 8-character code appears.
4. Copy and paste the code into the pairing window, confirm device label,
   click **Pair**.
5. The window closes; the menu bar status becomes `● MARINA` (active). Open
   the **Today** panel on the personal `/dashboard` — within 5 minutes the
   first batch arrives.

**Common gotchas**

- *"Permission denied" / can't read foreground app* — macOS will pop a system
  dialog asking to grant **Accessibility** access to Electron. Approve in
  *System Settings → Privacy & Security → Accessibility*, then restart the
  agent. The screenshot feature additionally needs *Screen Recording*.
- *Electron download blocked* — corporate firewall? Set
  `ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/` before
  `pnpm install`.
- *"Cannot find module './dist/main/index.js'"* — you ran `electron .`
  before TypeScript built. Use `pnpm dev` (which builds first) or run
  `pnpm build` once.
- *Pairing code says invalid / expired* — codes live for 10 minutes and are
  single-use. Generate a fresh one from `/settings`.

**Verifying it works without Electron** — you can probe the agent endpoints
manually:

```sh
# 1. Generate a code from /settings in the browser, then exchange it:
curl -X POST http://localhost:3000/api/agent/pair/complete \
  -H 'content-type: application/json' \
  -d '{"code":"ABCDEFGH","label":"Test","platform":"darwin","agentVersion":"0.1.0"}'

# 2. Use the returned token to heartbeat:
curl -X POST http://localhost:3000/api/agent/heartbeat \
  -H "Authorization: Bearer mka_..." \
  -H "Content-Type: application/json" \
  -d '{"agentVersion":"0.1.0"}'
```

## Build a release `.dmg`

```sh
pnpm dist
```

Produces `release/Project MARINA-0.1.0-arm64.dmg` (and x64). Not code-signed — for production you'd add an Apple Developer cert.

Note: `active-win` requires Accessibility permission on macOS. The first time it tries to read the foreground window, macOS will prompt the user. The agent surfaces missing-permission errors in the tray under the status line.

## Triggering pause / resume

Two equivalent paths:

- **From the agent**: tray menu → "Pause tracking". Calls `POST /api/agent/pause` with token auth; locally stops the sampler immediately and flushes any in-flight window.
- **From the web app**: `/settings` → "Pause tracking" toggle. The agent picks it up on the next heartbeat (≤60s) and stops sampling.

Either way the same `user_settings.tracking_paused_at` column is the source of truth — the agent reconciles to it.

## What the tray shows

- `● MARINA` — active, last sync recent
- `◉ MARINA` — momentarily flashed (~1.5s) when a screenshot was just captured
- `⏸ MARINA` — paused (locally or by the web toggle)
- `◌ MARINA` — not paired yet
- `! MARINA` — last operation surfaced an error; menu item shows the message

## macOS permissions

Two prompts will appear on first capture / sample:

1. **Accessibility** — required by `active-win` to read the foreground app name.
2. **Screen Recording** — required by Electron's `desktopCapturer` to capture the screen.

If you accept neither, the agent still runs and the heartbeat still works, but samples/captures will be empty until permission is granted (System Settings → Privacy & Security).
