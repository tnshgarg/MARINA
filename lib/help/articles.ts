/**
 * Help-centre content. Structured (not MDX) so it renders through one template
 * and stays easy to edit. Each article is a list of typed blocks.
 */
export type Block =
  | { type: 'p'; text: string }
  | { type: 'h'; text: string }
  | { type: 'ul'; items: string[] }
  | { type: 'steps'; items: string[] }
  | { type: 'tip'; text: string }

export type Category = 'Getting started' | 'For employees' | 'For managers' | 'Privacy'

export type Article = {
  slug: string
  title: string
  summary: string
  category: Category
  minutes: number
  blocks: Block[]
}

export const CATEGORY_ORDER: Category[] = ['Getting started', 'For employees', 'For managers', 'Privacy']

export const ARTICLES: Article[] = [
  {
    slug: 'what-is-marina',
    title: 'What is Marina?',
    summary: 'Your team’s AI chief of staff — what it does and how the pieces fit together.',
    category: 'Getting started',
    minutes: 3,
    blocks: [
      { type: 'p', text: 'Marina is an AI chief of staff for remote teams. It quietly keeps track of who’s working on what, surfaces blockers before they fester, and handles the day-to-day admin — standups, time off, attendance, recognition — so managers can lead and teammates can focus.' },
      { type: 'h', text: 'The three pieces' },
      { type: 'ul', items: [
        'The web dashboard — your personal console (punch in, log work, file a standup, give kudos) and, for managers, the team views.',
        'The desktop agent — an optional macOS app that tracks your focus time automatically so you never have to log hours by hand.',
        'Slack — Marina lives in Slack too: punch in, post standups, raise blockers and recognize teammates without leaving your chat.',
      ] },
      { type: 'p', text: 'Everything stays in sync. A standup you post in Slack shows up on the dashboard; kudos you give on the web appears in your #all-marina channel.' },
      { type: 'tip', text: 'New here? Start with “Setting up the desktop agent” and “Using Marina in Slack” — that’s 90% of getting value on day one.' },
    ],
  },
  {
    slug: 'set-up-desktop-agent',
    title: 'Setting up the desktop agent',
    summary: 'Download, pair, and understand what the agent tracks (and what it doesn’t).',
    category: 'Getting started',
    minutes: 4,
    blocks: [
      { type: 'p', text: 'The Marina desktop agent runs quietly on your Mac and records your focus time so your shifts and daily story write themselves. It’s optional — you can do everything manually — but it’s where most of the magic comes from.' },
      { type: 'h', text: 'Install it' },
      { type: 'steps', items: [
        'Open Settings → Devices and follow the link to download the agent (or use the Setup guide).',
        'Open the downloaded app. On macOS, the first launch needs Right-click → Open to clear Gatekeeper.',
        'Marina shows a 6-digit pairing code. Enter it in the agent to link it to your account.',
        'That’s it — the agent now tracks your active app and focus time during your shifts.',
      ] },
      { type: 'h', text: 'What it tracks' },
      { type: 'ul', items: [
        'Which app is in focus and for how long, so Marina can tell coding from comms from docs.',
        'Idle vs. active time, to build an honest picture of your day.',
        'Nothing when you’re punched out, paused, or on a break.',
      ] },
      { type: 'tip', text: 'You’re always in control: pause tracking any time from the dashboard, and revoke a device from Settings → Devices if you lose your laptop.' },
    ],
  },
  {
    slug: 'marina-in-slack',
    title: 'Using Marina in Slack',
    summary: 'Every command, the App Home tab, and how to run your day without leaving Slack.',
    category: 'For employees',
    minutes: 4,
    blocks: [
      { type: 'p', text: 'If your workspace has Slack connected, Marina works as a full surface there — not just notifications. The first time you open the Marina app or run a command, Marina links you to your account automatically by email.' },
      { type: 'h', text: 'The App Home tab' },
      { type: 'p', text: 'Click “Marina” in your Slack sidebar to open your Home tab — your day at a glance, with buttons to punch in/out, log work, give kudos, request leave and raise a blocker.' },
      { type: 'h', text: 'Slash commands' },
      { type: 'ul', items: [
        '/marina status — your day at a glance',
        '/marina in — punch in · /marina out — punch out (with a quick summary)',
        '/marina done <what you shipped> — log work',
        '/marina blocker <reason> — flag that you’re stuck (and who you’re waiting on)',
        '/marina off [reason] — start a break · /marina back — end it',
        '/marina leave — request time off',
        '/marina standup — post your standup (Marina pre-drafts yesterday)',
        '/marina kudos — recognize a teammate',
      ] },
      { type: 'tip', text: 'Managers also get /marina pulse (today’s team snapshot), /marina blockers, /marina nudge @teammate, and /marina announce <message>.' },
    ],
  },
  {
    slug: 'daily-standups',
    title: 'Daily standups & Scrum mode',
    summary: 'Post your standup in seconds, and how managers run the async standup.',
    category: 'For employees',
    minutes: 3,
    blocks: [
      { type: 'p', text: 'Standups in Marina are async and take about thirty seconds. Marina drafts your “yesterday” from your real activity — you just add today’s plan and any blockers.' },
      { type: 'h', text: 'Post yours' },
      { type: 'ul', items: [
        'On the web: use the “Today’s standup” card on your dashboard.',
        'In Slack: run /marina standup, or tap the button in Marina’s morning reminder DM.',
      ] },
      { type: 'p', text: 'Either way it’s saved once and shared in your team’s scrum channel. Re-posting just updates today’s entry.' },
      { type: 'h', text: 'Scrum mode (managers)' },
      { type: 'p', text: 'Managers can open Scrum mode for a projection-friendly, keyboard-driven walk through the team — each person’s “working on today”, what shipped yesterday, blockers and risks. Mark people covered with the spacebar; arrow keys move between them.' },
    ],
  },
  {
    slug: 'time-off-and-attendance',
    title: 'Time off, breaks & attendance',
    summary: 'Request leave, take breaks, and how attendance is recorded.',
    category: 'For employees',
    minutes: 3,
    blocks: [
      { type: 'p', text: 'Marina tracks your working time honestly and makes time off painless — no spreadsheets, no chasing approvals.' },
      { type: 'h', text: 'Requesting leave' },
      { type: 'steps', items: [
        'On the web, open Time off, or in Slack run /marina leave.',
        'Pick the type and dates and add a short reason.',
        'Your manager gets a notification and can approve or deny it in one click — including straight from Slack.',
      ] },
      { type: 'h', text: 'Breaks & blockers' },
      { type: 'ul', items: [
        'Taking a breather? /marina off (or the dashboard) starts a break; /marina back ends it.',
        'Stuck on something? Raise a blocker and say who you’re waiting on — Marina makes sure it doesn’t get lost.',
      ] },
      { type: 'tip', text: 'Made a mistake on your attendance? You can request a regularization (a fix) from your console.' },
    ],
  },
  {
    slug: 'recognition-and-announcements',
    title: 'Recognition & announcements',
    summary: 'Give kudos, and how team-wide announcements reach everyone.',
    category: 'For employees',
    minutes: 2,
    blocks: [
      { type: 'p', text: 'Good work deserves to be seen. Marina makes recognition a one-liner and keeps the whole team in the loop.' },
      { type: 'h', text: 'Give kudos' },
      { type: 'ul', items: [
        'On the web: the “Give recognition” card on your dashboard.',
        'In Slack: /marina kudos, or the “Give kudos” button on your Home tab.',
      ] },
      { type: 'p', text: 'Marina posts a card to your #all-marina channel and drops a note in the recipient’s inbox. Birthdays and work anniversaries get celebrated there automatically too.' },
      { type: 'h', text: 'Announcements' },
      { type: 'p', text: 'When a manager posts an announcement, it lands in #all-marina and in everyone’s inbox — and stays on the Announcements page so nobody misses it.' },
    ],
  },
  {
    slug: 'manager-playbook',
    title: 'The manager’s playbook',
    summary: 'The team dashboard, blockers queue, reports and reviews — five minutes a day.',
    category: 'For managers',
    minutes: 4,
    blocks: [
      { type: 'p', text: 'Marina is designed so a manager can stay completely on top of a remote team in about five minutes a day. Here’s the loop.' },
      { type: 'ul', items: [
        'Morning brief — Marina DMs you (and posts to your channel) a snapshot: who’s on, who’s blocked, what shipped.',
        'Blockers — a single queue of every active blocker with who’s waiting on whom. Clear it once a day.',
        'Scrum mode — walk the async standup live or on a screen-share.',
        'Insights & Workload — spot overload and uneven distribution before they become problems.',
        'Reviews & 1:1s — Marina assembles a real, evidence-backed picture of each person’s work.',
      ] },
      { type: 'p', text: 'Everything respects scope: you see the people you actually manage, not the whole org (unless you’re an admin).' },
      { type: 'tip', text: 'Set your two Slack channels under Integrations → Slack: an announcements channel (#all-marina) and a scrum channel. Marina routes the right message to the right place.' },
    ],
  },
  {
    slug: 'your-data-and-privacy',
    title: 'Your data & privacy',
    summary: 'What Marina collects, who can see it, and the controls you have.',
    category: 'Privacy',
    minutes: 3,
    blocks: [
      { type: 'p', text: 'Marina only works if people trust it. So the defaults are conservative and you’re always in control of your own data.' },
      { type: 'ul', items: [
        'The desktop agent only records during your shifts — never when you’re punched out, paused or on a break.',
        'You can pause tracking at any time, and revoke any paired device instantly.',
        'Managers see the people they manage, scoped by your org chart — not the entire company.',
        'You can review your own data any time from “My data”.',
      ] },
      { type: 'p', text: 'Marina uses your activity to build helpful summaries and verify shifts — not to micromanage. The goal is to make honest work visible, not to surveil.' },
      { type: 'tip', text: 'Questions about how your workspace is configured? Ask your admin — or see our full privacy policy linked in the footer.' },
    ],
  },
]

export function getArticle(slug: string): Article | undefined {
  return ARTICLES.find((a) => a.slug === slug)
}
