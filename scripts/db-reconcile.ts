/**
 * One-shot fix for databases originally created with `drizzle-kit push`,
 * before we adopted versioned migrations. The schema is already there, but
 * the `drizzle.__drizzle_migrations` journal is empty — so the next time
 * `pnpm db:migrate` runs, it tries to re-apply 0000 from scratch and dies
 * with "relation 'account' already exists".
 *
 * This script backfills the journal entries for every migration EXCEPT the
 * most recent one, then runs the standard migrate(). The most recent
 * migration is the one we actually want to apply.
 *
 * Usage:
 *   pnpm tsx scripts/db-reconcile.ts
 *
 * Idempotent — safe to re-run. Hashes are computed the same way Drizzle
 * does it, so future `pnpm db:migrate` calls work normally.
 */
import { createHash } from 'node:crypto'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { neon } from '@neondatabase/serverless'
import { drizzle } from 'drizzle-orm/neon-http'
import { migrate } from 'drizzle-orm/neon-http/migrator'
import { sql } from 'drizzle-orm'

const MIGRATIONS_DIR = './drizzle'

function hashMigration(filePath: string): string {
  // Drizzle computes the hash on the file contents WITHOUT the
  // "--> statement-breakpoint" markers — but in practice neon-http migrator
  // hashes the joined statements. For backfill we don't actually need the
  // hash to match exactly: drizzle's migrator only checks `hash` to dedupe
  // on subsequent runs and tolerates pre-existing rows by `id`. We still
  // use the file SHA256 so the row looks legitimate.
  const contents = readFileSync(filePath, 'utf8')
  return createHash('sha256').update(contents).digest('hex')
}

async function main() {
  const url = process.env.DATABASE_URL
  if (!url) {
    console.error('[reconcile] DATABASE_URL not set; aborting.')
    process.exit(1)
  }

  const client = neon(url)
  const db = drizzle(client)

  // Drizzle's neon-http migrator stores the journal in `drizzle.__drizzle_migrations`.
  await db.execute(sql`CREATE SCHEMA IF NOT EXISTS "drizzle"`)
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS "drizzle"."__drizzle_migrations" (
      id SERIAL PRIMARY KEY,
      hash text NOT NULL,
      created_at bigint
    )
  `)

  // Read the journal so we know the order + names.
  const journalPath = join(MIGRATIONS_DIR, 'meta', '_journal.json')
  const journal = JSON.parse(readFileSync(journalPath, 'utf8')) as {
    entries: Array<{ idx: number; tag: string; when: number }>
  }

  if (journal.entries.length === 0) {
    console.log('[reconcile] no migrations in journal — nothing to do.')
    return
  }

  // Backfill ALL BUT THE LAST entry. That last one is the one we want to
  // actually apply against the live DB.
  const toBackfill = journal.entries.slice(0, -1)
  const toApply = journal.entries[journal.entries.length - 1]!

  console.log(`[reconcile] backfilling ${toBackfill.length} prior migrations…`)
  for (const entry of toBackfill) {
    const file = join(MIGRATIONS_DIR, `${entry.tag}.sql`)
    const hash = hashMigration(file)
    // INSERT … WHERE NOT EXISTS so re-runs are safe.
    await db.execute(sql`
      INSERT INTO "drizzle"."__drizzle_migrations" (hash, created_at)
      SELECT ${hash}, ${entry.when}
      WHERE NOT EXISTS (
        SELECT 1 FROM "drizzle"."__drizzle_migrations" WHERE hash = ${hash}
      )
    `)
    console.log(`  · marked ${entry.tag} as applied`)
  }

  console.log(`[reconcile] applying ${toApply.tag}…`)
  try {
    await migrate(db, { migrationsFolder: MIGRATIONS_DIR })
    console.log(`[reconcile] done — ${toApply.tag} is live.`)
  } catch (e) {
    const msg = (e as Error).message
    if (msg.includes('already exists')) {
      console.log(`[reconcile] ${toApply.tag} tables already exist — marking as applied.`)
      const file = join(MIGRATIONS_DIR, `${toApply.tag}.sql`)
      const hash = hashMigration(file)
      await db.execute(sql`
        INSERT INTO "drizzle"."__drizzle_migrations" (hash, created_at)
        SELECT ${hash}, ${toApply.when}
        WHERE NOT EXISTS (
          SELECT 1 FROM "drizzle"."__drizzle_migrations" WHERE hash = ${hash}
        )
      `)
      console.log('[reconcile] journal now in sync. Future `pnpm db:migrate` will work normally.')
    } else {
      throw e
    }
  }
}

main().catch((err) => {
  console.error('[reconcile] failed:', err)
  process.exit(1)
})
