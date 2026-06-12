/**
 * Seed the early-bird promo codes for design partners and the first wave.
 *
 * Usage:
 *   pnpm tsx scripts/seed-early-bird-codes.ts
 *
 * Idempotent — uses ON CONFLICT (code) DO NOTHING so re-running won't blow up
 * already-redeemed codes or reset their counters.
 *
 * Edit the array below to add new batches. Codes are case-insensitive (the
 * redemption flow upper-cases everything) but keep them uppercase in source
 * so it's clear what we hand to customers.
 */
import { sql } from 'drizzle-orm'
import { db, schema } from '@/lib/db/client'

type Seed = {
  code: string
  plan: 'team' | 'scale'
  durationDays: number | null  // null = lifetime
  maxRedemptions: number
  notes: string
}

const SEEDS: Seed[] = [
  // Lifetime founding-customer grants — hand-pick.
  { code: 'FOUNDERS24',  plan: 'team',  durationDays: null, maxRedemptions: 25, notes: 'First-25 design partners — lifetime Team' },
  { code: 'CHIEFSTAFF',  plan: 'scale', durationDays: null, maxRedemptions: 5,  notes: 'Hand-curated launch advocates — lifetime Scale' },

  // Time-boxed pilots.
  { code: 'PILOT90',     plan: 'team',  durationDays: 90,   maxRedemptions: 50, notes: '90-day Team pilot — broad outreach' },
  { code: 'YCS26',       plan: 'team',  durationDays: 180,  maxRedemptions: 30, notes: 'YC S26 batch — 6 months' },
  { code: 'INDIASTACK',  plan: 'team',  durationDays: 365,  maxRedemptions: 20, notes: 'India Stack ecosystem — 1 year' },
]

async function main() {
  console.log(`[seed-early-bird] seeding ${SEEDS.length} codes…`)
  for (const s of SEEDS) {
    // We can't easily express ON CONFLICT through Drizzle's typed insert
    // for this case, so fall back to raw SQL for the upsert semantics.
    await db.execute(sql`
      INSERT INTO early_bird_codes
        (code, plan, duration_days, max_redemptions, notes)
      VALUES
        (${s.code}, ${s.plan}, ${s.durationDays}, ${s.maxRedemptions}, ${s.notes})
      ON CONFLICT (code) DO NOTHING
    `)
    console.log(`  · ${s.code.padEnd(12)} ${s.plan.padEnd(5)} ${s.durationDays === null ? 'lifetime'.padEnd(8) : (s.durationDays + 'd').padEnd(8)} ×${s.maxRedemptions}`)
  }
  console.log('[seed-early-bird] done — existing rows untouched (ON CONFLICT DO NOTHING)')
  // Force flush via process exit; the neon-http driver doesn't hold a pool.
}

main().catch((err) => {
  console.error('[seed-early-bird] failed:', err)
  process.exit(1)
})
