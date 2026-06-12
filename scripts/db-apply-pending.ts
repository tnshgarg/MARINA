/**
 * Idempotent direct-apply of every schema change that's been added since
 * the last time you ran a migrate. Uses IF NOT EXISTS / EXCEPTION-safe
 * patterns so it's safe to re-run any number of times, regardless of
 * what state `drizzle.__drizzle_migrations` is in.
 *
 * This is the script to reach for when:
 *   - The runtime says "column X does not exist" and you don't want to
 *     debug the migrator's journal state.
 *   - You're in dev and just need the DB shape to match the code NOW.
 *
 * After running this, the journal is also patched so future migrations
 * pick up where they left off cleanly.
 *
 * Usage:
 *   pnpm tsx --env-file=.env scripts/db-apply-pending.ts
 */
import { neon } from '@neondatabase/serverless'
import { drizzle } from 'drizzle-orm/neon-http'
import { sql } from 'drizzle-orm'

async function main() {
  const url = process.env.DATABASE_URL
  if (!url) {
    console.error('[apply] DATABASE_URL not set; aborting.')
    process.exit(1)
  }
  const client = neon(url)
  const db = drizzle(client)

  console.log('[apply] applying pending schema deltas (idempotent)…')

  // 0003 — Slack columns (memberships + orgs).
  await db.execute(sql`ALTER TABLE "memberships" ADD COLUMN IF NOT EXISTS "slack_user_id" text`)
  await db.execute(sql`ALTER TABLE "memberships" ADD COLUMN IF NOT EXISTS "slack_resolved_at" timestamp with time zone`)
  await db.execute(sql`ALTER TABLE "orgs" ADD COLUMN IF NOT EXISTS "slack_team_id" text`)
  await db.execute(sql`ALTER TABLE "orgs" ADD COLUMN IF NOT EXISTS "slack_team_name" text`)
  await db.execute(sql`ALTER TABLE "orgs" ADD COLUMN IF NOT EXISTS "slack_bot_token" text`)
  await db.execute(sql`ALTER TABLE "orgs" ADD COLUMN IF NOT EXISTS "slack_bot_user_id" text`)
  await db.execute(sql`ALTER TABLE "orgs" ADD COLUMN IF NOT EXISTS "slack_default_channel_id" text`)
  await db.execute(sql`ALTER TABLE "orgs" ADD COLUMN IF NOT EXISTS "slack_installed_at" timestamp with time zone`)
  console.log('  · 0003 slack columns OK')

  // 0004 — Workspace logo.
  await db.execute(sql`ALTER TABLE "orgs" ADD COLUMN IF NOT EXISTS "logo_url" text`)
  console.log('  · 0004 orgs.logo_url OK')

  // 0006 — Multi-manager join table.
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS "membership_managers" (
      "id" serial PRIMARY KEY NOT NULL,
      "membership_id" integer NOT NULL REFERENCES "memberships"("id") ON DELETE CASCADE,
      "manager_membership_id" integer NOT NULL REFERENCES "memberships"("id") ON DELETE CASCADE,
      "created_at" timestamp with time zone DEFAULT now() NOT NULL
    )
  `)
  await db.execute(sql`
    CREATE UNIQUE INDEX IF NOT EXISTS "membership_managers_pair_uniq"
    ON "membership_managers" USING btree ("membership_id","manager_membership_id")
  `)
  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS "membership_managers_manager_idx"
    ON "membership_managers" USING btree ("manager_membership_id")
  `)
  console.log('  · 0006 membership_managers OK')

  // 0005 — Teams + team_members.
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS "teams" (
      "id" serial PRIMARY KEY NOT NULL,
      "org_id" integer NOT NULL REFERENCES "orgs"("id") ON DELETE CASCADE,
      "name" text NOT NULL,
      "description" text,
      "manager_membership_id" integer,
      "color" text,
      "created_at" timestamp with time zone DEFAULT now() NOT NULL
    )
  `)
  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS "teams_org_idx" ON "teams" USING btree ("org_id","name")
  `)
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS "team_members" (
      "id" serial PRIMARY KEY NOT NULL,
      "team_id" integer NOT NULL REFERENCES "teams"("id") ON DELETE CASCADE,
      "membership_id" integer NOT NULL REFERENCES "memberships"("id") ON DELETE CASCADE,
      "added_at" timestamp with time zone DEFAULT now() NOT NULL
    )
  `)
  await db.execute(sql`
    CREATE UNIQUE INDEX IF NOT EXISTS "team_members_team_membership_uniq"
    ON "team_members" USING btree ("team_id","membership_id")
  `)
  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS "team_members_membership_idx"
    ON "team_members" USING btree ("membership_id")
  `)
  console.log('  · 0005 teams + team_members OK')

  // Mark every migration in the journal as applied so the next normal
  // `pnpm db:migrate` knows everything is in sync.
  const journalPath = './drizzle/meta/_journal.json'
  const { readFileSync } = await import('node:fs')
  const { createHash } = await import('node:crypto')
  const journal = JSON.parse(readFileSync(journalPath, 'utf8')) as {
    entries: Array<{ tag: string; when: number }>
  }
  await db.execute(sql`CREATE SCHEMA IF NOT EXISTS "drizzle"`)
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS "drizzle"."__drizzle_migrations" (
      id SERIAL PRIMARY KEY,
      hash text NOT NULL,
      created_at bigint
    )
  `)
  for (const entry of journal.entries) {
    const file = `./drizzle/${entry.tag}.sql`
    const contents = readFileSync(file, 'utf8')
    const hash = createHash('sha256').update(contents).digest('hex')
    await db.execute(sql`
      INSERT INTO "drizzle"."__drizzle_migrations" (hash, created_at)
      SELECT ${hash}, ${entry.when}
      WHERE NOT EXISTS (SELECT 1 FROM "drizzle"."__drizzle_migrations" WHERE hash = ${hash})
    `)
  }
  console.log('[apply] journal patched — future `pnpm db:migrate` will be a no-op until you add a new schema change.')
}

main().catch((err) => {
  console.error('[apply] failed:', err)
  process.exit(1)
})
