/**
 * DANGER — wipes ALL ROWS from every table in the public schema
 * (TRUNCATE ... RESTART IDENTITY CASCADE), keeping the schema intact.
 *
 * Deliberate safety rails:
 *   1. Reads ONLY `WIPE_DATABASE_URL` — it never falls back to `DATABASE_URL`,
 *      so it can't accidentally wipe the dev database.
 *   2. Default run is a DRY RUN: it prints the target host + a per-table row
 *      count so you can see exactly what would be destroyed, and deletes nothing.
 *   3. To actually execute you must pass `--yes-wipe` AND set
 *      `WIPE_CONFIRM_HOST` to the exact "host/db" string the dry run prints.
 *
 * Usage:
 *   # 1) DRY RUN — see what's there:
 *   WIPE_DATABASE_URL="postgres://...PROD..." pnpm tsx scripts/wipe-prod.ts
 *   # 2) EXECUTE — re-run armed with the host it printed:
 *   WIPE_DATABASE_URL="..." WIPE_CONFIRM_HOST="ep-xxx.../dbname" \
 *     pnpm tsx scripts/wipe-prod.ts --yes-wipe
 */
import { neon } from '@neondatabase/serverless'

async function main() {
  const url = process.env.WIPE_DATABASE_URL
  if (!url) {
    console.error('Refusing to run: set WIPE_DATABASE_URL to the PROD connection string.')
    console.error('(This script intentionally does NOT read DATABASE_URL, so it can never wipe dev by accident.)')
    process.exit(1)
  }
  const sql = neon(url)
  const m = url.match(/@([^/]+)\/([^?]+)/)
  const host = m ? `${m[1]}/${m[2]}` : '(unparsed)'
  console.log('TARGET DB:', host)

  const tables = (await sql.query(
    `SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename`,
  )) as Array<{ tablename: string }>
  if (tables.length === 0) {
    console.log('No public tables found — nothing to wipe.')
    return
  }

  console.log(`\nRow counts (${tables.length} tables):`)
  let total = 0
  for (const t of tables) {
    const r = (await sql.query(`SELECT count(*)::int AS n FROM "${t.tablename}"`)) as Array<{ n: number }>
    const n = r[0]?.n ?? 0
    total += n
    console.log(`  ${t.tablename.padEnd(34)} ${n}`)
  }
  console.log(`  ${'TOTAL ROWS'.padEnd(34)} ${total}\n`)

  const armed = process.argv.includes('--yes-wipe') && process.env.WIPE_CONFIRM_HOST === host
  if (!armed) {
    console.log('DRY RUN — nothing was deleted.')
    console.log('To EXECUTE, re-run with --yes-wipe AND set WIPE_CONFIRM_HOST to exactly:')
    console.log(`  ${host}`)
    return
  }

  const list = tables.map((t) => `"${t.tablename}"`).join(', ')
  await sql.query(`TRUNCATE TABLE ${list} RESTART IDENTITY CASCADE`)
  console.log(`WIPED ${tables.length} tables (was ${total} rows). Schema intact.`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
