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

/**
 * Exported so `scripts/db-migrate.ts` can await this work without spawning
 * a subprocess. Also runs as a standalone CLI via the `main()` call at the
 * bottom — both invocation styles are supported.
 */
export async function applyPending(): Promise<void> {
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

  // 0007 — Founder announcements (in-app banner).
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS "announcements" (
      "id" serial PRIMARY KEY NOT NULL,
      "title" text NOT NULL,
      "body" text NOT NULL,
      "severity" text NOT NULL DEFAULT 'info',
      "audience" text NOT NULL DEFAULT 'all',
      "href" text,
      "starts_at" timestamp with time zone NOT NULL DEFAULT now(),
      "ends_at" timestamp with time zone,
      "created_by_user_id" integer REFERENCES "users"("id") ON DELETE SET NULL,
      "created_at" timestamp with time zone NOT NULL DEFAULT now()
    )
  `)
  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS "announcements_active_idx"
    ON "announcements" USING btree ("starts_at","ends_at")
  `)
  console.log('  · 0007 announcements OK')

  // 0008 — Role rename: owner → admin. Multiple admins per org is now the
  // model. Re-running this is a no-op once every row has been flipped.
  await db.execute(sql`UPDATE "memberships" SET "role" = 'admin' WHERE "role" = 'owner'`)
  console.log('  · 0008 role rename owner→admin OK')

  // 0009 — Product analytics events table.
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS "analytics_events" (
      "id" serial PRIMARY KEY NOT NULL,
      "org_id" integer REFERENCES "orgs"("id") ON DELETE CASCADE,
      "user_id" integer REFERENCES "users"("id") ON DELETE SET NULL,
      "kind" text NOT NULL,
      "payload" jsonb,
      "surface" text,
      "session_id" text,
      "created_at" timestamp with time zone NOT NULL DEFAULT now()
    )
  `)
  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS "analytics_events_kind_created_idx"
    ON "analytics_events" USING btree ("kind","created_at")
  `)
  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS "analytics_events_org_created_idx"
    ON "analytics_events" USING btree ("org_id","created_at")
  `)
  console.log('  · 0009 analytics_events OK')

  // 0010 — Leave policy + blended people-cost on orgs (employee leave
  // balances + CEO hours→cost). Both nullable; code falls back to defaults.
  await db.execute(sql`ALTER TABLE "orgs" ADD COLUMN IF NOT EXISTS "leave_policy" jsonb`)
  await db.execute(sql`ALTER TABLE "orgs" ADD COLUMN IF NOT EXISTS "cost_per_hour_inr" integer`)
  console.log('  · 0010 orgs.leave_policy + cost_per_hour_inr OK')

  // 0013 — GitHub App installation id on the org (App-based repo tracking).
  await db.execute(sql`ALTER TABLE "orgs" ADD COLUMN IF NOT EXISTS "github_installation_id" integer`)
  console.log('  · 0013 orgs.github_installation_id OK')

  // 0015 — users.github_login: the employee's GitHub username captured at
  // invite-accept. With the org's GitHub App installed, this is enough to
  // attribute their commits/PRs — no per-employee OAuth required.
  await db.execute(sql`ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "github_login" text`)
  console.log('  · 0015 users.github_login OK')

  // 0014 — Unique key on github_events (user_id, type, external_id) so the App
  // sync can UPSERT (refresh a PR's status / a review's verdict) instead of
  // duplicating or going stale. Dedupe any pre-existing collisions first so the
  // unique index can be created, then drop the old non-unique index.
  await db.execute(sql`
    DELETE FROM "github_events" a
    USING "github_events" b
    WHERE a.id < b.id
      AND a.user_id = b.user_id
      AND a.type = b.type
      AND a.external_id = b.external_id
  `)
  await db.execute(sql`
    CREATE UNIQUE INDEX IF NOT EXISTS "github_events_external_uq"
    ON "github_events" ("user_id","type","external_id")
  `)
  await db.execute(sql`DROP INDEX IF EXISTS "github_events_external_idx"`)
  console.log('  · 0014 github_events unique (user,type,external) OK')

  // 0011 — Attendance regularizations (employee disputes an auto-absent day).
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS "attendance_regularizations" (
      "id" serial PRIMARY KEY NOT NULL,
      "org_id" integer NOT NULL REFERENCES "orgs"("id") ON DELETE CASCADE,
      "user_id" integer NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
      "day" date NOT NULL,
      "requested_kind" text NOT NULL DEFAULT 'present',
      "note" text NOT NULL,
      "status" text NOT NULL DEFAULT 'pending',
      "decided_by_user_id" integer REFERENCES "users"("id") ON DELETE SET NULL,
      "decided_at" timestamp with time zone,
      "decided_note" text,
      "created_at" timestamp with time zone NOT NULL DEFAULT now()
    )
  `)
  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS "attendance_regularizations_org_status_idx"
    ON "attendance_regularizations" USING btree ("org_id","status")
  `)
  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS "attendance_regularizations_user_day_idx"
    ON "attendance_regularizations" USING btree ("user_id","day")
  `)
  console.log('  · 0011 attendance_regularizations OK')

  // 0012 — Performance review cycles (HR review tracking + 1:1 cadence).
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS "review_cycles" (
      "id" serial PRIMARY KEY NOT NULL,
      "org_id" integer NOT NULL REFERENCES "orgs"("id") ON DELETE CASCADE,
      "name" text NOT NULL,
      "period_start" date NOT NULL,
      "period_end" date NOT NULL,
      "status" text NOT NULL DEFAULT 'open',
      "created_by_user_id" integer REFERENCES "users"("id") ON DELETE SET NULL,
      "created_at" timestamp with time zone NOT NULL DEFAULT now()
    )
  `)
  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS "review_cycles_org_idx"
    ON "review_cycles" USING btree ("org_id","status")
  `)
  console.log('  · 0012 review_cycles OK')

  // 0016 — Slack scrum channel + stored standups (the Slack /marina standup
  // writes here and the web Scrum page reads "what they're doing today").
  await db.execute(sql`ALTER TABLE "orgs" ADD COLUMN IF NOT EXISTS "slack_scrum_channel_id" text`)
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS "standups" (
      "id" serial PRIMARY KEY NOT NULL,
      "org_id" integer NOT NULL REFERENCES "orgs"("id") ON DELETE CASCADE,
      "user_id" integer NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
      "day" date NOT NULL,
      "yesterday" text NOT NULL DEFAULT '',
      "today" text NOT NULL DEFAULT '',
      "blockers" text NOT NULL DEFAULT '',
      "source" text NOT NULL DEFAULT 'slack',
      "created_at" timestamp with time zone NOT NULL DEFAULT now()
    )
  `)
  await db.execute(sql`
    CREATE UNIQUE INDEX IF NOT EXISTS "standups_user_day_idx"
    ON "standups" USING btree ("user_id","day")
  `)
  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS "standups_org_day_idx"
    ON "standups" USING btree ("org_id","day")
  `)
  console.log('  · 0016 standups + orgs.slack_scrum_channel_id OK')

  // 0017 — Peer recognition (kudos) + org announcements. Both post to the
  // announcements channel via Marina and have web feeds.
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS "recognitions" (
      "id" serial PRIMARY KEY NOT NULL,
      "org_id" integer NOT NULL REFERENCES "orgs"("id") ON DELETE CASCADE,
      "from_user_id" integer NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
      "to_user_id" integer NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
      "message" text NOT NULL DEFAULT '',
      "source" text NOT NULL DEFAULT 'web',
      "created_at" timestamp with time zone NOT NULL DEFAULT now()
    )
  `)
  await db.execute(sql`CREATE INDEX IF NOT EXISTS "recognitions_org_idx" ON "recognitions" USING btree ("org_id","created_at")`)
  await db.execute(sql`CREATE INDEX IF NOT EXISTS "recognitions_to_idx" ON "recognitions" USING btree ("to_user_id")`)
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS "org_announcements" (
      "id" serial PRIMARY KEY NOT NULL,
      "org_id" integer NOT NULL REFERENCES "orgs"("id") ON DELETE CASCADE,
      "author_user_id" integer NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
      "title" text,
      "body" text NOT NULL DEFAULT '',
      "created_at" timestamp with time zone NOT NULL DEFAULT now()
    )
  `)
  await db.execute(sql`CREATE INDEX IF NOT EXISTS "org_announcements_org_idx" ON "org_announcements" USING btree ("org_id","created_at")`)
  console.log('  · 0017 recognitions + org_announcements OK')

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

// CLI entrypoint — runs when invoked directly via `pnpm tsx scripts/db-apply-pending.ts`.
// When imported by `db-migrate.ts`, this `if` branch is skipped and the caller
// is expected to `await applyPending()` instead.
const isMain =
  typeof process !== 'undefined' &&
  process.argv[1] &&
  process.argv[1].endsWith('db-apply-pending.ts')
if (isMain) {
  applyPending().catch((err) => {
    console.error('[apply] failed:', err)
    process.exit(1)
  })
}
