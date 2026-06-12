# MARINA Agent API

Public contract for the desktop agent (macOS / Windows) to talk to the
MARINA backend. Update this doc *before* changing any of the routes below —
the agent depends on stable shapes.

## Auth

Every request must carry a bearer token from `agent_tokens`:

```
Authorization: Bearer <agent_token>
```

The token is minted once during pairing (`POST /api/agent/pair`) and persists
in the agent's keychain. It scopes every request to a single `user_id`; the
agent cannot impersonate other users even on its own machine.

## Endpoints (existing)

| Method | Path | Purpose |
|---|---|---|
| `POST` | `/api/agent/pair` | One-time pairing using a 6-digit code |
| `POST` | `/api/agent/heartbeat` | Liveness + config pull (called every 30s) |
| `POST` | `/api/agent/events` | Batched local-activity windows |
| `POST` | `/api/agent/screenshots` | Screenshot upload (mime, jpeg) |
| `POST` | `/api/agent/shifts/in` | Punch in |
| `POST` | `/api/agent/shifts/out` | Punch out + work summary |
| `POST` | `/api/agent/breaks` | Start a pause (categories incl. `blocked`, `meeting`, `lunch`, `focus`) |
| `GET`  | `/api/agent/breaks/active` | Current active break, if any |
| `POST` | `/api/agent/breaks` | **Mark blocked** — same endpoint, `category: 'blocked'`. Fires manager notifications instantly. |
| `POST` | `/api/agent/pause` | Toggle tracking pause |
| `GET`  | `/api/agent/team` | Roster autocomplete for the break dialog's "waiting on" field |
| `POST` | `/api/agent/leaves` | File a leave request |
| `GET`  | `/api/agent/notifications` | Unread in-app notifications for the agent to render as desktop notifications |
| `POST` | `/api/agent/notifications` | Mark IDs as shown (so the bell badge clears + they don't fire twice) |

## Endpoints (new — feature parity with web)

### `GET /api/agent/day`

Real-time "Today" panel feed. Same shape as the web's
`/api/me/day-snapshot`. Poll every 60s.

**Response**
```json
{
  "punchedIn": true,
  "shiftStartedAt": "2026-06-11T09:14:00.000Z",
  "productivity": 73,
  "focusMinutes": 218,
  "totalShiftMinutes": 298,
  "deliverablesToday": 2,
  "meetingsRemainingToday": 1,
  "nextMeetingAt": "2026-06-11T16:30:00.000Z",
  "nextMeetingTitle": "1:1 with Priya",
  "activeBreak": null
}
```

`activeBreak` is non-null while the user has an open pause:
```json
"activeBreak": {
  "id": 42,
  "reason": "Quick coffee — back in 10",
  "category": "other",
  "startedAt": "…",
  "minutesAgo": 7
}
```

When `punchedIn === false`, every other field defaults to 0/null. Render
"Off-clock — punch in to start your day" with a primary CTA.

### `GET /api/agent/meetings/today`

Full list of today's meetings. Use to render a calendar panel + schedule
"meeting in 5 minutes" desktop notifications.

**Response**
```json
{
  "meetings": [
    {
      "id": 91,
      "title": "Engineering standup",
      "startAt": "2026-06-11T09:30:00.000Z",
      "endAt":   "2026-06-11T09:45:00.000Z",
      "conferenceUrl": "https://meet.google.com/abc-defg-hij",
      "rsvpStatus": "accepted",
      "isLive": false,
      "isPast": true
    }
  ]
}
```

The agent should pre-schedule a local OS notification for each future meeting
5 minutes before `startAt`. Reschedule on every poll so cancellations propagate.

## Endpoints (new — for the "Mark work as done" feature)

### `POST /api/agent/deliverables`

Self-logged "I just shipped X". The web equivalent (`/api/me/deliverables`)
shares the same validation via `lib/deliverables/create.ts` so the two
surfaces never drift.

**Request body**

```json
{
  "title": "Shipped onboarding redesign v2",
  "url":   "https://figma.com/file/abc"
}
```

| Field | Required | Notes |
|---|---|---|
| `title` | yes | 10–200 chars. <10 rejected with 400 (forces a real sentence, not "done") |
| `url` | no | Must start with `http://` or `https://`. Max 500 chars |
| `kind` | no | Discipline hint: `design`, `deal`, `ticket`, `doc`, `task`, etc. Max 40 chars |
| `detail` | no | Longer notes. Max 1000 chars |

The agent should NOT send `completedAt` — the server uses "now". This
prevents back-dated logs from the agent, which would defeat the screenshot
pin.

**Success — 200**

```json
{
  "ok": true,
  "deliverable": {
    "id": 42,
    "title": "Shipped onboarding redesign v2",
    "url":  "https://figma.com/file/abc",
    "kind": null,
    "detail": null,
    "completedAt":  "2026-06-11T14:32:00.000Z",
    "pinnedShotAt": "2026-06-11T14:32:00.000Z",
    "verificationStatus": "unverified"
  }
}
```

**`pinnedShotAt`** is the timestamp the verification cron will use to locate
the screen capture corresponding to this claim. The agent should display
this in the success toast as:

> ✓ Logged. Pinned for verification at **2:32 PM**.

That single line communicates: "we recorded what was on your screen at the
moment you logged this, for honest cross-checking later." It's the cultural
contract that keeps self-reporting trustworthy.

**Errors**

| Status | When | Body |
|---|---|---|
| 400 | Title <10 chars or URL malformed | `{ "error": "<message>" }` |
| 401 | Missing / bad agent token | `{ "error": "unauthorized" }` |
| 409 | Identical title logged in the last 4 hours | `{ "error": "<message>", "duplicateOf": <id> }` |
| 429 | Rate limited (heartbeat bucket) | `{ "error": "rate limited" }` + `Retry-After` header |

On 409 the agent should NOT retry — show the existing deliverable to the
user and let them decide. Honoring 409 is what prevents accidental double-
logs from agent + web fired in quick succession.

## What the agent UI should look like

Per the design discussion that led to this endpoint:

- **Menubar item**: "Mark work as done…" (plus a global hotkey, e.g. ⌘⇧L on Mac)
- **Popover** on click:
  - Single-line text field for title (autofocus). Counter shows `10 / 200`
  - Optional URL field (autocomplete from clipboard if it looks like a link)
  - Primary button: **Mark done**
  - Esc to cancel
- **On success**: 3-second toast "✓ Logged. Pinned for verification at 2:32 PM." then auto-close popover
- **On 409**: replace the toast with "Looks like you already logged this. [Open in MARINA]"

Do NOT build:
- A list of past deliverables in the agent. Web is the place for that.
- Edit/delete from the agent. Honesty trail.
- Tagging teammates from the agent. Belongs in web.
- Auto-suggestions ("we noticed you're in HubSpot…"). Too magical for v1.

## Compatibility commitments

- The shapes above are guaranteed stable. New optional fields may be added;
  removals or renames will go through a new versioned path
  (`/api/agent/deliverables/v2`).
- The agent should tolerate unknown fields in the response (forward-compat).

---

## Menubar app spec — what the desktop UI must look like

The goal: a desktop user **never has to open the browser** to do anything an
employee normally does on the web. Keyboard-first. Hotkeys shown next to every
menu option. Same conventions on macOS and Windows (modifier differs).

### Menubar icon (Mac status bar / Windows tray)

Click to open a popover with the **Today panel** (live from `/api/agent/day`)
and a list of actions below it.

```
┌─────────────────────────────────────────────────┐
│ Tanish Garg                              · Off  │  ← state pill, color-coded
│ 73% productive · 3h 38m focused · 1 meeting left│  ← live KPI line
│ ▓▓▓▓▓▓▓▓▓▓▓▓▓▓░░░░░  73%                       │  ← focus bar
│                                                 │
│ Next: 1:1 with Priya at 4:30 PM    ⌘⏎ Join meet │
├─────────────────────────────────────────────────┤
│ ✓ Mark work as done…                       ⌘⇧L │
│ ☕ Take a break…                            ⌘⇧B │
│ ⏸  Pause tracking                           ⌘⇧P │
│ 🌴 Request leave…                           ⌘⇧V │
├─────────────────────────────────────────────────┤
│ 🕘 Today's meetings                         ⌘⇧M │
│ 🔔 Notifications (3)                        ⌘⇧N │
│ 📦 Recent deliverables                      ⌘⇧R │
│ 👥 Team status                              ⌘⇧T │
├─────────────────────────────────────────────────┤
│ ⚙  Open MARINA web                          ⌘⇧W │
│ ⚙  Settings…                                ⌘⇧, │
│ ⌨  Keyboard shortcuts                       ⌘⇧/ │
│ Sign out                                        │
└─────────────────────────────────────────────────┘
```

**Rendering rules**:
- Every menu item that has a hotkey shows it right-aligned in dim grey.
- On Windows, replace `⌘` with `Ctrl`. Everything else stays the same.
- Greyed-out items when the user can't perform them yet (e.g. "Take a break"
  greyed while already on a break — replace with "End break").
- The top "Today panel" stays visible even when interacting with the menu.

### Hotkey conventions

| Action | macOS | Windows | Endpoint hit |
|---|---|---|---|
| Mark work as done | ⌘⇧L | Ctrl+Shift+L | `POST /api/agent/deliverables` |
| Take a break | ⌘⇧B | Ctrl+Shift+B | `POST /api/agent/breaks` |
| Pause tracking | ⌘⇧P | Ctrl+Shift+P | `POST /api/agent/pause` |
| Request leave | ⌘⇧V | Ctrl+Shift+V | `POST /api/agent/leaves` |
| Today's meetings | ⌘⇧M | Ctrl+Shift+M | `GET /api/agent/meetings/today` |
| Notifications | ⌘⇧N | Ctrl+Shift+N | `GET /api/agent/notifications` |
| Recent deliverables | ⌘⇧R | Ctrl+Shift+R | `GET /api/me/deliverables` (cookie or token) |
| Team status | ⌘⇧T | Ctrl+Shift+T | `GET /api/agent/team` |
| Open MARINA web | ⌘⇧W | Ctrl+Shift+W | (opens browser) |
| Settings | ⌘⇧, | Ctrl+Shift+, | (local pane) |
| Show all hotkeys | ⌘⇧/ | Ctrl+Shift+/ | (local pane) |
| Join next meeting | ⌘↩ | Ctrl+Enter | (opens `conferenceUrl`) |

All hotkeys are user-customisable in Settings → Shortcuts. Don't hard-code.

### Feature parity matrix — web vs agent

| Feature | Web | Agent | Notes |
|---|---|---|---|
| Punch in / out | yes | yes | `POST /api/agent/shifts/{in,out}` |
| Mark work as done | yes (`/dashboard` card) | yes (⌘⇧L popover) | shared validation via `lib/deliverables/create.ts` |
| Take a break (incl. blocked) | yes (`/dashboard`) | yes (⌘⇧B dialog with `waitingOn` autocomplete) | autocomplete uses `GET /api/agent/team` |
| End active break | yes | yes | `POST /api/agent/breaks/active` |
| Request leave | yes | yes | `POST /api/agent/leaves` |
| Today's meetings list | yes (MeetingsPanel) | yes (⌘⇧M list) | `GET /api/agent/meetings/today` |
| Pre-meeting reminder | (web shows live pill) | yes (5min OS notification) | scheduled locally from meeting list |
| In-app notifications | yes (bell) | yes (OS toast) | `GET /api/agent/notifications` |
| Today's productivity % | yes (Your Day card) | yes (Today panel) | `GET /api/agent/day` |
| Daily story narrative | (in Deep dive) | (skip — too long for menubar) | available on web only |
| GitHub sync | yes | (skip — engineering-only, low value in menubar) | web only |
| Team status / blockers | yes (org dashboard) | read-only quick view (⌘⇧T) | `GET /api/agent/team` |
| Settings | yes (`/settings`) | local Settings pane | shortcut customisation + agent prefs |
| Manager features (resolver, scrum) | yes | (skip) | web only — managers will use web for these |
| Mark notification as shown | (auto on bell click) | yes (after toast) | `POST /api/agent/notifications` `{shownIds}` |

**The principle**: anything an employee does day-to-day must be available in
the agent. Manager rituals (resolving blockers, running scrum, configuring
the org) stay on the web — that's where the screen real estate exists.

### Cross-platform notes

- Polling cadence: `/api/agent/heartbeat` every 30s; `/api/agent/day` and
  `/api/agent/notifications` every 60s; `/api/agent/meetings/today` once on
  open + on every wake-from-sleep.
- All endpoints share the `heartbeat` rate-limit bucket — if the agent gets
  a 429, back off exponentially (cap at 5 min).
- Notification dedup: the agent must track `shownIds` locally so that if a
  POST `/api/agent/notifications` write fails (network blip), the same alert
  doesn't fire again on next poll. Retry the POST until it succeeds.
- Time formatting: respect the OS locale for clock display. Internally
  always work in UTC + ISO 8601.
- Both platforms must support the `marina://` URL scheme for deep links from
  emails ("Open in MARINA agent → Mark this blocker resolved").

