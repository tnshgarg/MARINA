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
import type { Discipline, LeaveType } from '../lib/db/schema'

type Seed = {
  login: string
  name: string
  characterKey: string
  email: string
  role: 'admin' | 'manager' | 'member'
  /** Functional discipline — drives the role-aware UI labels. */
  discipline: Discipline
  /** Job title shown under the name in the modal subtitle. */
  jobTitle: string
  /** Birthday as MM-DD (year intentionally not stored). */
  birthdayMmDd: string
  /** Joining date YYYY-MM-DD, used for work-anniversary reminders. */
  joinedOn: string
  /** Extra owner-shaped capabilities granted by the owner. */
  extraCaps?: string[]
  /** Working days bitmap, Sun..Sat. Defaults to Mon–Fri if omitted. */
  workingDays?: boolean[]
  /**
   * Who this person reports to (by `login`). Drives the org chart layout
   * AND the auto-routing of leave-approval notifications. Omit for owners
   * and root-level founders.
   */
  reportsTo?: string
}

// Rich roster spanning every role × capability × discipline so testers
// can exercise EVERY RBAC code path:
//
//   * 2 owners (cofounders) — Tanish + Maya
//   * 6 managers, each with a different extraCaps mix so we can verify
//     gates like "manage_billing but NOT manage_members" actually deny
//   * 16 individual contributors across 8 disciplines
//   * A 3-level reports-to chain (founder → manager → IC → IC)
//
// Today's date when this file ships: 2026-06-11. Birthdays + joining
// dates are skewed so the celebrations widget, anniversaries pill,
// blockers strip and reports KPIs all have content immediately.
const SEED_CORE: Seed[] = [
  // ─── Founders / Owners (multiple — tests "multi-root" org chart) ────────
  {
    login: 'tanish', name: 'Tanish Garg', characterKey: 'iron_knight', email: 'tanish@acmedemo.in',
    role: 'admin', discipline: 'exec', jobTitle: 'Co-founder & CEO',
    birthdayMmDd: '07-15', joinedOn: '2024-01-15',
  },
  {
    login: 'maya', name: 'Maya Iyengar', characterKey: 'amazon', email: 'maya@acmedemo.in',
    role: 'admin', discipline: 'exec', jobTitle: 'Co-founder & CTO',
    birthdayMmDd: '06-19', joinedOn: '2024-01-15',
  },

  // ─── Department heads / Managers (varied extraCaps) ────────────────────
  {
    // People-care manager: full HR cap loadout
    login: 'aisha', name: 'Aisha Khan', characterKey: 'brightest', email: 'aisha@acmedemo.in',
    role: 'manager', discipline: 'hr', jobTitle: 'Head of People',
    birthdayMmDd: '06-21', joinedOn: '2024-02-05',
    extraCaps: ['manage_celebrations', 'manage_workspace', 'view_all_data'],
    reportsTo: 'tanish',
  },
  {
    // Engineering manager — reports to CTO. No billing access (tested).
    login: 'rahul', name: 'Rahul Sharma', characterKey: 'star_captain', email: 'rahul@acmedemo.in',
    role: 'manager', discipline: 'engineering', jobTitle: 'Engineering Manager',
    birthdayMmDd: '11-08', joinedOn: '2024-03-10',
    extraCaps: ['manage_integrations', 'export_data'],
    reportsTo: 'maya',
  },
  {
    // Product manager — limited caps (no integrations or billing).
    login: 'priya', name: 'Priya Nair', characterKey: 'web_crawler', email: 'priya@acmedemo.in',
    role: 'manager', discipline: 'product', jobTitle: 'Head of Product',
    birthdayMmDd: '06-20', joinedOn: '2024-02-01',
    extraCaps: [],
    reportsTo: 'tanish',
  },
  {
    // Sales manager — tests `decide_leaves` (manager-default).
    login: 'rohan', name: 'Rohan Bhatia', characterKey: 'outlaw', email: 'rohan@acmedemo.in',
    role: 'manager', discipline: 'sales', jobTitle: 'Head of Sales',
    birthdayMmDd: '08-30', joinedOn: '2024-04-12',
    extraCaps: [],
    reportsTo: 'tanish',
  },
  {
    // Finance head — owner-shaped billing cap, nothing else.
    login: 'vikram', name: 'Vikram Joshi', characterKey: 'mogul', email: 'vikram@acmedemo.in',
    role: 'manager', discipline: 'finance', jobTitle: 'Head of Finance',
    birthdayMmDd: '04-09', joinedOn: '2024-02-20',
    extraCaps: ['manage_billing', 'export_data'],
    reportsTo: 'tanish',
  },
  {
    // Marketing lead — reports-only view, no manage_members.
    login: 'kavya', name: 'Kavya Krishnamurthy', characterKey: 'panther_king', email: 'kavya@acmedemo.in',
    role: 'manager', discipline: 'marketing', jobTitle: 'Growth Marketing Lead',
    birthdayMmDd: '06-14', joinedOn: '2024-10-01',
    extraCaps: ['view_reports_only'],
    reportsTo: 'priya',
  },

  // ─── Engineering ICs (chain under Rahul) ───────────────────────────────
  {
    login: 'arjun', name: 'Arjun Mehta', characterKey: 'behemoth', email: 'arjun@acmedemo.in',
    role: 'member', discipline: 'engineering', jobTitle: 'Backend Engineer',
    birthdayMmDd: '02-14', joinedOn: '2024-06-12',
    reportsTo: 'rahul',
  },
  {
    login: 'logan', name: 'Logan Iyer', characterKey: 'berserker', email: 'logan@acmedemo.in',
    role: 'member', discipline: 'engineering', jobTitle: 'Senior Frontend Engineer',
    birthdayMmDd: '12-01', joinedOn: '2023-06-11',  // 3-year anniversary TODAY
    reportsTo: 'rahul',
  },
  {
    login: 'dev', name: 'Devendra Pillai', characterKey: 'mercenary', email: 'dev@acmedemo.in',
    role: 'member', discipline: 'engineering', jobTitle: 'Platform Engineer',
    birthdayMmDd: '03-22', joinedOn: '2024-11-15',
    reportsTo: 'rahul',
  },
  {
    login: 'ira', name: 'Ira Sehgal', characterKey: 'fox_ninja', email: 'ira@acmedemo.in',
    role: 'member', discipline: 'engineering', jobTitle: 'Mobile Engineer',
    birthdayMmDd: '01-25', joinedOn: '2025-05-02',
    reportsTo: 'rahul',
  },

  // ─── Design + Product ICs ─────────────────────────────────────────────
  {
    login: 'sneha', name: 'Sneha Patil', characterKey: 'thunder_lord', email: 'sneha@acmedemo.in',
    role: 'member', discipline: 'design', jobTitle: 'Senior Designer',
    birthdayMmDd: '06-25', joinedOn: '2024-05-22',
    reportsTo: 'priya',
  },
  {
    login: 'noah', name: 'Noah Tan', characterKey: 'bandit', email: 'noah@acmedemo.in',
    role: 'member', discipline: 'design', jobTitle: 'Brand Designer',
    birthdayMmDd: '10-04', joinedOn: '2025-02-08',
    reportsTo: 'priya',
  },
  {
    login: 'tara', name: 'Tara Menon', characterKey: 'chosen', email: 'tara@acmedemo.in',
    role: 'member', discipline: 'product', jobTitle: 'Product Manager',
    birthdayMmDd: '03-12', joinedOn: '2024-09-10',
    reportsTo: 'priya',
  },

  // ─── Sales + Support ICs ──────────────────────────────────────────────
  {
    login: 'natasha', name: 'Natasha Bose', characterKey: 'spy', email: 'natasha@acmedemo.in',
    role: 'member', discipline: 'sales', jobTitle: 'Account Executive',
    birthdayMmDd: '06-30', joinedOn: '2025-01-15',
    reportsTo: 'rohan',
  },
  {
    login: 'omar', name: 'Omar Sheikh', characterKey: 'speedster', email: 'omar@acmedemo.in',
    role: 'member', discipline: 'sales', jobTitle: 'SDR',
    birthdayMmDd: '06-18', joinedOn: '2025-03-20',
    reportsTo: 'rohan',
  },
  {
    login: 'sid', name: 'Siddharth Kapoor', characterKey: 'sorcerer', email: 'sid@acmedemo.in',
    role: 'member', discipline: 'support', jobTitle: 'Customer Support Lead',
    birthdayMmDd: '09-03', joinedOn: '2024-08-01',
    workingDays: [false, true, true, true, true, true, true],
    reportsTo: 'aisha',
  },
  {
    login: 'mei', name: 'Mei Lin', characterKey: 'copy_ninja', email: 'mei@acmedemo.in',
    role: 'member', discipline: 'support', jobTitle: 'Customer Success',
    birthdayMmDd: '07-02', joinedOn: '2025-04-01',
    reportsTo: 'sid',  // 3-level chain: tanish → aisha → sid → mei
  },

  // ─── Ops + HR ICs ─────────────────────────────────────────────────────
  {
    login: 'farah', name: 'Farah Khan', characterKey: 'scarlet_hex', email: 'farah@acmedemo.in',
    role: 'member', discipline: 'ops', jobTitle: 'Ops Coordinator',
    birthdayMmDd: '05-15', joinedOn: '2024-12-01',
    reportsTo: 'aisha',
  },
  {
    login: 'ravi', name: 'Ravi Subramanian', characterKey: 'detective', email: 'ravi@acmedemo.in',
    role: 'member', discipline: 'hr', jobTitle: 'People Partner',
    birthdayMmDd: '02-28', joinedOn: '2025-06-15',  // joined yesterday — new hire
    reportsTo: 'aisha',
  },

  // ─── Marketing ICs ────────────────────────────────────────────────────
  {
    login: 'zara', name: 'Zara Patel', characterKey: 'wild_card', email: 'zara@acmedemo.in',
    role: 'member', discipline: 'marketing', jobTitle: 'Content Lead',
    birthdayMmDd: '06-28', joinedOn: '2024-07-15',
    reportsTo: 'kavya',
  },
]

// ─── Auto-generated filler roster ───────────────────────────────────────────
// Pads the hand-crafted cast up to TARGET_HEADCOUNT so the demo org is big
// enough to stress every list, grid, heatmap, org chart and manager-scope
// filter. Fillers flow through the SAME downstream seeding as the core cast
// (memberships, reports-to chain, 5-day shifts, GitHub events, narratives,
// daily states) — they just don't carry the bespoke blockers/leaves that the
// core cast uses for the scripted demo moments.
const TARGET_HEADCOUNT = 50

const FILLER_FIRST = [
  'Aarav', 'Diya', 'Kabir', 'Ananya', 'Vivaan', 'Isha', 'Reyansh', 'Saanvi',
  'Aditya', 'Myra', 'Kiaan', 'Anvika', 'Arnav', 'Riya', 'Vihaan', 'Navya',
  'Dhruv', 'Paro', 'Krish', 'Aadhya', 'Yash', 'Kyra', 'Ishaan', 'Meera',
  'Ayaan', 'Nisha', 'Rudra', 'Saira', 'Imran', 'Leela', 'Veer', 'Tanvi',
]
const FILLER_LAST = [
  'Reddy', 'Gupta', 'Verma', 'Rao', 'Banerjee', 'Chopra', 'Desai',
  'Malhotra', 'Ghosh', 'Saxena', 'Pillai', 'Bhat', 'Kulkarni', 'Nanda', 'Sinha',
]
// Reuse valid character keys from the core cast (column has no unique
// constraint, so repeated avatars are fine for filler).
const FILLER_AVATARS = [
  'iron_knight', 'amazon', 'brightest', 'star_captain', 'web_crawler', 'outlaw',
  'mogul', 'panther_king', 'behemoth', 'berserker', 'mercenary', 'fox_ninja',
  'thunder_lord', 'bandit', 'chosen', 'spy', 'speedster', 'sorcerer',
  'copy_ninja', 'scarlet_hex', 'detective', 'wild_card',
]
// IC discipline → job title, rotated across fillers for a realistic spread.
const FILLER_ROLES: Array<{ discipline: Discipline; title: string }> = [
  { discipline: 'engineering', title: 'Backend Engineer' },
  { discipline: 'engineering', title: 'Frontend Engineer' },
  { discipline: 'engineering', title: 'Full-stack Engineer' },
  { discipline: 'engineering', title: 'QA Engineer' },
  { discipline: 'engineering', title: 'Site Reliability Engineer' },
  { discipline: 'design', title: 'Product Designer' },
  { discipline: 'design', title: 'UX Researcher' },
  { discipline: 'product', title: 'Product Manager' },
  { discipline: 'product', title: 'Associate PM' },
  { discipline: 'sales', title: 'Account Executive' },
  { discipline: 'sales', title: 'Sales Development Rep' },
  { discipline: 'support', title: 'Support Specialist' },
  { discipline: 'support', title: 'Customer Success Manager' },
  { discipline: 'marketing', title: 'Growth Marketer' },
  { discipline: 'marketing', title: 'Content Marketer' },
  { discipline: 'ops', title: 'Operations Analyst' },
  { discipline: 'hr', title: 'HR Business Partner' },
  { discipline: 'finance', title: 'Financial Analyst' },
]
// New mid-level managers (report to founders), each owning a slice of fillers —
// gives the org chart real depth and gives managers real scopes to test.
const FILLER_LEADS: Seed[] = [
  {
    login: 'meghna', name: 'Meghna Iyer', characterKey: 'scarlet_hex', email: 'meghna@acmedemo.in',
    role: 'manager', discipline: 'engineering', jobTitle: 'Engineering Manager — Platform',
    birthdayMmDd: '06-16', joinedOn: '2024-02-20', reportsTo: 'maya', extraCaps: ['manage_members'],
  },
  {
    login: 'harish', name: 'Harish Menon', characterKey: 'mogul', email: 'harish@acmedemo.in',
    role: 'manager', discipline: 'sales', jobTitle: 'Sales Manager — West',
    birthdayMmDd: '06-20', joinedOn: '2024-06-14', reportsTo: 'tanish', extraCaps: ['manage_members'],
  },
  {
    login: 'fatima', name: 'Fatima Ansari', characterKey: 'brightest', email: 'fatima@acmedemo.in',
    role: 'manager', discipline: 'hr', jobTitle: 'People Operations Lead',
    birthdayMmDd: '09-02', joinedOn: '2023-06-16', reportsTo: 'tanish', extraCaps: ['manage_members', 'decide_leaves'],
  },
]
// Managers that fillers report to (core + new leads) so scopes overlap.
const FILLER_MANAGERS = ['rahul', 'priya', 'kavya', 'meghna', 'harish', 'fatima']
const FILLER_BIRTHDAYS = ['06-14', '06-15', '06-18', '01-22', '03-08', '08-30', '11-12', '02-14', '12-25', '07-04', '04-19', '10-10']
const FILLER_JOINED = ['2024-06-14', '2023-06-16', '2025-01-10', '2024-11-03', '2023-09-21', '2025-03-15', '2024-08-08', '2022-06-15', '2025-05-02', '2024-04-12']

function makeFillers(): Seed[] {
  const out: Seed[] = [...FILLER_LEADS]
  const need = Math.max(0, TARGET_HEADCOUNT - SEED_CORE.length - FILLER_LEADS.length)
  for (let i = 0; i < need; i++) {
    const first = FILLER_FIRST[i % FILLER_FIRST.length]
    const last = FILLER_LAST[i % FILLER_LAST.length]
    const role = FILLER_ROLES[i % FILLER_ROLES.length]
    const login = `${first.toLowerCase()}${i + 1}`
    // Vary working days for a few so per-person working-day + coverage logic
    // has something to exercise: every 9th works a 6-day week, every 13th a
    // 4-day week; the rest default to Mon–Fri.
    const workingDays =
      i % 9 === 0
        ? [false, true, true, true, true, true, true]
        : i % 13 === 0
          ? [false, true, true, true, true, false, false]
          : undefined
    out.push({
      login,
      name: `${first} ${last}`,
      characterKey: FILLER_AVATARS[i % FILLER_AVATARS.length],
      email: `${login}@acmedemo.in`,
      role: 'member',
      discipline: role.discipline,
      jobTitle: role.title,
      birthdayMmDd: FILLER_BIRTHDAYS[i % FILLER_BIRTHDAYS.length],
      joinedOn: FILLER_JOINED[i % FILLER_JOINED.length],
      reportsTo: FILLER_MANAGERS[i % FILLER_MANAGERS.length],
      workingDays,
    })
  }
  return out
}

// Final roster = hand-crafted core cast + generated fillers, padded to 50.
const SEED_HEROES: Seed[] = [...SEED_CORE, ...makeFillers()]

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
        // People-care fields — drives birthday + anniversary widget.
        birthdayMmDd: s.birthdayMmDd,
        joinedOn: s.joinedOn,
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
      // Pre-fill the GitHub allowlist so engineering events are auto-filtered.
      trackedGithubOrgs: ['acme'],
    })
    .returning()
  // Two-pass membership insert: first pass writes everyone WITHOUT
  // `reportsToMembershipId`, then a second pass back-fills the chain now
  // that we know each row's membership id.
  const membershipByLogin = new Map<string, number>()
  for (const u of userRows) {
    const [m] = await db
      .insert(schema.memberships)
      .values({
        orgId: org.id,
        userId: u.id,
        role: u.seed.role,
        discipline: u.seed.discipline,
        jobTitle: u.seed.jobTitle,
        extraCaps: u.seed.extraCaps ?? [],
        workingDays: u.seed.workingDays ?? [false, true, true, true, true, true, false],
      })
      .returning()
    membershipByLogin.set(u.seed.login, m.id)
  }
  // Back-fill reports-to chain.
  for (const u of userRows) {
    if (!u.seed.reportsTo) continue
    const childId = membershipByLogin.get(u.seed.login)
    const parentId = membershipByLogin.get(u.seed.reportsTo)
    if (childId && parentId) {
      await db
        .update(schema.memberships)
        .set({ reportsToMembershipId: parentId })
        .where(eq(schema.memberships.id, childId))
    }
  }
  console.log(`[seed-demo] created org id=${org.id} with disciplines, caps, and reports-to chain`)

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
      await db.insert(schema.shifts).values({
        userId: u.id,
        orgId: org.id,
        punchedInAt: start,
        punchedInVia: 'agent',
        punchedOutAt: end,
        punchedOutVia: 'agent',
        workSummary: SAMPLE_SUMMARIES[Math.floor(Math.random() * SAMPLE_SUMMARIES.length)],
        // Verification is gatekept (depends on screenshot evidence) — seeded
        // shifts mirror the shipped, un-judged state so the demo never shows a
        // 'verified'/'suspect' pill.
        verificationStatus: 'skipped',
      })
    }
  }

  // ─── Breaks ────────────────────────────────────────────────────────────────
  // Mix of categories so the dashboard shows a healthy variety:
  //   - 'blocked'  → opens the Blocker Resolver
  //   - 'focus'    → heads-down, do not disturb
  //   - 'lunch'    → out for food
  //   - 'other'    → generic pause
  const ongoingBreaks: Array<{
    login: string
    reason: string
    minutesAgo: number
    category: 'blocked' | 'focus' | 'lunch' | 'meeting' | 'other'
    waitingOnLogin?: string
    waitingOnExternal?: string
  }> = [
    // Real blockers — these power the Blocker Resolver demo
    {
      login: 'arjun',
      reason: "Waiting on Rahul to approve the deployment for the Stripe webhook PR. Can't merge without sign-off.",
      minutesAgo: 47,
      category: 'blocked',
      waitingOnLogin: 'rahul',
    },
    {
      login: 'sneha',
      reason: 'Need final brand colors from marketing to ship the onboarding screens.',
      minutesAgo: 125,
      category: 'blocked',
      waitingOnLogin: 'kavya',
    },
    {
      login: 'natasha',
      reason: 'Customer asked for SSO pricing. Need engineering sign-off on quote.',
      minutesAgo: 22,
      category: 'blocked',
      waitingOnExternal: 'TechFlow procurement',
    },
    // Non-blockers — should NOT open the resolver, just appear as "Paused"
    {
      login: 'priya',
      reason: 'Quick coffee — back in 10',
      minutesAgo: 7,
      category: 'other',
    },
    {
      login: 'kavya',
      reason: 'Design sync with the team',
      minutesAgo: 14,
      category: 'meeting',
    },
  ]
  for (const b of ongoingBreaks) {
    const uid = byLogin.get(b.login)
    if (!uid) continue
    const waitingOnUserId = b.waitingOnLogin ? byLogin.get(b.waitingOnLogin) ?? null : null
    await db.insert(schema.breaks).values({
      userId: uid,
      orgId: org.id,
      startedAt: new Date(now.getTime() - b.minutesAgo * 60_000),
      reason: b.reason,
      category: b.category,
      waitingOnUserId,
      waitingOnExternal: b.waitingOnExternal ?? null,
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
  const DAY = 24 * 60 * 60 * 1000
  const STATUSES = ['merged', 'merged', 'open', 'in_review', 'closed', 'draft'] as const
  const VERDICTS = ['APPROVED', 'APPROVED', 'CHANGES_REQUESTED', 'COMMENTED']
  const pick = <T,>(a: readonly T[]): T => a[Math.floor(Math.random() * a.length)]!
  const shuffle = <T,>(a: T[]): T[] => [...a].sort(() => Math.random() - 0.5)

  const events: Array<typeof schema.githubEvents.$inferInsert> = []
  let gseq = 0
  // Track each engineer's PRs so others can review them → collaboration edges.
  const prsByUser = new Map<number, Array<{ title: string; repo: string; url: string }>>()
  for (const u of userRows) {
    const isEng = u.seed.discipline === 'engineering'
    const commitN = isEng ? 4 + Math.floor(Math.random() * 12) : Math.floor(Math.random() * 4)
    for (let i = 0; i < commitN; i++) {
      const repo = pick(REPOS)
      events.push({
        userId: u.id, type: 'commit', repo, title: pick(COMMIT_MSGS),
        url: `https://github.com/${repo}/commit/${Math.random().toString(36).slice(2, 10)}`,
        externalId: `seed-c-${gseq++}`, occurredAt: new Date(now.getTime() - Math.floor(Math.random() * 13 * DAY)),
        raw: { source: 'seed' },
      })
    }
    if (isEng) {
      const myPrs: Array<{ title: string; repo: string; url: string }> = []
      const prN = 1 + Math.floor(Math.random() * 3)
      for (let i = 0; i < prN; i++) {
        const repo = pick(REPOS)
        const title = pick(PR_TITLES)
        const url = `https://github.com/${repo}/pull/${100 + gseq}`
        const status = pick(STATUSES)
        events.push({
          userId: u.id, type: 'pr_opened', repo, title, url,
          externalId: `seed-pr-${gseq++}`, occurredAt: new Date(now.getTime() - Math.floor(Math.random() * 12 * DAY)),
          raw: { status, requestedReviewers: status === 'in_review' ? 1 : 0, source: 'seed' },
        })
        myPrs.push({ title, repo, url })
      }
      prsByUser.set(u.id, myPrs)
    }
  }
  // Cross-reviews: each engineer reviews 1-3 PRs authored by OTHER engineers.
  const engRows = userRows.filter((u) => u.seed.discipline === 'engineering')
  for (const reviewer of engRows) {
    const targets = shuffle(engRows.filter((e) => e.id !== reviewer.id)).slice(0, 1 + Math.floor(Math.random() * 3))
    for (const author of targets) {
      const prs = prsByUser.get(author.id) ?? []
      if (prs.length === 0) continue
      const pr = pick(prs)
      events.push({
        userId: reviewer.id, type: 'pr_reviewed', repo: pr.repo, title: pr.title, url: pr.url,
        externalId: `seed-rev-${reviewer.id}-${author.id}-${gseq++}`,
        occurredAt: new Date(now.getTime() - Math.floor(Math.random() * 10 * DAY)),
        raw: { prAuthor: author.seed.login, verdict: pick(VERDICTS), source: 'seed' },
      })
    }
  }
  if (events.length > 0) {
    for (let i = 0; i < events.length; i += 50) await db.insert(schema.githubEvents).values(events.slice(i, i + 50))
  }
  console.log(`[seed-demo] inserted ${events.length} GitHub events (PR statuses + cross-reviews)`)

  // ─── Calendar meetings (powers the integrations Calendar + company map) ────
  const MTG_TITLES = ['Sprint planning', 'Design review', 'Weekly 1:1', 'Eng sync', 'Product roadmap', 'Customer call', 'Sprint retro', 'Standup', 'Hiring loop', 'All-hands']
  const meetingsToInsert: Array<typeof schema.meetings.$inferInsert> = []
  let mseq = 0
  for (const host of userRows.slice(0, Math.min(18, userRows.length))) {
    const mN = 1 + Math.floor(Math.random() * 4)
    for (let i = 0; i < mN; i++) {
      const dayOffset = Math.floor(Math.random() * 29) - 14
      const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() + dayOffset, 9 + Math.floor(Math.random() * 8), Math.random() < 0.5 ? 0 : 30)
      const end = new Date(start.getTime() + (1 + Math.floor(Math.random() * 3)) * 30 * 60_000)
      const guests = shuffle(userRows.filter((u) => u.id !== host.id)).slice(0, 2 + Math.floor(Math.random() * 3))
      meetingsToInsert.push({
        userId: host.id, provider: 'google', externalId: `seed-mtg-${mseq++}`, calendarId: 'primary',
        title: pick(MTG_TITLES), startAt: start, endAt: end,
        attendees: guests.map((g) => g.seed.email).filter((e): e is string => !!e),
        rsvpStatus: 'accepted', conferenceUrl: 'https://meet.google.com/seed-demo',
      })
    }
  }
  if (meetingsToInsert.length > 0) {
    for (let i = 0; i < meetingsToInsert.length; i += 50) await db.insert(schema.meetings).values(meetingsToInsert.slice(i, i + 50))
  }
  console.log(`[seed-demo] inserted ${meetingsToInsert.length} calendar meetings`)

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

  // ─── Self-reported deliverables — universal output ────────────────────────
  // One per non-engineer + a couple for engineers, spread over the last week.
  const DELIVERABLES: Array<{ login: string; kind: string; title: string; url?: string; daysAgo: number }> = [
    // Designer
    { login: 'sneha', kind: 'design', title: 'Shipped onboarding redesign v2', url: 'https://figma.com/file/onboarding-v2', daysAgo: 0 },
    { login: 'sneha', kind: 'design', title: 'Design review for billing flow', daysAgo: 2 },
    // Sales
    { login: 'natasha', kind: 'deal', title: 'Closed annual deal — TechFlow ₹12 lakh', daysAgo: 0 },
    { login: 'natasha', kind: 'deal', title: '3 demos scheduled this week', daysAgo: 1 },
    { login: 'natasha', kind: 'deal', title: 'Renewed Acme Corp — 2 year term', daysAgo: 4 },
    // Support
    { login: 'sid', kind: 'ticket', title: 'Resolved 14 tickets · CSAT 4.8', daysAgo: 0 },
    { login: 'sid', kind: 'ticket', title: 'Published new FAQ page', url: 'https://acmedemo.in/help', daysAgo: 3 },
    // Marketing
    { login: 'kavya', kind: 'campaign', title: 'Launched Q2 webinar series', daysAgo: 1 },
    { login: 'kavya', kind: 'campaign', title: 'Posted weekly newsletter (2.4k opens)', daysAgo: 5 },
    // Ops
    { login: 'dev', kind: 'task', title: 'Closed Q1 books, sent to CA', daysAgo: 2 },
    { login: 'dev', kind: 'task', title: 'Renewed all SaaS subscriptions', daysAgo: 6 },
    // Product
    { login: 'priya', kind: 'spec', title: 'Finalised Q3 roadmap', daysAgo: 1 },
    // Engineering (a couple, since engineers ALSO can log non-GH work)
    { login: 'rahul', kind: 'spec', title: 'Architecture doc for billing v2', daysAgo: 3 },
    { login: 'arjun', kind: 'task', title: 'Investigated Stripe webhook race condition', daysAgo: 4 },
    // Founder
    { login: 'tanish', kind: 'decision', title: 'Hiring freeze decision documented', daysAgo: 2 },
  ]
  let deliverablesInserted = 0
  for (const d of DELIVERABLES) {
    const uid = byLogin.get(d.login)
    if (!uid) continue
    const completedAt = new Date(now.getTime() - d.daysAgo * 24 * 60 * 60_000 - Math.floor(Math.random() * 6 * 60 * 60_000))
    await db.insert(schema.deliverables).values({
      userId: uid,
      orgId: org.id,
      title: d.title,
      url: d.url ?? null,
      kind: d.kind,
      completedAt,
      pinnedShotAt: completedAt,
    })
    deliverablesInserted++
  }
  console.log(`[seed-demo] inserted ${deliverablesInserted} self-reported deliverables`)

  // ─── A scheduled 1:1 between owner and a designer ─────────────────────────
  const designerId = byLogin.get('sneha')
  if (designerId) {
    const tomorrow15 = new Date(now)
    tomorrow15.setDate(tomorrow15.getDate() + 1)
    tomorrow15.setHours(15, 0, 0, 0)
    await db.insert(schema.scheduledMeetings).values({
      orgId: org.id,
      organiserUserId: owner.id,
      attendeeUserId: designerId,
      title: '1:1 with Sneha — design retro',
      agenda: 'How did the onboarding redesign land? Anything blocking us for Q3?',
      startAt: tomorrow15,
      endAt: new Date(tomorrow15.getTime() + 30 * 60_000),
    })
    console.log(`[seed-demo] scheduled a sample 1:1 with @sneha`)
  }

  // ─── Review cycle + past 1:1s ─────────────────────────────────────────────
  // Gives the Reviews & 1:1s page real data to test: an open cycle whose window
  // covers the seeded narratives (→ "review on file"), plus a spread of PAST
  // 1:1s with mixed recency so the cadence column shows both fresh and overdue.
  const ymd = (d: Date) => d.toISOString().slice(0, 10)
  await db.insert(schema.reviewCycles).values({
    orgId: org.id,
    name: 'H1 2026 review',
    periodStart: ymd(new Date(now.getTime() - 30 * 24 * 60 * 60_000)),
    periodEnd: ymd(new Date(now.getTime() + 1 * 24 * 60 * 60_000)),
    status: 'open',
    createdByUserId: owner.id,
  })
  console.log('[seed-demo] opened a review cycle (H1 2026 review)')

  const ONE_ON_ONES: Array<{ login: string; daysAgo: number }> = [
    { login: 'arjun', daysAgo: 6 },
    { login: 'priya', daysAgo: 12 },
    { login: 'rahul', daysAgo: 23 },
    { login: 'noah', daysAgo: 39 },
    { login: 'logan', daysAgo: 52 }, // overdue (>45d)
    { login: 'dev', daysAgo: 64 }, //   overdue
  ]
  let oneOnOnesSeeded = 0
  for (const o of ONE_ON_ONES) {
    const uid = byLogin.get(o.login)
    if (!uid || uid === owner.id) continue
    const startAt = new Date(now.getTime() - o.daysAgo * 24 * 60 * 60_000)
    startAt.setHours(11, 0, 0, 0)
    await db.insert(schema.scheduledMeetings).values({
      orgId: org.id,
      organiserUserId: owner.id,
      attendeeUserId: uid,
      title: `1:1 with @${o.login}`,
      agenda: 'Progress, blockers, growth.',
      startAt,
      endAt: new Date(startAt.getTime() + 30 * 60_000),
    })
    oneOnOnesSeeded++
  }
  console.log(`[seed-demo] scheduled ${oneOnOnesSeeded} past 1:1s (mixed cadence)`)

  // ─── Teams ────────────────────────────────────────────────────────────────
  // Map login → membershipId so we can wire team leads + members cleanly.
  const SEED_TEAMS: Array<{
    name: string
    description: string
    color: string
    leadLogin: string
    memberLogins: string[]
  }> = [
    {
      name: 'Engineering',
      description: 'Backend, frontend, mobile, platform — everything that ships code.',
      color: '#3f6b54',
      leadLogin: 'rahul',
      memberLogins: ['rahul', 'arjun', 'logan', 'dev', 'ira', 'maya'],
    },
    {
      name: 'Design + Product',
      description: 'Crafts the surface and decides what we build next.',
      color: '#c47b56',
      leadLogin: 'priya',
      memberLogins: ['priya', 'sneha', 'noah', 'tara'],
    },
    {
      name: 'Go-to-market',
      description: 'Sales, marketing, and customer success.',
      color: '#c19a4d',
      leadLogin: 'rohan',
      memberLogins: ['rohan', 'natasha', 'omar', 'kavya', 'zara'],
    },
    {
      name: 'People + Ops',
      description: 'Hiring, payroll, operations, finance.',
      color: '#7c2d12',
      leadLogin: 'aisha',
      memberLogins: ['aisha', 'ravi', 'farah', 'vikram', 'sid', 'mei'],
    },
    {
      name: 'Founders',
      description: 'Tanish + Maya. Shared accountability for the whole company.',
      color: '#1f3d2c',
      leadLogin: 'tanish',
      memberLogins: ['tanish', 'maya'],
    },
  ]

  for (const t of SEED_TEAMS) {
    const leadId = membershipByLogin.get(t.leadLogin) ?? null
    const [team] = await db
      .insert(schema.teams)
      .values({
        orgId: org.id,
        name: t.name,
        description: t.description,
        color: t.color,
        managerMembershipId: leadId,
      })
      .returning()
    for (const login of t.memberLogins) {
      const mid = membershipByLogin.get(login)
      if (!mid) continue
      await db
        .insert(schema.teamMembers)
        .values({ teamId: team.id, membershipId: mid })
        .onConflictDoNothing()
    }
  }
  console.log(`[seed-demo] created ${SEED_TEAMS.length} teams with leads + members`)

  void and
  console.log(`[seed-demo] ✓ done. Sign in at /dev/login to test any user.`)
  console.log(`[seed-demo]   • Owners:    @tanish, @maya`)
  console.log(`[seed-demo]   • HR head:   @aisha   (full HR caps + view_all_data)`)
  console.log(`[seed-demo]   • Eng mgr:   @rahul   (manage_integrations + export_data)`)
  console.log(`[seed-demo]   • Finance:   @vikram  (manage_billing — owner-shaped)`)
  console.log(`[seed-demo]   • Member:    @arjun, @sneha, … (no extra caps)`)
  console.log(`[seed-demo] 3-level chain to test reports-to: tanish → aisha → sid → mei`)
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('[seed-demo] failed:', err)
    process.exit(1)
  })
