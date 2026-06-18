/**
 * Read-only data-integrity snapshot for a single org. Powers the testing report:
 * counts every table that feeds a UI surface, grouped by the dimension the UI
 * cares about, plus a few integrity checks (orphans, open-shift sanity).
 *
 *   pnpm tsx --env-file=.env scripts/test-data-snapshot.ts 15
 */
import { neon } from '@neondatabase/serverless'

async function main() {
  const sql = neon(process.env.DATABASE_URL!)
  const orgId = Number(process.argv[2] || process.env.ORG_ID || 15)

  const org = (await sql`
    SELECT id, name, plan, monthly_ai_budget_cents,
           slack_bot_token IS NOT NULL AS slack_connected,
           slack_default_channel_id IS NOT NULL AS slack_channel,
           github_installation_id, timezone, workday_start_hour, workday_end_hour
    FROM orgs WHERE id=${orgId}`)[0]
  if (!org) { console.error(`org #${orgId} not found`); process.exit(1) }

  const members = await sql`SELECT user_id FROM memberships WHERE org_id=${orgId} AND ended_at IS NULL`
  const ids = members.map((m: any) => m.user_id)

  console.log(`\n================ DATA SNAPSHOT: org #${org.id} "${org.name}" ================`)
  console.log(`plan=${org.plan} aiBudgetCents=${org.monthly_ai_budget_cents} tz=${org.timezone} workday=${org.workday_start_hour}-${org.workday_end_hour}`)
  console.log(`slackConnected=${org.slack_connected} slackChannel=${org.slack_channel} githubInstallation=${org.github_installation_id ?? '(none)'}`)
  console.log(`active members: ${ids.length}`)

  const roles = await sql`SELECT role, count(*)::int n FROM memberships WHERE org_id=${orgId} AND ended_at IS NULL GROUP BY role ORDER BY n DESC`
  console.log('  roles:', roles.map((r: any) => `${r.role}=${r.n}`).join(' '))
  const disc = await sql`SELECT discipline, count(*)::int n FROM memberships WHERE org_id=${orgId} AND ended_at IS NULL GROUP BY discipline ORDER BY n DESC`
  console.log('  disciplines:', disc.map((r: any) => `${r.discipline}=${r.n}`).join(' '))

  const line = (label: string, rows: any[], key = 'k', val = 'n') =>
    console.log(`  ${label}:`, rows.length ? rows.map((r) => `${r[key]}=${r[val]}`).join(' ') : '(none)')

  console.log('\n-- shifts (org-scoped) --')
  line('byStatus', await sql`SELECT verification_status k, count(*)::int n FROM shifts WHERE org_id=${orgId} GROUP BY 1 ORDER BY 2 DESC`)
  const openShifts = (await sql`SELECT count(*)::int n FROM shifts WHERE org_id=${orgId} AND punched_out_at IS NULL`)[0].n
  const totalShifts = (await sql`SELECT count(*)::int n FROM shifts WHERE org_id=${orgId}`)[0].n
  console.log(`  total=${totalShifts} open(on-the-clock)=${openShifts}`)

  console.log('\n-- breaks / blockers (org-scoped) --')
  line('byCategory', await sql`SELECT category k, count(*)::int n FROM breaks WHERE org_id=${orgId} GROUP BY 1 ORDER BY 2 DESC`)
  const activeBlock = (await sql`SELECT count(*)::int n FROM breaks WHERE org_id=${orgId} AND category='blocked' AND ended_at IS NULL`)[0].n
  console.log(`  active blockers (unresolved): ${activeBlock}`)

  console.log('\n-- deliverables / leave / meetings / reviews (org-scoped) --')
  console.log(`  deliverables: ${(await sql`SELECT count(*)::int n FROM deliverables WHERE org_id=${orgId}`)[0].n}`)
  line('leaveByStatus', await sql`SELECT status k, count(*)::int n FROM leave_requests WHERE org_id=${orgId} GROUP BY 1 ORDER BY 2 DESC`)
  console.log(`  scheduled_meetings (1:1s): ${(await sql`SELECT count(*)::int n FROM scheduled_meetings WHERE org_id=${orgId}`)[0].n}`)
  line('reviewCycles', await sql`SELECT status k, count(*)::int n FROM review_cycles WHERE org_id=${orgId} GROUP BY 1`)
  console.log(`  teams: ${(await sql`SELECT count(*)::int n FROM teams WHERE org_id=${orgId}`)[0].n}`)
  line('notifications', await sql`SELECT kind k, count(*)::int n FROM notifications WHERE org_id=${orgId} GROUP BY 1 ORDER BY 2 DESC`)
  line('aiSpend', await sql`SELECT kind k, count(*)::int n FROM ai_spend WHERE org_id=${orgId} GROUP BY 1`)

  if (ids.length) {
    console.log('\n-- user-scoped (members of this org) --')
    line('githubByType', await sql`SELECT type k, count(*)::int n FROM github_events WHERE user_id = ANY(${ids}) GROUP BY 1 ORDER BY 2 DESC`)
    line('dailyStates', await sql`SELECT state k, count(*)::int n FROM daily_states WHERE user_id = ANY(${ids}) GROUP BY 1 ORDER BY 2 DESC`)
    console.log(`  narratives: ${(await sql`SELECT count(*)::int n FROM narratives WHERE user_id = ANY(${ids})`)[0].n}`)
    console.log(`  daily_stories: ${(await sql`SELECT count(*)::int n FROM daily_stories WHERE user_id = ANY(${ids})`)[0].n}`)
    console.log(`  local_activity rows: ${(await sql`SELECT count(*)::int n FROM local_activity WHERE user_id = ANY(${ids})`)[0].n}`)
    console.log(`  calendar meetings: ${(await sql`SELECT count(*)::int n FROM meetings WHERE user_id = ANY(${ids})`)[0].n}`)
    console.log(`  screenshots: ${(await sql`SELECT count(*)::int n FROM screenshots WHERE user_id = ANY(${ids})`)[0].n} (expect 0 — gatekept)`)
  }

  console.log('\n-- integrity checks --')
  const orphanShifts = (await sql`SELECT count(*)::int n FROM shifts s LEFT JOIN users u ON u.id=s.user_id WHERE u.id IS NULL`)[0].n
  const orphanGh = (await sql`SELECT count(*)::int n FROM github_events g LEFT JOIN users u ON u.id=g.user_id WHERE u.id IS NULL`)[0].n
  const futureShifts = (await sql`SELECT count(*)::int n FROM shifts WHERE org_id=${orgId} AND punched_in_at > now()`)[0].n
  const negDur = (await sql`SELECT count(*)::int n FROM shifts WHERE org_id=${orgId} AND punched_out_at IS NOT NULL AND punched_out_at < punched_in_at`)[0].n
  console.log(`  orphan shifts(no user)=${orphanShifts} orphan githubEvents=${orphanGh} future-dated shifts=${futureShifts} negative-duration shifts=${negDur}`)
  console.log('\n================ END SNAPSHOT ================\n')
}

main().catch((e) => { console.error(e); process.exit(1) })
