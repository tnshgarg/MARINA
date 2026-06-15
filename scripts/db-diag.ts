/**
 * Read-only snapshot of the bits that decide whether GitHub App sync produces
 * anything: which orgs have an installation bound, and which users have a
 * GitHub identity (login / githubId) so commits can be attributed.
 *   pnpm tsx --env-file=.env            scripts/db-diag.ts
 *   pnpm tsx --env-file=.env.production scripts/db-diag.ts
 */
import { neon } from '@neondatabase/serverless'

async function main() {
  const url = process.env.DATABASE_URL
  if (!url) { console.error('DATABASE_URL not set'); process.exit(1) }
  const sql = neon(url)

  const orgs = await sql`SELECT id, name, github_installation_id FROM orgs ORDER BY id`
  console.log('\n=== orgs ===')
  for (const o of orgs) console.log(`  #${o.id} ${JSON.stringify(o.name)} installationId=${o.github_installation_id ?? '(none)'}`)

  const users = await sql`SELECT id, email, login, github_id, access_token IS NOT NULL AS has_token FROM users ORDER BY id`
  console.log('\n=== users ===')
  for (const u of users) console.log(`  #${u.id} ${u.email}  login=${u.login ?? '(null)'} githubId=${u.github_id ?? '(null)'} oauthToken=${u.has_token}`)

  const ge = await sql`SELECT count(*)::int AS n FROM github_events`
  console.log(`\ngithub_events rows: ${ge[0].n}`)
}

main().catch((e) => { console.error(e); process.exit(1) })
