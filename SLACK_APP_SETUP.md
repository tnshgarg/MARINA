# MARINA Slack app — Phase 1 setup

Phase 1 makes MARINA's primary operations happen **inside Slack**: an App Home
tab ("your day" + manager pulse), modal forms for the core actions, "Ask Marina"
in a DM, and a morning brief posted to a channel — on top of the existing
`/marina` slash command and notification fan-out.

This document is the **one-time Slack app dashboard configuration** required to
turn it on. No code changes are needed beyond what's already shipped.

## 1. Code surfaces (already shipped)

| Surface | Endpoint / file |
|---|---|
| OAuth install / callback | `app/api/connect/slack/{install,callback}` |
| Slash commands (`/marina …`) | `app/api/slack/commands/route.ts` |
| **Events** (App Home, DMs) | `app/api/slack/events/route.ts` |
| **Interactivity** (buttons, modals, shortcuts) | `app/api/slack/interactivity/route.ts` |
| **Morning brief** cron | `app/api/cron/slack-brief/route.ts` (scheduled in `vercel.json`, 02:30 UTC weekdays) |
| App Home view | `lib/slack/home.ts` + `lib/slack/views.ts` |
| Ask Marina (DM) | `lib/slack/assistant.ts` |
| Domain actions | `lib/shifts/punch.ts`, `lib/breaks/create.ts`, `lib/leave/request.ts`, `lib/deliverables/create.ts` |

## 2. Slack app dashboard (api.slack.com/apps → your app)

Set `NEXT_PUBLIC_APP_URL` in the environment first (e.g. `http://localhost:3000`
in dev, `https://marina.team` in prod). All URLs below use that origin.

### Bot Token Scopes (OAuth & Permissions)
The install request already asks for these — make sure they're granted:
`chat:write`, `chat:write.public`, `commands`, `users:read`, `users:read.email`,
`im:write`, `im:history`, `app_mentions:read`, `channels:read`, `groups:read`.

> Adding `im:history` + `app_mentions:read` means any workspace that installed an
> earlier version must **re-install** (re-run Connect Slack) to grant them.

### App Home (Features → App Home)
- Enable the **Home Tab**.
- Enable **Messages Tab** and check *"Allow users to send Slash commands and
  messages from the messages tab"* (so DMs reach Ask Marina).

### Interactivity & Shortcuts
- Turn **Interactivity** ON.
- Request URL: `{NEXT_PUBLIC_APP_URL}/api/slack/interactivity`
- (Optional) Add global shortcuts with these **Callback IDs** to match the
  handlers: `log_work`, `request_leave`, `raise_blocker`.

### Event Subscriptions
- Turn **Events** ON.
- Request URL: `{NEXT_PUBLIC_APP_URL}/api/slack/events`
  (Slack will send a `url_verification` challenge — the endpoint echoes it.)
- Subscribe to **bot events**: `app_home_opened`, `message.im`, `app_mention`.

### Slash Commands
- `/marina` → Request URL `{NEXT_PUBLIC_APP_URL}/api/slack/commands` (already used).

### Redirect URLs (OAuth & Permissions)
- Add `{NEXT_PUBLIC_APP_URL}/api/connect/slack/callback`.
  **For local testing add the localhost one too**, or the install will fail.

## 3. Local testing note

Slack must reach your machine, so dev needs a public tunnel to `localhost:3000`
(e.g. `ngrok http 3000`) and the tunnel URL used for the three Request URLs +
`NEXT_PUBLIC_APP_URL`. Then: Connect Slack → open the MARINA app's Home tab →
the buttons open modals; DM the bot to Ask Marina.

## 4. What's verifiable without a workspace

- `tsc --noEmit` + `pnpm build` (type + build safety).
- `pnpm tsx scripts/test-slack-views.ts` (the pure Block Kit builders are valid).
- The endpoints reject unsigned requests (Slack signature verification) and
  answer the `url_verification` handshake.

Live DM/modal/Home behaviour needs a connected workspace (the one item the test
report flags as pending).

## 5. Not in Phase 1 (by design)

- Native Slack **Assistant API** thread UI — Ask Marina is a plain DM bot for now
  (simpler, fewer moving parts); upgrading to `assistant.threads.*` is a fast-follow.
- Per-user **DM** of the morning brief — Phase 1 posts the team brief to the
  default channel only (avoids 50 DMs/day until opt-in exists).
- The **surface/connector refactor** of the existing web/agent routes onto the
  new `lib/shifts|breaks|leave` helpers — that's Phase 2.
