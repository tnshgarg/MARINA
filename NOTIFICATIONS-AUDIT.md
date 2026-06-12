# Notifications Audit

Every channel a notification can travel over, and which events actually
reach each channel. Updated 2026-06-11.

## Channels

| Channel | What it is | Reach |
|---|---|---|
| **In-app bell** | `notifications` table row → popover in the org sidebar footer | Everyone signed into MARINA web |
| **Desktop OS** | Agent polls `GET /api/agent/notifications` → fires native OS notification | Anyone with the Mac/Windows agent paired |
| **Email** | `sendEmail()` via Resend | Anyone with an email on file |
| **Slack** | `notify()` event → org webhook → channel post | The org's chosen Slack channel |

The in-app row is the single source of truth. The agent fans the same rows
out to the desktop. Email + Slack are extra channels for high-priority events.

## Event coverage matrix

| Event | In-app | Desktop | Email | Slack | Notes |
|---|---|---|---|---|---|
| **Leave requested** | ✅ managers + owner | ✅ via agent | — | ✅ org channel | Fixed this round |
| **Leave decided** | ✅ employee | ✅ via agent | ✅ employee | ✅ org channel | |
| **Blocker started** (waitingOnUserId set) | — | — | — | ✅ org channel | P1 gap below |
| **Blocker pinged (original)** | ✅ person waited-on | ✅ via agent | — | ✅ org channel | Fixed this round |
| **Blocker resolved** | ✅ blocked employee | ✅ via agent | — | — | |
| **Blocker suggestion** | ✅ blocked employee | ✅ via agent | — | — | |
| **Blocker → help requested** (route-to) | ✅ helper | ✅ via agent | ✅ helper | ✅ org channel | **New** |
| **Meeting scheduled** | ✅ attendee | ✅ via agent | ✅ attendee | — | Calendar push when linked |
| **Break started** | — | — | — | ✅ org channel | Low priority — Slack only is fine |
| **Shift punched out** | — | — | — | ✅ org channel | |
| **Shift suspicious** | — | — | — | ✅ org channel | |
| **State blocked** (heuristic) | — | — | — | ✅ org channel | |
| **Stagnant break check-in** (cron) | — | — | — | ✅ org channel | |

✅ = wired ⏳ = roadmap — = intentionally skipped (too noisy)

## What changed this round

1. **Blocker pinged (original)** — Was Slack-only. Now also inserts an in-app
   row for the person being waited on, so the agent will fire a desktop ping
   on their machine. Slack channels people aren't in were silently dropping
   the most important notification on the platform.

2. **Blocker → help requested (route-to)** — New event entirely. Wires to all
   four channels: in-app for the helper, desktop ping via agent, email if we
   have an address, Slack with a custom red-tinted card.

3. **Leave requested** — Was Slack-only. Now also inserts in-app rows for every
   active manager/owner in the org so they see a bell badge + agent ping. The
   notification deep-links to `/org/[orgId]/leaves` for one-click triage.

4. **`/api/agent/notifications`** — New endpoint. The paired Mac/Windows agent
   polls it on its heartbeat cadence, fires a native OS notification for each
   unread row, then POSTs the IDs back to mark them shown. 24-hour lookback
   window so a long-offline agent doesn't flood the user on reconnect.

## Remaining gaps (roadmap)

- **Blocker started** — When an employee tags `category=blocked` with a
  waitingOnUserId, the waited-on person doesn't get pinged until the manager
  manually nudges them. We should auto-ping after 15 minutes if the blocker
  isn't resolved.
- **Meeting starting in 5 minutes** — Calendar reminder via the agent.
- **CEO digest delivery confirmation** — Today the digest cron sends email but
  doesn't write a bell row.
- **Notification preferences** — Per-user opt-out of low-priority categories
  (break-started Slack, etc.).
