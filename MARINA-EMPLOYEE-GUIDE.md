# MARINA — Employee Setup Guide

**Welcome to MARINA.** This guide walks you through setting up the MARINA
desktop agent on your work computer. It takes about **10 minutes** end-to-end
and only needs to be done once per device.

> **For HR / People teams:** print this page or share the PDF (export with
> ⌘P → "Save as PDF") with every new hire on day one. Everything below is
> employee-facing and assumes zero prior context.

---

## Why MARINA?

Your company uses MARINA so that:

1. **You get credit for what you ship.** The desktop agent watches your work
   activity (apps, focus time, breaks) and gives you a clear daily picture —
   so you never feel invisible.
2. **You don't have to write status updates.** MARINA drafts your "what I did
   today" from your real activity. Your manager sees the highlights without
   you typing them out.
3. **Standups stop wasting time.** Scrum Mode pre-fills everyone's
   yesterday/today/blocker, so the meeting takes 9 minutes instead of 25.
4. **You can ask for help in one click.** Blocked? Mark yourself blocked.
   MARINA pings the right teammate across in-app, Slack, and desktop, and your
   manager sees it instantly.

**What MARINA does NOT do:**
- It does not read your messages, emails, files, or browser history.
- It does not screenshot you unless you've explicitly opted in to screenshot
  evidence, which can be paused at any time from the settings.
- It does not run outside your defined working hours (you can pause anytime).

---

## Before you start

You'll need:

- A Mac (macOS 13 Ventura or later) **or** a Windows 10/11 PC.
- Your work email — the same one your HR used to invite you.
- About 10 minutes.

If you don't see an invite email yet, ask your manager to send you one from
the MARINA dashboard before continuing.

---

## Step 1 — Accept your invite (3 minutes)

1. Find the email titled **"You're invited to join \[Workspace] on MARINA"**.
2. Click **Open your workspace**.
3. Choose how you want to sign in:
   - **Continue with GitHub** (recommended for engineers)
   - **Continue with Google** (best if your company is on Google Workspace)
   - **Email magic link** (works for anyone — we'll email you a one-tap sign-in)
4. Pick a character avatar — this is how teammates will spot you across the
   product. You can change it anytime under **Settings → Profile**.
5. Fill in:
   - **Discipline** (Engineering, Design, Sales, Support, etc.)
   - **Job title** (e.g. "Senior Designer")
   - **Joining date** (so MARINA can wish you a work anniversary)
   - **Birthday** (optional — year is not stored, only month and day)

You're now on the **web dashboard** at `app.marina.in`. Keep it open in a tab;
we'll come back to it.

---

## Step 2 — Install the desktop agent (4 minutes)

The desktop agent is what tracks your focus time, lets you punch in / out,
mark breaks, and ship status updates. **It runs in the menubar / system tray
— no big window.**

### On Mac

1. Download **MARINA.dmg** from `https://marina.in/download/mac`.
2. Double-click the DMG and drag **MARINA.app** to **Applications**.
3. Open **Applications → MARINA**. macOS will ask:
   > "MARINA" is an app downloaded from the internet. Are you sure you want
   > to open it?

   Click **Open**.
4. Grant the two permissions MARINA needs:
   - **Accessibility** (so it can detect which app you're focused on).
     System Settings → Privacy & Security → Accessibility → toggle MARINA on.
   - **Screen Recording** (only used if you opt in to screenshot evidence
     later — otherwise you can leave it off).
5. You'll see the MARINA leaf icon in your menubar (top-right of the screen).

### On Windows

1. Download **MARINA-Setup.exe** from `https://marina.in/download/windows`.
2. Run the installer. Click **Yes** on the Windows Defender SmartScreen prompt
   (we're not yet on the Microsoft notarisation list — your IT team can
   allowlist us).
3. MARINA starts automatically. Look for the leaf icon in the system tray
   (bottom-right, next to the clock — click the **^** to expand).
4. Pin MARINA to the tray so it stays visible:
   right-click the tray area → Taskbar settings → expand "Other system tray
   icons" → toggle MARINA on.

---

## Step 3 — Pair the agent with your account (1 minute)

1. Click the MARINA leaf icon. The agent will say **"Not paired yet"**.
2. Click **Pair this device**. A 6-digit code appears (it expires in 5
   minutes).
3. Go back to the web dashboard tab (`app.marina.in`).
4. Open **Settings → Devices**.
5. Click **Pair new device**, type the 6-digit code, and hit **Pair**.
6. The agent will say **"Paired — welcome, [your name]"**. You're set.

---

## Step 4 — Your first day (2 minutes)

Right-click the leaf icon to see the full menu. The shortcuts that matter:

| Shortcut | What it does |
|---|---|
| **⌘⇧L** (Mac) / **Ctrl+Shift+L** (Win) | Mark work as done — quick deliverable log |
| **⌘⇧B** / **Ctrl+Shift+B** | Take a break (Coffee / Lunch / Personal / Blocked) |
| **⌘⇧P** / **Ctrl+Shift+P** | Pause tracking temporarily |
| **⌘⇧M** / **Ctrl+Shift+M** | Show today's meetings |
| **⌘⇧N** / **Ctrl+Shift+N** | Open notifications |
| **⌘⇧W** / **Ctrl+Shift+W** | Open MARINA on the web |
| **⌘↩** / **Ctrl+Enter** | Join your next meeting |
| **⌘⇧/** / **Ctrl+Shift+/** | Show all shortcuts |

Your daily rhythm:

1. **Morning** — Click **Punch in** in the agent (or just open your laptop —
   we'll auto-detect activity if you'd rather). You'll see your "Your day"
   card on the dashboard.
2. **During the day** — When you finish something worth showing, hit
   **⌘⇧L / Ctrl+Shift+L** and type one line. Examples: "Shipped login redesign",
   "Closed Hexagon deal · ₹14L MRR", "Pushed v2.1.0 to staging".
3. **If you're stuck** — Hit **⌘⇧B / Ctrl+Shift+B**, pick **Blocked**, and
   type who you're waiting on (e.g. "@arjun for staging creds"). Your manager
   gets notified.
4. **End of day** — Click **End shift** in the agent. MARINA auto-generates a
   daily story for you, which your manager can see (you can edit it).

---

## Step 5 — Optional but recommended

These take 2 minutes each and make MARINA way more useful:

### Connect Google Calendar

Settings → Integrations → **Connect Google Calendar**.

After this, MARINA shows your meetings in the agent, pre-fills standup
"meetings today" answers, and lets your manager schedule 1:1s with you
without leaving the product.

### Connect GitHub (engineers only)

Settings → Integrations → **Connect GitHub**.

After this, your PRs, commits, and code reviews automatically appear under
"What shipped today" without you typing anything.

### Set your working days

Settings → Profile → **Working days**.

If you don't work Saturdays, MARINA won't mark you "off" — it'll just know
that's a non-working day. Useful for hybrid schedules and 4-day weeks.

### Tell MARINA about quiet hours

Settings → Notifications.

Pick a "do not disturb" window. MARINA will queue notifications and deliver
them when you're back, instead of pinging you at 9pm.

---

## Troubleshooting

**The agent says "Disconnected".**
You may have changed networks or your laptop slept for a long time. Click
**Reconnect** in the agent menu, or quit and reopen MARINA. If the issue
persists, regenerate a pairing code from the web (Settings → Devices →
Revoke this device → Pair new device).

**MARINA isn't detecting which app I'm in (Mac).**
You probably didn't grant Accessibility permission. Go to System Settings →
Privacy & Security → Accessibility, find MARINA, toggle it OFF and then ON
(this is a macOS quirk — it doesn't apply until you toggle).

**MARINA isn't detecting which app I'm in (Windows).**
Make sure you didn't install the agent as a different Windows user. The
agent must run under your own Windows account, not "Administrator".

**I can't see my GitHub PRs in the dashboard.**
Two reasons this might happen:

1. You haven't connected GitHub yet — Settings → Integrations.
2. The PRs are in a GitHub org your company hasn't allowlisted. Ask your
   admin to add it under Workspace settings → "Tracked GitHub orgs".

**I want to pause tracking for an hour.**
Hit **⌘⇧P / Ctrl+Shift+P**. Pick a duration. MARINA will quietly stop
recording until then. No questions asked, no manager notification.

**I want to delete my data.**
Settings → Account → **Export my data** (you'll get a ZIP). Then
**Delete my account**. Your data is wiped within 30 days.

---

## What your manager sees

**Yes:**
- When you punched in / out
- How focused you were during your shift (focus %)
- What apps you used (categories, not titles by default)
- What you marked as done
- Whether you're currently working / paused / blocked / off
- Your meetings on shared calendars

**No:**
- The contents of your messages, emails, documents, or browser
- Window titles or URLs (unless you opted in)
- Screenshots (unless you opted in)
- Anything during pause / outside working hours

**Curious?** Settings → Account → **What my manager can see** shows the
exact rows your manager has access to right now, anytime.

---

## Help

- **Can't sign in?** Email `thetanishgarg@gmail.com` — we usually reply within an
  hour during IST business hours.
- **Found a bug?** Use the desktop agent menu → **Report an issue** — it
  attaches the relevant logs automatically.
- **Security questions?** `thetanishgarg@gmail.com`
- **Data / privacy questions?** `thetanishgarg@gmail.com`

We hope MARINA actually makes your work life better. If anything feels off,
tell us — we ship fixes weekly.

— The MARINA team
