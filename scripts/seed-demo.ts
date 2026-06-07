/**
 * Demo seed — populate a fresh org with realistic data for sales calls and
 * end-to-end testing. Idempotent: skips if the org name already exists.
 *
 *   DATABASE_URL=... pnpm seed:demo
 *
 * Or to wipe + reseed:
 *   DEMO_RESET=1 pnpm seed:demo
 */
import { and, eq, inArray } from 'drizzle-orm'
import { db, schema } from '../lib/db/client'
import type { LeaveType } from '../lib/db/schema'

type Seed = {
  login: string
  name: string
  characterKey: string
  email: string
  role: 'owner' | 'manager' | 'member'
}

const SEED_HEROES: Seed[] = [
  { login: 'tanish',  name: 'Tanish Garg',         characterKey: 'iron_man',   email: 'tanish@acmedemo.in',  role: 'owner'   },
  { login: 'priya',   name: 'Priya Nair',          characterKey: 'spider_man', email: 'priya@acmedemo.in',   role: 'manager' },
  { login: 'rahul',   name: 'Rahul Sharma',        characterKey: 'captain',    email: 'rahul@acmedemo.in',   role: 'manager' },
  { login: 'sneha',   name: 'Sneha Patil',         characterKey: 'thor',       email: 'sneha@acmedemo.in',   role: 'member'  },
  { login: 'arjun',   name: 'Arjun Mehta',         characterKey: 'hulk',       email: 'arjun@acmedemo.in',   role: 'member'  },
  { login: 'natasha', name: 'Natasha Bose',        characterKey: 'widow',      email: 'natasha@acmedemo.in', role: 'member'  },
  { login: 'sid',     name: 'Siddharth Kapoor',    characterKey: 'strange',    email: 'sid@acmedemo.in',     role: 'member'  },
  { login: 'logan',   name: 'Logan Iyer',          characterKey: 'wolverine',  email: 'logan@acmedemo.in',   role: 'member'  },
  { login: 'kavya',   name: 'Kavya Krishnamurthy', characterKey: 'panther',    email: 'kavya@acmedemo.in',   role: 'member'  },
  { login: 'dev',     name: 'Devendra Pillai',     characterKey: 'deadpool',   email: 'dev@acmedemo.in',     role: 'member'  },
]

async function main(): Promise<void> {
  const orgName = process.env.DEMO_ORG_NAME ?? 'Acme Demo Squad'
  const reset = process.env.DEMO_RESET === '1'

  console.log(`[seed-demo] org: ${orgName}${reset ? ' (RESET enabled)' : ''}`)

  const existing = await db.query.orgs.findFirst({ where: eq(schema.orgs.name, orgName) })

  if (existing && reset) {
    console.log(`[seed-demo] resetting org id=${existing.id}`)
    // Find all users associated and cascade-delete
    const memberRows = await db
      .select({ userId: schema.memberships.userId })
      .from(schema.memberships)
      .where(eq(schema.memberships.orgId, existing.id))
    const userIds = memberRows.map((m) => m.userId)
    await db.delete(schema.orgs).where(eq(schema.orgs.id, existing.id)) // cascades memberships, leaves, breaks, shifts (via orgId FK set null), invites
    if (userIds.length > 0) {
      await db.delete(schema.users).where(inArray(schema.users.id, userIds)) // cascades all per-user tables
    }
    console.log(`[seed-demo] cleared ${userIds.length} users + their data`)
  } else if (existing) {
    console.log(`[seed-demo] org already exists (id=${existing.id}). Use DEMO_RESET=1 to wipe.`)
    return
  }

  // ─── Create users ──────────────────────────────────────────────────────────
  const userRows: Array<{ id: number; seed: Seed }> = []
  for (let i = 0; i < SEED_HEROES.length; i++) {
    const s = SEED_HEROES[i]
    const [u] = await db
      .insert(schema.users)
      .values({
        githubId: 1_000_000 + i * 137,
        login: s.login,
        name: s.name,
        email: s.email,
        characterKey: s.characterKey,
      })
      .returning()
    userRows.push({ id: u.id, seed: s })
  }
  console.log(`[seed-demo] created ${userRows.length} users`)

  // ─── Create org + memberships ──────────────────────────────────────────────
  const owner = userRows[0]!
  const [org] = await db
    .insert(schema.orgs)
    .values({
      name: orgName,
      ownerId: owner.id,
      holidayRegion: 'IN',
    })
    .returning()
  for (const u of userRows) {
    await db.insert(schema.memberships).values({
      orgId: org.id,
      userId: u.id,
      role: u.seed.role,
    })
  }
  console.log(`[seed-demo] created org id=${org.id}`)

  const byLogin = new Map(userRows.map((u) => [u.seed.login, u.id]))

  const now = new Date()
  const today9am = new Date(now)
  today9am.setHours(9, 0, 0, 0)

  // ─── Active (punched-in) shifts ────────────────────────────────────────────
  const punchedInLogins = ['priya', 'rahul', 'sneha', 'arjun', 'kavya']
  for (const login of punchedInLogins) {
    const uid = byLogin.get(login)
    if (!uid) continue
    const minsAgo = 60 + Math.floor(Math.random() * 240)
    await db.insert(schema.shifts).values({
      userId: uid,
      orgId: org.id,
      punchedInAt: new Date(now.getTime() - minsAgo * 60_000),
      punchedInVia: 'agent',
    })
  }

  // ─── Past 5 days of completed shifts ───────────────────────────────────────
  const SAMPLE_SUMMARIES = [
    'Shipped PR #482 fixing the OAuth refresh race. Reviewed Sneha\'s Stripe webhook PR. Pair-programmed with Rahul on settings UI for ~1h.',
    'Wrote 3 specs for the new billing flow. Standup + 1:1s + customer call with TechFlow. Cleaned up 4 lint warnings.',
    'Deep work on the cron migration. Tested the rollback path on staging. Documented the runbook.',
    'Investigated the iOS push notification regression. Root cause: APNS cert expired. Renewed and deployed.',
    'Fixed the analytics dashboard tooltip overflow bug. Helped Arjun debug his S3 upload signing issue. Wrote tests.',
  ]
  for (const u of userRows) {
    for (let d = 1; d <= 5; d++) {
      const start = new Date(today9am.getTime() - d * 24 * 60 * 60_000)
      const end = new Date(start.getTime() + (7 + Math.random() * 2) * 60 * 60_000)
      const score = 70 + Math.floor(Math.random() * 28)
      await db.insert(schema.shifts).values({
        userId: u.id,
        orgId: org.id,
        punchedInAt: start,
        punchedInVia: 'agent',
        punchedOutAt: end,
        punchedOutVia: 'agent',
        workSummary: SAMPLE_SUMMARIES[Math.floor(Math.random() * SAMPLE_SUMMARIES.length)],
        verificationStatus: score >= 70 ? 'verified' : 'suspect',
        verificationScore: score,
        verificationNotes: 'Summary matches commits, PRs, and IDE focus time during the shift window.',
        verificationProvider: 'demo/seeded',
        verifiedAt: end,
      })
    }
  }

  // ─── Breaks ────────────────────────────────────────────────────────────────
  const ongoingBreaks: Array<{ login: string; reason: string; minutesAgo: number }> = [
    { login: 'arjun', reason: 'Waiting on deployment approval from DevOps', minutesAgo: 22 },
    { login: 'priya', reason: 'Quick coffee — back in 10', minutesAgo: 7 },
    { login: 'kavya', reason: 'Stepped out for a design sync', minutesAgo: 14 },
  ]
  for (const b of ongoingBreaks) {
    const uid = byLogin.get(b.login)
    if (!uid) continue
    await db.insert(schema.breaks).values({
      userId: uid,
      orgId: org.id,
      startedAt: new Date(now.getTime() - b.minutesAgo * 60_000),
      reason: b.reason,
    })
  }

  // ─── Pending leaves ────────────────────────────────────────────────────────
  const pendingLeaves: Array<{
    login: string
    startDays: number
    days: number
    type: LeaveType
    reason: string
  }> = [
    { login: 'sneha',   startDays: 2,  days: 3, type: 'casual',    reason: 'Family function in Pune over the long weekend.' },
    { login: 'natasha', startDays: 7,  days: 2, type: 'sick',      reason: 'Doctor appointment and recovery day.' },
    { login: 'logan',   startDays: 14, days: 5, type: 'earned',    reason: 'Pre-planned vacation with family.' },
    { login: 'dev',     startDays: 1,  days: 1, type: 'compoff',   reason: 'Comp-off for last weekend\'s on-call rotation.' },
  ]
  for (const l of pendingLeaves) {
    const uid = byLogin.get(l.login)
    if (!uid) continue
    const start = new Date(now.getTime() + l.startDays * 24 * 60 * 60_000)
    const end = new Date(start.getTime() + (l.days - 1) * 24 * 60 * 60_000)
    await db.insert(schema.leaveRequests).values({
      userId: uid,
      orgId: org.id,
      startDate: start.toISOString().slice(0, 10),
      endDate: end.toISOString().slice(0, 10),
      leaveType: l.type,
      reason: l.reason,
      status: 'pending',
    })
  }

  // ─── A couple of decided leaves so the history view isn't empty ────────────
  const decidedLeaves = [
    { login: 'sid', startDays: -5, days: 1, type: 'sick' as LeaveType, status: 'approved' as const, reason: 'Fever, bed rest.' },
    { login: 'kavya', startDays: -10, days: 2, type: 'casual' as LeaveType, status: 'denied' as const, reason: 'Wedding in family.', note: 'Sprint demo on those days — please reschedule.' },
  ]
  for (const l of decidedLeaves) {
    const uid = byLogin.get(l.login)
    if (!uid) continue
    const start = new Date(now.getTime() + l.startDays * 24 * 60 * 60_000)
    const end = new Date(start.getTime() + (l.days - 1) * 24 * 60 * 60_000)
    await db.insert(schema.leaveRequests).values({
      userId: uid,
      orgId: org.id,
      startDate: start.toISOString().slice(0, 10),
      endDate: end.toISOString().slice(0, 10),
      leaveType: l.type,
      reason: l.reason,
      status: l.status,
      decidedAt: new Date(now.getTime() + (l.startDays - 1) * 24 * 60 * 60_000),
      decidedBy: owner.id,
      decidedNote: 'note' in l ? l.note : null,
    })
  }

  // ─── GitHub events across the team ─────────────────────────────────────────
  const REPOS = ['acme/web', 'acme/api', 'acme/mobile', 'acme/infra']
  const PR_TITLES = [
    'Fix OAuth refresh race',
    'Add Stripe webhook handler',
    'Migrate payment-worker to bun',
    'Improve sidebar accessibility',
    'Refactor settings page',
    'Add error boundaries to dashboard',
    'Bump dependencies + lockfile',
    'Add idempotency key to checkout',
  ]
  const COMMIT_MSGS = [
    'fix: off-by-one in pagination',
    'refactor: extract auth middleware',
    'chore: bump react to 19.2',
    'feat: add team activity feed',
    'test: cover edge cases in shift verifier',
    'docs: add DPA template',
    'fix: prevent double-submit on leave form',
    'perf: memoize heavy avatar SVG',
  ]
  const events = []
  for (const u of userRows) {
    const count = 3 + Math.floor(Math.random() * 12)
    for (let i = 0; i < count; i++) {
      const ago = Math.floor(Math.random() * 7 * 24 * 60 * 60 * 1000)
      const occurredAt = new Date(now.getTime() - ago)
      const repo = REPOS[Math.floor(Math.random() * REPOS.length)]
      const type =
        Math.random() < 0.55
          ? 'commit'
          : Math.random() < 0.75
            ? 'pr_opened'
            : Math.random() < 0.9
              ? 'pr_reviewed'
              : 'issue_closed'
      const title =
        type === 'commit'
          ? COMMIT_MSGS[Math.floor(Math.random() * COMMIT_MSGS.length)]
          : type === 'pr_opened' || type === 'pr_reviewed'
            ? PR_TITLES[Math.floor(Math.random() * PR_TITLES.length)]
            : `Issue: ${COMMIT_MSGS[Math.floor(Math.random() * COMMIT_MSGS.length)].replace(/^[a-z]+: /, '')}`
      events.push({
        userId: u.id,
        type: type as 'commit' | 'pr_opened' | 'pr_reviewed' | 'issue_closed',
        repo,
        title,
        url: `https://github.com/${repo}/commit/${Math.random().toString(36).slice(2, 10)}`,
        externalId: `seed-${u.id}-${i}-${Date.now()}`,
        occurredAt,
        raw: null,
      })
    }
  }
  if (events.length > 0) {
    // Batch insert in chunks of 50 to avoid hitting parameter limits
    for (let i = 0; i < events.length; i += 50) {
      await db.insert(schema.githubEvents).values(events.slice(i, i + 50))
    }
  }
  console.log(`[seed-demo] inserted ${events.length} GitHub events`)

  // ─── Local activity samples (last 5 hours of "active shift" users) ─────────
  const APPS = [
    { name: 'Code', cat: 'code' as const, weight: 0.45 },
    { name: 'Slack', cat: 'comms' as const, weight: 0.18 },
    { name: 'Chrome', cat: 'browse' as const, weight: 0.12 },
    { name: 'zoom.us', cat: 'meet' as const, weight: 0.1 },
    { name: 'Figma', cat: 'design' as const, weight: 0.08 },
    { name: 'Notion', cat: 'read' as const, weight: 0.07 },
  ]
  const activityRows = []
  for (const login of punchedInLogins) {
    const uid = byLogin.get(login)
    if (!uid) continue
    for (let m = 0; m < 60; m++) {
      const start = new Date(now.getTime() - (5 * 60 - m * 5) * 60_000)
      const end = new Date(start.getTime() + 5 * 60_000)
      // Pick weighted app
      const r = Math.random()
      let cumulative = 0
      let chosen = APPS[0]
      for (const a of APPS) {
        cumulative += a.weight
        if (r <= cumulative) {
          chosen = a
          break
        }
      }
      const activeSec = Math.floor(180 + Math.random() * 120)
      const idleSec = 300 - activeSec
      activityRows.push({
        userId: uid,
        agentTokenId: null,
        windowStart: start,
        windowEnd: end,
        activeApp: chosen.name,
        activeSeconds: activeSec,
        idleSeconds: idleSec,
        sampleCount: 10,
        windowTitle: null,
      })
    }
  }
  if (activityRows.length > 0) {
    for (let i = 0; i < activityRows.length; i += 50) {
      await db.insert(schema.localActivity).values(activityRows.slice(i, i + 50))
    }
  }
  console.log(`[seed-demo] inserted ${activityRows.length} local activity samples`)

  // ─── Narratives (one per user) ─────────────────────────────────────────────
  const SIGNALS: Array<'High' | 'Steady' | 'Low' | 'Blocked'> = ['High', 'Steady', 'Steady', 'Steady', 'Low', 'Blocked']
  const NARRATIVE_BODIES = [
    'Shipped 2 PRs and reviewed 1 — clearly a strong output week. Active on Slack, focused IDE time around midday.',
    'Solid steady output: 4 commits across two repos, one PR opened, one approved. Healthy mix of coding and comms.',
    'Mostly heads-down work this week. No PRs merged but commits are landing daily on a long-running feature branch.',
    'Limited measurable output — only one commit. Could be a planning/spec week, or worth a quick check-in to unblock.',
  ]
  for (const u of userRows) {
    const signal = SIGNALS[Math.floor(Math.random() * SIGNALS.length)]
    const body = NARRATIVE_BODIES[Math.floor(Math.random() * NARRATIVE_BODIES.length)]
    await db.insert(schema.narratives).values({
      userId: u.id,
      periodStart: new Date(now.getTime() - 7 * 24 * 60 * 60_000),
      periodEnd: now,
      body,
      signal,
      blockers: signal === 'Blocked' ? ['Awaiting review on PR #482', 'Cross-team dependency on infra'] : [],
      provider: 'demo',
      model: 'seeded',
    })
  }

  // ─── Daily states (for HR view's Team Pulse) ───────────────────────────────
  const stateDay = now.toISOString().slice(0, 10)
  for (const u of userRows) {
    const states = ['High', 'Steady', 'Steady', 'Steady', 'Blocked', 'Disengaged'] as const
    const state = states[Math.floor(Math.random() * states.length)]
    await db.insert(schema.dailyStates).values({
      userId: u.id,
      day: stateDay,
      state,
      outputCount: Math.floor(Math.random() * 8),
      onlineSeconds: 3600 + Math.floor(Math.random() * 18000),
      focusWorkRatio: 35 + Math.floor(Math.random() * 50),
      staticIdleRuns: Math.floor(Math.random() * 3),
      reason:
        state === 'Blocked'
          ? 'Active in IDE 4h but no commits — possibly stuck on auth migration.'
          : state === 'Disengaged'
            ? 'Mostly idle and on Slack today. Worth a quick check-in.'
            : 'Healthy mix of coding, meetings, and reviews.',
    })
  }

  void and
  console.log(`[seed-demo] ✓ done. Sign in at /dev/login to test any user.`)
  console.log(`[seed-demo]   • Owner:    @${SEED_HEROES[0].login}`)
  console.log(`[seed-demo]   • Manager:  @${SEED_HEROES[1].login}, @${SEED_HEROES[2].login}`)
  console.log(`[seed-demo]   • Members:  ${SEED_HEROES.filter((s) => s.role === 'member').map((s) => '@' + s.login).join(', ')}`)
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('[seed-demo] failed:', err)
    process.exit(1)
  })
