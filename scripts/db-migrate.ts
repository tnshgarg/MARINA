/**
 * Apply pending Drizzle migrations against the configured DATABASE_URL.
 *
 * Usage:
 *   pnpm db:migrate
 *
 * Run this in CI/CD before the app starts. Example for Vercel — add to
 * vercel.json:
 *   { "buildCommand": "pnpm db:migrate && next build" }
 *
 * What this does, in order:
 *   1. Runs the standard Drizzle migrator over `./drizzle/0000_*.sql` →
 *      `0006_*.sql`. These are the version-controlled migrations.
 *   2. Runs `scripts/db-apply-pending.ts`, which contains idempotent
 *      `ALTER TABLE … IF NOT EXISTS` / `CREATE TABLE IF NOT EXISTS` /
 *      `UPDATE … WHERE …` statements for every schema change made AFTER
 *      0006 that hasn't been turned into a numbered Drizzle migration yet
 *      (announcements table, owner→admin role rename, multi-manager
 *      column, etc.).
 *
 * Both steps are idempotent — re-running this is safe. The chained design
 * means a single `pnpm db:migrate` lands the entire schema, with no
 * "you also need to run apply-pending" footguns. The two scripts will be
 * unified into one numbered migration system when we next generate one.
 *
 * NEVER use `pnpm db:push` against production — that command modifies
 * tables directly without a version trail and can drop columns / data.
 */
import { neon } from '@neondatabase/serverless'
import { drizzle } from 'drizzle-orm/neon-http'
import { migrate } from 'drizzle-orm/neon-http/migrator'

async function main() {
  const url = process.env.DATABASE_URL
  if (!url) {
    console.error('[migrate] DATABASE_URL not set; aborting.')
    process.exit(1)
  }

  console.log('[migrate] step 1/2 · applying numbered migrations from ./drizzle')
  try {
    const sql = neon(url)
    const db = drizzle(sql)
    await migrate(db, { migrationsFolder: './drizzle' })
    console.log('[migrate]   numbered migrations OK')
  } catch (err) {
    console.error('[migrate] step 1 failed:', err)
    process.exit(1)
  }

  console.log('[migrate] step 2/2 · applying idempotent post-0006 deltas (apply-pending)')
  try {
    const { applyPending } = await import('./db-apply-pending')
    await applyPending()
    console.log('[migrate] complete')
  } catch (err) {
    console.error('[migrate] step 2 failed:', err)
    process.exit(1)
  }
}

main().catch((err) => {
  console.error('[migrate] uncaught:', err)
  process.exit(1)
})
