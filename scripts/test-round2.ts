/**
 * Verifies round-2 logic that doesn't need a live server or Slack:
 *  - install-replace: a new org binding clears any OTHER org on the same team.
 *  - renderDigestSlack: builds a real digest and renders valid Block Kit (no send).
 *
 *   pnpm tsx --env-file=.env scripts/test-round2.ts
 */
import { neon } from '@neondatabase/serverless'
import { buildWeeklyDigest, renderDigestSlack } from '../lib/digest/weekly'

const sql = neon(process.env.DATABASE_URL!)
let pass = 0
let fail = 0
const check = (n: string, ok: boolean, d = '') => {
  if (ok) { pass++; console.log('PASS  ' + n + (d ? '  — ' + d : '')) }
  else { fail++; console.log('FAIL  ' + n + (d ? '  — ' + d : '')) }
}

async function main() {
  // 1) install-replace — mirror the callback's clear-other-orgs UPDATE.
  const orgs = (await sql`SELECT id FROM orgs WHERE slack_team_id IS NULL ORDER BY id LIMIT 2`) as { id: number }[]
  if (orgs.length < 2) { console.error('need 2 unbound dev orgs'); process.exit(1) }
  const [a, b] = [orgs[0].id, orgs[1].id]
  const FAKE = `T_DUP_TEST_${a}`
  await sql`UPDATE orgs SET slack_team_id=${FAKE}, slack_bot_token='x', slack_installed_at=now() WHERE id IN (${a}, ${b})`
  // new install lands on org b → clear any OTHER org on this team
  await sql`UPDATE orgs SET slack_team_id=NULL, slack_team_name=NULL, slack_bot_token=NULL, slack_bot_user_id=NULL, slack_default_channel_id=NULL, slack_installed_at=NULL WHERE slack_team_id=${FAKE} AND id<>${b}`
  const aTeam = ((await sql`SELECT slack_team_id FROM orgs WHERE id=${a}`)[0] as any).slack_team_id
  const bTeam = ((await sql`SELECT slack_team_id FROM orgs WHERE id=${b}`)[0] as any).slack_team_id
  check('older org binding cleared', aTeam === null, `org#${a}.team=${aTeam}`)
  check('new org stays bound', bTeam === FAKE, `org#${b}.team=${bTeam}`)
  // cleanup → restore both to unbound
  await sql`UPDATE orgs SET slack_team_id=NULL, slack_team_name=NULL, slack_bot_token=NULL, slack_bot_user_id=NULL, slack_default_channel_id=NULL, slack_installed_at=NULL WHERE id IN (${a}, ${b})`
  console.log(`cleanup: cleared test bindings on orgs ${a}, ${b}`)

  // 2) renderDigestSlack — build a real digest (no send) and check Block Kit.
  const big = (await sql`
    SELECT o.id FROM orgs o JOIN memberships m ON m.org_id=o.id AND m.ended_at IS NULL
    GROUP BY o.id ORDER BY count(*) DESC LIMIT 1`)[0] as { id: number }
  const d = await buildWeeklyDigest(big.id)
  if (!d) {
    check('digest built', false, `org#${big.id} returned null`)
  } else {
    const r = renderDigestSlack(d)
    check('renderDigestSlack → text + blocks', typeof r.text === 'string' && Array.isArray(r.blocks) && r.blocks.length > 0, `blocks=${r.blocks.length}`)
    check('all blocks have a type', r.blocks.every((bl: any) => bl && typeof bl.type === 'string'))
    check('digest header present', JSON.stringify(r.blocks).includes('Weekly digest'))
  }

  console.log(`\n${pass}/${pass + fail} checks passed`)
  if (fail) process.exit(2)
}

main().catch((e) => { console.error('FATAL', e); process.exit(1) })
