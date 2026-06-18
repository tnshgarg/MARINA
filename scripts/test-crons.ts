/**
 * Tests the report cron jobs. states + stories run over real HTTP (no email).
 * The digest is COMPOSED for org 16 and sent only to the approved test inbox —
 * NOT via the blanket /api/cron/digest (that emails every org owner, incl. the
 * fake @acmedemo.in addresses).
 *
 *   (server up) pnpm tsx --env-file=.env scripts/test-crons.ts
 */
import { neon } from '@neondatabase/serverless'
import { buildWeeklyDigest, renderDigestEmail } from '../lib/digest/weekly'
import { sendDigestMail } from '../lib/email/send'

const BASE = process.env.LOADTEST_BASE || 'http://localhost:3000'
const SECRET = process.env.CRON_SECRET || ''
const ORG = 16
const sql = neon(process.env.DATABASE_URL!)

async function main() {
  if (!SECRET) { console.error('CRON_SECRET missing'); process.exit(1) }
  const q = `?secret=${encodeURIComponent(SECRET)}`

  console.log('=== cron/states (rule-based daily states) ===')
  for (let i = 0; i < 6; i++) {
    const r = await fetch(`${BASE}/api/cron/states${q}`)
    const j: any = await r.json().catch(() => ({}))
    console.log(` batch ${i}: ${r.status} ${JSON.stringify(j).slice(0, 140)}`)
    if (j.done) break
  }

  console.log('\n=== cron/stories (Groq narratives) ===')
  const rs = await fetch(`${BASE}/api/cron/stories${q}`)
  const js: any = await rs.json().catch(() => ({}))
  console.log(` ${rs.status} ${JSON.stringify(js).slice(0, 200)}`)

  console.log('\n=== cron/auth guard (no secret must 403) ===')
  const rf = await fetch(`${BASE}/api/cron/states`)
  console.log(` no-secret status: ${rf.status} (expect 403)`)

  console.log('\n=== digest: compose for org 16 + send ONLY to approved inbox ===')
  const digest = await buildWeeklyDigest(ORG)
  if (!digest) { console.log(' digest builder returned null (no data)') }
  else {
    const email = renderDigestEmail(digest)
    console.log(' built OK — subject:', email.subject)
    console.log(' totals:', JSON.stringify(digest.totals))
    const to = process.env.TEST_EMAIL_TO || 'thetanishgarg@gmail.com'
    const res = await sendDigestMail({ to, subject: '[TEST] ' + email.subject, html: email.html, text: email.text })
    console.log(` digest emailed to ${to} ->`, JSON.stringify(res))
  }

  console.log('\n=== verify outputs (org 16) ===')
  const ids = (await sql`SELECT user_id FROM memberships WHERE org_id=${ORG} AND ended_at IS NULL`).map((r: any) => r.user_id)
  const today = (await sql`SELECT to_char(now(),'YYYY-MM-DD') d`)[0] as any
  const ds = (await sql`SELECT state, count(*)::int n FROM daily_states WHERE user_id = ANY(${ids}) AND day=${today.d} GROUP BY state ORDER BY n DESC`) as any[]
  const st = (await sql`SELECT count(*)::int n FROM daily_stories WHERE user_id = ANY(${ids})`)[0] as any
  const sp = (await sql`SELECT kind, provider, count(*)::int n FROM ai_spend WHERE org_id=${ORG} GROUP BY kind, provider`) as any[]
  console.log(' today daily_states:', ds.map((x) => `${x.state}:${x.n}`).join(' ') || '(none)')
  console.log(' daily_stories total:', st.n)
  console.log(' ai_spend:', sp.map((x) => `${x.kind}/${x.provider}:${x.n}`).join(' ') || '(none)')
}

main().catch((e) => { console.error('FATAL', e); process.exit(1) })
