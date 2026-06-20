/**
 * Product knowledge injected into the Marina AI chat assistants so they can
 * answer "how do I…", "what is…", "where do I…", "can Marina…" questions about
 * the product itself — not just the team-data context. Keep this in sync as
 * features ship; it mirrors the Help center (/help) and Setup Guide.
 */
export const PRODUCT_KNOWLEDGE = `MARINA — WHAT IT IS AND HOW IT WORKS
Use this to answer questions about the product itself (features, how-to, "where do I…"). For questions about specific team data (hours, who shipped what, who's blocked, leaves, meetings), use the JSON team/employee context instead.

Marina is an AI chief of staff for remote teams. It works across three surfaces that stay in sync: the web dashboard, Slack, and an optional macOS desktop agent.

DESKTOP AGENT (Setup Guide): a tiny menubar app that tracks focus time automatically, so shifts and the daily story write themselves. Get it from the Download page (marina.team/download) or the in-app Setup Guide (/setup-guide). It's an independent build, so on first launch you right-click Marina → Open (it's unsigned for now). Pair it using the 6-digit code under Settings → Devices. It's optional — standups, kudos, leave and everything else work without it. You can pause tracking or revoke a device anytime; it never records keystrokes or screen contents, and only during a shift.

DAILY STANDUPS: async. Marina pre-drafts "yesterday" from real activity; you add today's plan + any blockers. File it on the web (the "Today's standup" card on your dashboard) or in Slack (/marina standup, or the button in Marina's morning reminder DM). Managers run "Scrum mode" — a projection-friendly, keyboard-driven walk through the team's standups.

BLOCKERS: flag when you're stuck and who you're waiting on (a teammate or someone external). Web: the Blockers page. Slack: /marina blocker <reason>, or "Raise blocker" on the App Home (which now has a teammate picker). Managers clear them from the Blockers queue.

TIME OFF, ATTENDANCE & BREAKS: request leave on the web (Time off) or with /marina leave; managers approve/deny in one click, including from Slack. Attendance is auto-tracked — request a "regularization" to fix a mistake. Breaks: /marina off [reason] to start, /marina back to end.

RECOGNITION (KUDOS): thank a teammate. Web: the "Give recognition" card on your dashboard, or the Recognition page (Culture → Recognition for managers). Slack: /marina kudos, or the "Give kudos" button on the App Home. Marina posts a card to the announcements channel (#all-marina) and the recipient's inbox.

ANNOUNCEMENTS: managers post a team-wide update. Web: the Announcements page (Culture → Announcements). Slack: /marina announce <message>. It lands in #all-marina, everyone's inbox, and the dashboard feed.

CELEBRATIONS: Marina automatically posts birthdays and work anniversaries to the announcements channel. Set a teammate's birthday/joining date on their profile so it can remind everyone.

MORNING BRIEF & WEEKLY DIGEST: every weekday Marina sends managers a ~4-minute brief (in-app + Slack) — who's on, who's blocked, what shipped — and a weekly digest.

SLACK: two channels — an announcements channel (#all-marina) for kudos / announcements / celebrations / brief, and a scrum channel for standups. Managers set both under Integrations → Slack. Commands: /marina status, in, out, done <work>, blocker <reason>, off, back, leave, standup, kudos; managers also get announce, pulse, blockers, nudge @teammate.

GITHUB: connect it so Marina attributes commits, PRs and reviews automatically — that's how engineering work becomes visible. Add your GitHub username in Settings.

HELP: full guides are in the Help center at /help, and there's a printable Setup Guide at /setup-guide for onboarding new hires.

PRIVACY: the agent only tracks during a shift (never off the clock or paused), never keystrokes or screen contents. Managers see only the people they manage, scoped by the org chart.

If a how-to isn't covered above, point the person to the Help center (/help) rather than guessing.`
