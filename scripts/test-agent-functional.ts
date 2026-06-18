/**
 * Single-agent functional smoke test. Mints a token for one demo-org member,
 * drives every agent ingestion endpoint over real HTTP against the running dev
 * server, asserts each response + DB write, then cleans up everything it made.
 *
 * Side-effect-safe: uses a NON-blocked break so notify()/email never fires.
 *
 *   (server running) pnpm tsx --env-file=.env scripts/test-agent-functional.ts
 */
import { neon } from '@neondatabase/serverless'
import { createHash, randomBytes } from 'crypto'

const BASE = process.env.LOADTEST_BASE || 'http://localhost:3000'
const ORG = Number(process.env.ORG_ID || 15)
const sql = neon(process.env.DATABASE_URL!)
const sha256 = (s: string) => createHash('sha256').update(s).digest('hex')

const results: { name: string; ok: boolean; detail: string }[] = []
const check = (name: string, ok: boolean, detail = '') => {
  results.push({ name, ok, detail })
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`)
}

async function main() {
  const startedAt = new Date()
  // Pick a member with no open shift (avoids the one-open-shift unique index).
  const members = await sql`SELECT user_id FROM memberships WHERE org_id=${ORG} AND ended_at IS NULL ORDER BY user_id`
  let userId: number | null = null
  for (const m of members as any[]) {
    const open = await sql`SELECT 1 FROM shifts WHERE user_id=${m.user_id} AND punched_out_at IS NULL LIMIT 1`
    if (!open.length) { userId = m.user_id; break }
  }
  if (!userId) { console.error('no member without an open shift'); process.exit(1) }
  const who = (await sql`SELECT login FROM users WHERE id=${userId}`)[0] as any
  console.log(`\n=== AGENT FUNCTIONAL TEST — org #${ORG}, user #${userId} (@${who.login}) ===`)

  // Ensure not paused.
  await sql`INSERT INTO user_settings (user_id, tracking_paused_at) VALUES (${userId}, NULL)
            ON CONFLICT (user_id) DO UPDATE SET tracking_paused_at=NULL`

  // Mint an agent token directly (same shape the pairing flow produces).
  const plaintext = 'mka_' + randomBytes(32).toString('base64url')
  const tok = (await sql`
    INSERT INTO agent_tokens (user_id, token_hash, token_prefix, label, platform, agent_version, last_seen_at)
    VALUES (${userId}, ${sha256(plaintext)}, ${plaintext.slice(0, 8)}, 'functest', 'darwin', '0.1.0', now())
    RETURNING id`)[0] as any
  const tokenId = tok.id

  const H = { Authorization: `Bearer ${plaintext}`, 'Content-Type': 'application/json' }
  const post = (p: string, b?: any) => fetch(BASE + p, { method: 'POST', headers: H, body: JSON.stringify(b ?? {}) })
  const patch = (p: string, b?: any) => fetch(BASE + p, { method: 'PATCH', headers: H, body: JSON.stringify(b ?? {}) })
  const get = (p: string) => fetch(BASE + p, { headers: H })

  // 0 — auth: a bogus token must be rejected 401.
  const bad = await fetch(BASE + '/api/agent/heartbeat', { method: 'POST', headers: { Authorization: 'Bearer mka_bogus', 'Content-Type': 'application/json' }, body: '{}' })
  check('auth rejects bogus token (401)', bad.status === 401, `status ${bad.status}`)

  // 1 — punch in.
  let r = await post('/api/agent/shifts/in', {}); let j: any = await r.json().catch(() => ({}))
  const shiftId = j.shift?.id
  check('punch in', r.ok && !!shiftId, `status ${r.status} shift ${shiftId}`)
  const sRow = (await sql`SELECT punched_in_via, org_id FROM shifts WHERE id=${shiftId}`)[0] as any
  check('shift row written via=agent, org attributed', sRow?.punched_in_via === 'agent' && sRow?.org_id === ORG, `via=${sRow?.punched_in_via} org=${sRow?.org_id}`)

  // 2 — activity events.
  r = await post('/api/agent/events', { batches: [
    { windowStart: new Date(Date.now() - 600000).toISOString(), windowEnd: new Date(Date.now() - 300000).toISOString(), activeApp: 'Visual Studio Code', activeSeconds: 270, idleSeconds: 30, sampleCount: 10 },
    { windowStart: new Date(Date.now() - 300000).toISOString(), windowEnd: new Date(Date.now() - 1000).toISOString(), activeApp: 'Google Chrome', activeSeconds: 200, idleSeconds: 100, sampleCount: 10 },
  ] }); j = await r.json().catch(() => ({}))
  check('events ingest (2 batches)', r.ok && j.inserted === 2, `inserted ${j.inserted} rejected ${JSON.stringify(j.rejected)}`)
  const laCount = (await sql`SELECT count(*)::int n FROM local_activity WHERE agent_token_id=${tokenId}`)[0] as any
  check('local_activity rows written', laCount.n === 2, `rows ${laCount.n}`)

  // 2b — events validation: a future window must be rejected.
  r = await post('/api/agent/events', { batches: [{ windowStart: new Date(Date.now() + 600000).toISOString(), windowEnd: new Date(Date.now() + 900000).toISOString(), activeApp: 'X', activeSeconds: 10, idleSeconds: 0, sampleCount: 1 }] }); j = await r.json().catch(() => ({}))
  check('events reject future window', r.ok && j.inserted === 0 && (j.rejected?.length ?? 0) === 1, `inserted ${j.inserted} rejected ${JSON.stringify(j.rejected)}`)

  // 3 — heartbeat reflects the open shift.
  r = await post('/api/agent/heartbeat', {}); j = await r.json().catch(() => ({}))
  check('heartbeat reflects open shift', r.ok && j.activeShift?.id === shiftId, `activeShift ${JSON.stringify(j.activeShift)}`)

  // 4 — break (NON-blocked, so notify()/email never fires).
  r = await post('/api/agent/breaks', { reason: 'functest: lunch', category: 'lunch' }); j = await r.json().catch(() => ({}))
  const breakId = j.break?.id
  check('start break (lunch)', r.ok && j.break?.category === 'lunch', `break ${breakId} cat ${j.break?.category}`)
  r = await patch('/api/agent/breaks/active', {}); j = await r.json().catch(() => ({}))
  check('end active break', r.ok, `status ${r.status}`)
  const bRow = (await sql`SELECT ended_at FROM breaks WHERE id=${breakId}`)[0] as any
  check('break row ended', !!bRow?.ended_at, `endedAt ${bRow?.ended_at}`)

  // 5 — deliverable (title >= 10 chars).
  r = await post('/api/agent/deliverables', { title: 'functest: shipped the agent smoke suite', url: 'https://example.com/pr/1' }); j = await r.json().catch(() => ({}))
  const delivId = j.deliverable?.id
  check('log deliverable', r.ok && !!delivId, `deliverable ${delivId} status=${r.status}`)
  // 5b — dedup within 4h returns 409.
  r = await post('/api/agent/deliverables', { title: 'functest: shipped the agent smoke suite', url: 'https://example.com/pr/1' }); j = await r.json().catch(() => ({}))
  check('deliverable dedup (409 within 4h)', r.status === 409 && !!j.duplicateOf, `status ${r.status} dupOf ${j.duplicateOf}`)

  // 6 — read endpoints.
  r = await get('/api/agent/day'); check('GET /day panel', r.ok, `status ${r.status}`)
  r = await get('/api/agent/team'); check('GET /team roster', r.ok, `status ${r.status}`)
  r = await get('/api/agent/meetings/today'); check('GET /meetings/today', r.ok, `status ${r.status}`)
  r = await get('/api/agent/notifications'); check('GET /notifications', r.ok, `status ${r.status}`)

  // 7 — punch out (verification gatekept → 'skipped'; story builds in background).
  r = await post('/api/agent/shifts/out', { summary: 'Wrote and ran the MARINA agent smoke-test suite, exercised the ingestion endpoints, and verified each DB write. About two focused hours.' }); j = await r.json().catch(() => ({}))
  check('punch out', r.ok && !!j.shift?.punchedOutAt, `status ${r.status}`)
  check('verification gatekept → skipped (no suspect)', j.verification?.status === 'skipped', `status=${j.verification?.status} score=${j.verification?.score}`)
  const closed = (await sql`SELECT punched_out_at, verification_status FROM shifts WHERE id=${shiftId}`)[0] as any
  check('shift closed in DB, status=skipped', !!closed?.punched_out_at && closed?.verification_status === 'skipped', `out=${!!closed?.punched_out_at} status=${closed?.verification_status}`)

  // 8 — pause toggle.
  r = await post('/api/agent/pause', { paused: true }); check('pause tracking', r.ok, `status ${r.status}`)
  r = await post('/api/agent/pause', { paused: false }); check('resume tracking', r.ok, `status ${r.status}`)

  // ---- CLEANUP (remove everything this test created) ----
  await sql`DELETE FROM deliverables WHERE id=${delivId}`
  await sql`DELETE FROM breaks WHERE id=${breakId}`
  await sql`DELETE FROM local_activity WHERE agent_token_id=${tokenId}`
  await sql`DELETE FROM daily_stories WHERE user_id=${userId} AND generated_at >= ${startedAt.toISOString()}`
  await sql`DELETE FROM ai_spend WHERE org_id=${ORG} AND created_at >= ${startedAt.toISOString()}`
  await sql`DELETE FROM shifts WHERE id=${shiftId}`
  await sql`UPDATE agent_tokens SET revoked_at=now() WHERE id=${tokenId}`
  await sql`INSERT INTO user_settings (user_id, tracking_paused_at) VALUES (${userId}, NULL)
            ON CONFLICT (user_id) DO UPDATE SET tracking_paused_at=NULL`
  console.log('cleanup: removed test shift/break/deliverable/activity/story/spend + revoked token')

  const passed = results.filter((x) => x.ok).length
  console.log(`\n=== RESULT: ${passed}/${results.length} checks passed ===`)
  if (passed !== results.length) process.exit(2)
}

main().catch((e) => { console.error(e); process.exit(1) })
