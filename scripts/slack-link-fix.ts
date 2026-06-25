/**
 * One-off: diagnose (and optionally fix) why a Slack user isn't linked to the
 * connected MARINA org. Read-only by default; pass APPLY=1 to link.
 *
 *   pnpm tsx --env-file=.env.production scripts/slack-link-fix.ts            # diagnose
 *   APPLY=1 pnpm tsx --env-file=.env.production scripts/slack-link-fix.ts    # fix
 */
import { neon } from '@neondatabase/serverless'

const sql = neon(process.env.DATABASE_URL!)
const EMAIL = (process.env.LINK_EMAIL || 'thetanishgarg@gmail.com').toLowerCase()
const APPLY = process.env.APPLY === '1'

async function callSlack(method: string, token: string, params: Record<string, string>) {
  const res = await fetch(`https://slack.com/api/${method}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(params).toString(),
  })
  return (await res.json()) as any
}

async function main() {
  const orgs = await sql`
    SELECT id, name, slack_team_id, slack_team_name, slack_bot_token, slack_default_channel_id
    FROM orgs WHERE slack_team_id IS NOT NULL ORDER BY id`
  if (orgs.length === 0) {
    console.log('NO org in prod has a Slack workspace connected (slack_team_id is null everywhere).')
    return
  }
  console.log(`Connected orgs: ${orgs.length}`)

  const userRows = await sql`SELECT id, email, login FROM users WHERE lower(email)=${EMAIL}`
  console.log(`MARINA user(s) with ${EMAIL}:`, JSON.stringify(userRows))

  for (const o of orgs as any[]) {
    console.log(`\n=== org #${o.id} "${o.name}" (team ${o.slack_team_id} / ${o.slack_team_name}) bot=${!!o.slack_bot_token} channel=${!!o.slack_default_channel_id} ===`)
    const mem = await sql`
      SELECT m.id, m.role, u.email, u.login, m.slack_user_id
      FROM memberships m JOIN users u ON u.id=m.user_id
      WHERE m.org_id=${o.id} AND m.ended_at IS NULL ORDER BY m.role`
    console.log(`  members: ${mem.length}`)
    const mine = (mem as any[]).find((x) => (x.email || '').toLowerCase() === EMAIL)
    console.log(`  is ${EMAIL} a member? ${mine ? `YES (membership ${mine.id}, role ${mine.role}, slackUserId=${mine.slack_user_id || '(none)'})` : 'NO'}`)
    // sample a few member emails so we can see if it's a demo org
    console.log('  sample emails:', (mem as any[]).slice(0, 5).map((x) => x.email).join(', '))

    if (o.slack_bot_token) {
      const r = await callSlack('users.lookupByEmail', o.slack_bot_token, { email: EMAIL })
      console.log(`  Slack lookupByEmail(${EMAIL}): ${r.ok ? `slackId=${r.user.id}` : `FAILED → ${r.error}`}`)
    }
  }

  if (!APPLY) {
    console.log('\n(diagnose only — re-run with APPLY=1 to link)')
    return
  }

  // ---- FIX ----
  const user = (userRows as any[])[0]
  if (!user) { console.log(`cannot fix: no MARINA user with ${EMAIL}.`); return }

  // Target = the connected org where EMAIL is a member AND the bot token works.
  let target: { o: any; slackId: string } | null = null
  for (const o of orgs as any[]) {
    if (!o.slack_bot_token) continue
    const isMember = (await sql`
      SELECT 1 FROM memberships m JOIN users u ON u.id=m.user_id
      WHERE m.org_id=${o.id} AND m.ended_at IS NULL AND lower(u.email)=${EMAIL} LIMIT 1`).length > 0
    if (!isMember) continue
    const look = await callSlack('users.lookupByEmail', o.slack_bot_token, { email: EMAIL })
    if (look.ok) { target = { o, slackId: look.user.id }; break }
  }
  if (!target) { console.log('cannot fix: no connected org has you as a member with a working bot token.'); return }
  const { o, slackId } = target

  // Write A ONLY — link the caller's OWN membership. (De-duplicating the other
  // org's binding is left to the user / a code fix, to avoid touching records
  // outside the caller's own org.)
  const membership = (await sql`SELECT id FROM memberships WHERE org_id=${o.id} AND user_id=${user.id} AND ended_at IS NULL`)[0] as any
  await sql`UPDATE memberships SET slack_user_id=${slackId}, slack_resolved_at=now() WHERE id=${membership.id}`
  console.log(`LINKED: membership ${membership.id} (org #${o.id} "${o.name}") → slackUserId ${slackId}`)
  console.log('DONE (link only). To finish, disconnect the OTHER org sharing this workspace in the web app.')
}

main().catch((e) => { console.error('FATAL', e); process.exit(1) })
