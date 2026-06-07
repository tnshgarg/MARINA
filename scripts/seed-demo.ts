/**
 * Demo seed script — populate a fresh org with realistic data for sales calls.
 *
 *   DATABASE_URL=... pnpm tsx scripts/seed-demo.ts --owner-login=tanish
 *
 * Or in package.json:  "seed:demo": "tsx scripts/seed-demo.ts"
 *
 * The script is idempotent if the demo org already exists (it skips with a notice).
 */
import { and, eq, inArray, isNull } from 'drizzle-orm'
import { db, schema } from '../lib/db/client'
import type { LeaveType } from '../lib/db/schema'

type Seed = {
  login: string
  name: string
  characterKey: string
  email: string
}

const SEED_HEROES: Seed[] = [
  { login: 'tanish',  name: 'Tanish Garg',         characterKey: 'iron_man',   email: 'tanish@acmedemo.in' },
  { login: 'priya',   name: 'Priya Nair',          characterKey: 'spider_man', email: 'priya@acmedemo.in' },
  { login: 'rahul',   name: 'Rahul Sharma',        characterKey: 'captain',    email: 'rahul@acmedemo.in' },
  { login: 'sneha',   name: 'Sneha Patil',         characterKey: 'thor',       email: 'sneha@acmedemo.in' },
  { login: 'arjun',   name: 'Arjun Mehta',         characterKey: 'hulk',       email: 'arjun@acmedemo.in' },
  { login: 'natasha', name: 'Natasha Bose',        characterKey: 'widow',      email: 'natasha@acmedemo.in' },
  { login: 'sid',     name: 'Siddharth Kapoor',    characterKey: 'strange',    email: 'sid@acmedemo.in' },
  { login: 'logan',   name: 'Logan Iyer',          characterKey: 'wolverine',  email: 'logan@acmedemo.in' },
  { login: 'kavya',   name: 'Kavya Krishnamurthy', characterKey: 'panther',    email: 'kavya@acmedemo.in' },
  { login: 'dev',     name: 'Devendra Pillai',     characterKey: 'deadpool',   email: 'dev@acmedemo.in' },
]

async function main(): Promise<void> {
  const orgName = process.env.DEMO_ORG_NAME ?? 'Acme Demo Squad'
  console.log(`[seed-demo] using org name: ${orgName}`)

  // Check if the demo org already exists.
  const existing = await db.query.orgs.findFirst({ where: eq(schema.orgs.name, orgName) })
  if (existing) {
    console.log(`[seed-demo] org "${orgName}" already exists (id=${existing.id}). Skipping.`)
    return
  }

  // Create the owner first
  const ownerSeed = SEED_HEROES[0]
  const [owner] = await db
    .insert(schema.users)
    .values({
      githubId: 1000000 + Math.floor(Math.random() * 9000),
      login: ownerSeed.login,
      name: ownerSeed.name,
      email: ownerSeed.email,
      characterKey: ownerSeed.characterKey,
    })
    .returning()

  console.log(`[seed-demo] created owner user id=${owner.id}`)

  const [org] = await db
    .insert(schema.orgs)
    .values({
      name: orgName,
      ownerId: owner.id,
      holidayRegion: 'IN',
    })
    .returning()

  await db.insert(schema.memberships).values({
    orgId: org.id,
    userId: owner.id,
    role: 'owner',
  })

  // Create the remaining team
  for (let i = 1; i < SEED_HEROES.length; i++) {
    const s = SEED_HEROES[i]
    const [u] = await db
      .insert(schema.users)
      .values({
        githubId: 2000000 + i * 100,
        login: s.login,
        name: s.name,
        email: s.email,
        characterKey: s.characterKey,
      })
      .returning()
    await db.insert(schema.memberships).values({
      orgId: org.id,
      userId: u.id,
      role: i === 1 ? 'manager' : 'member',
    })
  }

  console.log(`[seed-demo] created ${SEED_HEROES.length} team members`)

  // Fetch users we just created
  const teamUsers = await db
    .select()
    .from(schema.users)
    .where(inArray(schema.users.login, SEED_HEROES.map((s) => s.login)))
  const byLogin = new Map(teamUsers.map((u) => [u.login, u]))

  const now = new Date()

  // Punch a few people in
  const punchedInLogins = ['priya', 'rahul', 'sneha', 'arjun', 'kavya']
  for (const login of punchedInLogins) {
    const u = byLogin.get(login)
    if (!u) continue
    const minsAgo = 30 + Math.floor(Math.random() * 240)
    await db.insert(schema.shifts).values({
      userId: u.id,
      orgId: org.id,
      punchedInAt: new Date(now.getTime() - minsAgo * 60_000),
      punchedInVia: 'agent',
    })
  }

  // Add some completed shifts in the past 7 days for variety
  const completedShiftLogins = ['tanish', 'priya', 'rahul', 'sneha', 'sid']
  for (const login of completedShiftLogins) {
    const u = byLogin.get(login)
    if (!u) continue
    for (let d = 1; d <= 5; d++) {
      const start = new Date(now.getTime() - d * 24 * 60 * 60_000 - 9 * 60 * 60_000)
      const end = new Date(start.getTime() + (7 + Math.random() * 2) * 60 * 60_000)
      const SAMPLE_SUMMARIES = [
        'Shipped PR #482 fixing the OAuth refresh race. Reviewed Sneha\'s Stripe webhook PR. Pair-programmed with Rahul on settings UI for ~1h.',
        'Wrote 3 specs for the new billing flow. Standup + 1:1s + customer call with TechFlow. Cleaned up 4 lint warnings.',
        'Deep work on the cron migration. Tested the rollback path on staging. Documented the runbook.',
        'Investigated the iOS push notification regression. Root cause: APNS cert expired. Renewed and deployed.',
      ]
      await db.insert(schema.shifts).values({
        userId: u.id,
        orgId: org.id,
        punchedInAt: start,
        punchedInVia: 'agent',
        punchedOutAt: end,
        punchedOutVia: 'agent',
        workSummary: SAMPLE_SUMMARIES[Math.floor(Math.random() * SAMPLE_SUMMARIES.length)],
        verificationStatus: 'verified',
        verificationScore: 72 + Math.floor(Math.random() * 25),
        verificationNotes: 'Summary matches commits, PRs, and IDE focus time. Plausible.',
        verificationProvider: 'demo/seeded',
        verifiedAt: end,
      })
    }
  }

  // A few breaks
  const breaks = [
    { login: 'arjun', reason: 'Waiting on deployment approval from DevOps' },
    { login: 'priya', reason: 'Stepping away for lunch' },
    { login: 'kavya', reason: 'Quick sync with the design team' },
  ]
  for (const b of breaks) {
    const u = byLogin.get(b.login)
    if (!u) continue
    await db.insert(schema.breaks).values({
      userId: u.id,
      orgId: org.id,
      startedAt: new Date(now.getTime() - Math.floor(Math.random() * 60) * 60_000),
      reason: b.reason,
    })
  }

  // Pending leaves
  const leaves: Array<{
    login: string
    startOffsetDays: number
    days: number
    reason: string
    leaveType: LeaveType
  }> = [
    { login: 'sneha', startOffsetDays: 2, days: 3, reason: 'Family function in Pune', leaveType: 'casual' },
    { login: 'natasha', startOffsetDays: 7, days: 2, reason: 'Doctor visit + recovery', leaveType: 'sick' },
    { login: 'logan', startOffsetDays: 14, days: 5, reason: 'Pre-planned vacation', leaveType: 'earned' },
  ]
  for (const l of leaves) {
    const u = byLogin.get(l.login)
    if (!u) continue
    const start = new Date(now.getTime() + l.startOffsetDays * 24 * 60 * 60_000)
    const end = new Date(start.getTime() + (l.days - 1) * 24 * 60 * 60_000)
    await db.insert(schema.leaveRequests).values({
      userId: u.id,
      orgId: org.id,
      startDate: start.toISOString().slice(0, 10),
      endDate: end.toISOString().slice(0, 10),
      leaveType: l.leaveType,
      reason: l.reason,
      status: 'pending',
    })
  }

  // Suppress unused-imports
  void and
  void isNull

  console.log(`[seed-demo] done. Sign in as @${ownerSeed.login} (manual: insert your GitHub OAuth flow first) to view /org/${org.id}.`)
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('[seed-demo] failed:', err)
    process.exit(1)
  })
