/**
 * DANGER: wipes ALL workspaces and ALL users from the connected database.
 *
 * This is for a deliberate pre-launch clean slate ONLY. It is irreversible.
 * It refuses to run unless WIPE_CONFIRM=WIPE is set, so it can never fire by
 * accident (e.g. a stray CI invocation).
 *
 *   WIPE_CONFIRM=WIPE pnpm tsx --env-file=.env.production scripts/wipe-all.ts
 *
 * Deletes all `orgs` (cascades memberships, invites, teams, leaves, breaks,
 * shifts, etc.) then all `users` (cascades accounts, devices, narratives,
 * github_events, deliverables, settings, …), then a few non-cascading log
 * tables, leaving an empty DB with the schema intact.
 */
import { sql } from 'drizzle-orm'
import { db, schema } from '../lib/db/client'

async function count(table: string): Promise<number> {
  try {
    const r = await db.execute(sql.raw(`SELECT COUNT(*)::int AS n FROM "${table}"`))
    // drizzle/neon returns rows in different shapes; normalize.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rows: any[] = (r as any).rows ?? (r as any)
    return Number(rows?.[0]?.n ?? 0)
  } catch {
    return -1 // table may not exist
  }
}

async function main() {
  if (process.env.WIPE_CONFIRM !== 'WIPE') {
    console.error(
      '\n[wipe] Refusing to run. This permanently deletes ALL users and workspaces.\n' +
        'Re-run with WIPE_CONFIRM=WIPE if you really mean it:\n' +
        '   WIPE_CONFIRM=WIPE pnpm tsx --env-file=.env.production scripts/wipe-all.ts\n',
    )
    process.exit(1)
  }

  const before = {
    orgs: await count('orgs'),
    users: await count('users'),
    memberships: await count('memberships'),
  }
  console.log('[wipe] BEFORE:', before)

  // 1) Orgs (cascades org-scoped data).
  await db.delete(schema.orgs)
  // 2) Users (cascades user-scoped data: accounts, devices, github_events, …).
  await db.delete(schema.users)

  // 3) Best-effort clear of standalone log/ephemeral tables that aren't FK-tied
  //    to a user/org (ignore if they don't exist).
  for (const t of ['magic_links', 'analytics_events', 'invites', 'pairing_codes', 'audit_log', 'ai_spend']) {
    try {
      await db.execute(sql.raw(`DELETE FROM "${t}"`))
    } catch {
      // table may not exist or already empty — fine.
    }
  }

  const after = {
    orgs: await count('orgs'),
    users: await count('users'),
    memberships: await count('memberships'),
  }
  console.log('[wipe] AFTER: ', after)
  console.log('[wipe] ✓ clean slate — all users and workspaces removed. Schema intact.')
  process.exit(0)
}

main().catch((err) => {
  console.error('[wipe] failed:', err)
  process.exit(1)
})
