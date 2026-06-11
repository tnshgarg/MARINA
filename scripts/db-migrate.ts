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
 * NEVER use `pnpm db:push` against production — that command modifies
 * tables directly without a version trail and can drop columns / data.
 *
 * Uses the same neon-http driver as the runtime, so no extra deps required.
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

  console.log('[migrate] applying migrations from ./drizzle')
  try {
    const sql = neon(url)
    const db = drizzle(sql)
    await migrate(db, { migrationsFolder: './drizzle' })
    console.log('[migrate] complete')
  } catch (err) {
    console.error('[migrate] failed:', err)
    process.exit(1)
  }
}

main().catch((err) => {
  console.error('[migrate] uncaught:', err)
  process.exit(1)
})
