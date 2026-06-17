/**
 * 20-agent load + robustness test against a RUNNING dev server (localhost:3000)
 * and the DEV database's "Acme Demo Squad" org.
 *
 * Exercises, under 20-way concurrency:
 *   - ingestion: punch-in, activity events, heartbeats, breaks (incl. blockers),
 *     deliverables
 *   - vision: screenshots → inline OpenAI scene analysis
 *   - Groq stress: 20 simultaneous punch-out → shift-verification calls
 *   - rate limiting: a single-agent events flood past 60/min
 *   - budget degradation: vision skipped gracefully when the org budget is 0
 *   - reports: /api/cron/states (+ /stories) then verifies daily-states/blockers
 *
 * Cost is tiny (vision ~0.06c/img, Groq ~0.1c/call); the real risks tested are
 * Groq free-tier RPM limits, the Groq→OpenAI fallback, DB concurrency, and the
 * graceful-degradation paths. Budget is the spend safety valve.
 *
 * Run:  (server up on :3000)  pnpm tsx --env-file=.env scripts/loadtest.ts
 */
import { neon } from '@neondatabase/serverless'
import { createHash, randomBytes } from 'crypto'

const BASE = process.env.LOADTEST_BASE ?? 'http://localhost:3000'
const N = Number(process.env.LOADTEST_AGENTS ?? 20)
const SHOTS = Number(process.env.LOADTEST_SHOTS ?? 3)
const ORG_NAME = 'Acme Demo Squad'
const CRON_SECRET = process.env.CRON_SECRET ?? ''
const sql = neon(process.env.DATABASE_URL!)

// A valid 1x1 baseline JPEG (FF D8 FF … FF D9). Enough for the magic-byte check
// AND for OpenAI vision to return an analysis so the shotAnalyses path is real.
const JPEG_B64 =
  '/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQH/wAALCAABAAEBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAACv/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AvwA//9k='

const APPS = ['Code', 'Google Chrome', 'Slack', 'Figma', 'iTerm2', 'Safari', 'Notion', 'Linear']

type Agent = { userId: number; login: string; name: string | null; orgId: number; token: string; tokenId: number }
type Rec = { phase: string; ep: string; status: number; ms: number; err?: string }
const recs: Rec[] = []
const notes: string[] = []

const sha256 = (s: string) => createHash('sha256').update(s).digest('hex')
const nowIso = (offsetMs = 0) => new Date(Date.now() + offsetMs).toISOString()
const pick = <T,>(a: T[]) => a[(Math.random() * a.length) | 0]

async function call(
  phase: string,
  ep: string,
  opts: { method?: string; body?: unknown; token?: string; query?: string } = {},
): Promise<{ status: number; json: any; ms: number }> {
  const url = BASE + ep + (opts.query ?? '')
  const headers: Record<string, string> = { 'content-type': 'application/json' }
  if (opts.token) headers.authorization = `Bearer ${opts.token}`
  const t0 = performance.now()
  try {
    const res = await fetch(url, {
      method: opts.method ?? 'POST',
      headers,
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
    })
    const ms = performance.now() - t0
    let json: any = null
    try { json = await res.json() } catch { /* non-json */ }
    recs.push({ phase, ep, status: res.status, ms, err: res.ok ? undefined : json?.error ?? String(res.status) })
    return { status: res.status, json, ms }
  } catch (e: any) {
    const ms = performance.now() - t0
    recs.push({ phase, ep, status: 0, ms, err: 'network: ' + e.message })
    return { status: 0, json: null, ms }
  }
}

function report(phase: string) {
  const r = recs.filter((x) => x.phase === phase)
  if (!r.length) { console.log(`\n[${phase}] (no requests)`); return }
  const c = (pred: (x: Rec) => boolean) => r.filter(pred).length
  const lat = r.map((x) => x.ms).sort((a, b) => a - b)
  const p = (q: number) => (lat.length ? Math.round(lat[Math.min(lat.length - 1, Math.floor(q * lat.length))]) : 0)
  const errs = [...new Set(r.filter((x) => x.status >= 400 || x.status === 0).map((x) => `${x.status} ${x.ep.replace('/api/agent', '')} ${x.err ?? ''}`.trim()))].slice(0, 6)
  console.log(
    `\n[${phase}] n=${r.length}  2xx=${c((x) => x.status >= 200 && x.status < 300)}  4xx=${c((x) => x.status >= 400 && x.status < 500 && x.status !== 429)}  429=${c((x) => x.status === 429)}  5xx=${c((x) => x.status >= 500)}  neterr=${c((x) => x.status === 0)}  | lat p50=${p(0.5)} p95=${p(0.95)} max=${Math.round(lat[lat.length - 1] ?? 0)}ms`,
  )
  if (errs.length) console.log('   non-2xx:', errs.join('  |  '))
}

async function setup(): Promise<{ agents: Agent[]; orgId: number; savedBudget: number }> {
  const org = (await sql`SELECT id, monthly_ai_budget_cents FROM orgs WHERE name=${ORG_NAME} ORDER BY id DESC LIMIT 1`)[0] as any
  if (!org) throw new Error(`org "${ORG_NAME}" not found`)
  const members = (await sql`
    SELECT u.id, u.login, u.name FROM memberships m JOIN users u ON u.id=m.user_id
    WHERE m.org_id=${org.id} AND m.ended_at IS NULL ORDER BY u.id LIMIT ${N}`) as any[]
  if (members.length < N) throw new Error(`need ${N} members, found ${members.length}`)

  const agents: Agent[] = []
  for (const m of members) {
    const plaintext = 'mka_' + randomBytes(32).toString('base64url')
    const hash = sha256(plaintext)
    const prefix = plaintext.slice(0, 8)
    const row = (await sql`
      INSERT INTO agent_tokens (user_id, token_hash, token_prefix, label, platform, agent_version, last_seen_at)
      VALUES (${m.id}, ${hash}, ${prefix}, 'loadtest', 'darwin', '0.2.0', now()) RETURNING id`)[0] as any
    // Ensure tracking isn't paused, else events/screenshots are discarded.
    await sql`
      INSERT INTO user_settings (user_id, tracking_paused_at) VALUES (${m.id}, NULL)
      ON CONFLICT (user_id) DO UPDATE SET tracking_paused_at = NULL`
    agents.push({ userId: m.id, login: m.login, name: m.name, orgId: org.id, token: plaintext, tokenId: row.id })
  }
  console.log(`setup: org #${org.id}, minted ${agents.length} agent tokens (label='loadtest'), un-paused tracking, budget ${org.monthly_ai_budget_cents}c`)
  return { agents, orgId: org.id, savedBudget: org.monthly_ai_budget_cents }
}

async function warmup(a: Agent) {
  // Compile the dev-mode routes once so latency numbers reflect steady state.
  await call('warmup', '/api/agent/heartbeat', { token: a.token, body: { agentVersion: '0.2.0' } })
  await call('warmup', '/api/agent/events', { token: a.token, body: { batches: [] } })
  await call('warmup', '/api/agent/breaks/active', { token: a.token, method: 'PATCH' })
  console.log('warmup: routes compiled')
}

function eventBatches(k: number) {
  const out = []
  for (let i = 0; i < k; i++) {
    const end = Date.now() - i * 60_000 - 5_000
    out.push({
      windowStart: new Date(end - 60_000).toISOString(),
      windowEnd: new Date(end).toISOString(),
      activeApp: pick(APPS),
      activeSeconds: 30 + ((Math.random() * 30) | 0),
      idleSeconds: (Math.random() * 20) | 0,
      sampleCount: 2,
    })
  }
  return out
}

async function phase1_ingestion(agents: Agent[]) {
  console.log('\n=== Phase 1: ingestion (20 concurrent) — punch-in, events, heartbeats, breaks/blockers, deliverables ===')
  await Promise.all(
    agents.map(async (a, idx) => {
      await call('p1.punchin', '/api/agent/shifts/in', { token: a.token, body: {} })
      // two event POSTs, ~8 batches each
      await call('p1.events', '/api/agent/events', { token: a.token, body: { batches: eventBatches(8), agentVersion: '0.2.0' } })
      await call('p1.events', '/api/agent/events', { token: a.token, body: { batches: eventBatches(8) } })
      await call('p1.heartbeat', '/api/agent/heartbeat', { token: a.token, body: { agentVersion: '0.2.0' } })
      // ~30% raise a blocker (some waiting on a teammate)
      if (idx % 3 === 0) {
        const peer = agents[(idx + 1) % agents.length]
        await call('p1.blocker', '/api/agent/breaks', {
          token: a.token,
          body: { category: 'blocked', reason: `Stuck on deploy pipeline (agent ${idx})`, waitingOnUserId: idx % 2 === 0 ? peer.userId : undefined, waitingOnExternal: idx % 2 === 0 ? undefined : 'AWS support' },
        })
      }
      await call('p1.deliverable', '/api/agent/deliverables', { token: a.token, body: { title: `Shipped feature module #${idx} — load-test deliverable` } })
    }),
  )
  report('p1.punchin'); report('p1.events'); report('p1.heartbeat'); report('p1.blocker'); report('p1.deliverable')
}

async function phase1b_ratelimit(a: Agent) {
  console.log('\n=== Phase 1b: rate-limit check — single agent floods 75 event POSTs (limit 60/min) ===')
  await Promise.all(Array.from({ length: 75 }, () => call('p1b.flood', '/api/agent/events', { token: a.token, body: { batches: eventBatches(1) } })))
  report('p1b.flood')
  const r = recs.filter((x) => x.phase === 'p1b.flood')
  const got429 = r.filter((x) => x.status === 429).length
  notes.push(got429 > 0 ? `✓ rate-limiter engaged: ${got429}/75 flood requests got 429 (expected ~15)` : `⚠ rate-limiter did NOT 429 a 75-request flood (limit is 60/min) — check`)
}

async function phase2_vision(agents: Agent[]) {
  console.log(`\n=== Phase 2: vision — ${SHOTS} screenshots/agent (${SHOTS * agents.length} concurrent OpenAI calls) ===`)
  await Promise.all(
    agents.flatMap((a) =>
      Array.from({ length: SHOTS }, (_, s) =>
        call('p2.shot', '/api/agent/screenshots', { token: a.token, body: { capturedAt: nowIso(-s * 1000), displayIndex: 0, jpegBase64: JPEG_B64 } }),
      ),
    ),
  )
  report('p2.shot')
  const r = recs.filter((x) => x.phase === 'p2.shot' && x.status === 200)
  notes.push(`vision: ${r.length} screenshots accepted (analysis runs inline; verify shotAnalyses below)`)
}

async function phase3_punchout(agents: Agent[]) {
  console.log('\n=== Phase 3: Groq stress — 20 SIMULTANEOUS punch-outs → shift verification ===')
  await Promise.all(
    agents.map((a, idx) =>
      call('p3.punchout', '/api/agent/shifts/out', {
        token: a.token,
        body: { summary: `Today I worked on the ${pick(APPS)} integration (agent ${idx}): fixed the retry logic, opened a PR, reviewed two teammates' changes, and unblocked the deploy. About 6 focused hours.` },
      }),
    ),
  )
  report('p3.punchout')
}

async function phase4_reports(orgId: number) {
  console.log('\n=== Phase 4: reports — trigger cron/states (rule-based) + cron/stories (Groq narrative) ===')
  if (!CRON_SECRET) { notes.push('⚠ CRON_SECRET missing — skipped report crons'); return }
  // states: drain a couple batches (50 demo users / 40 per batch)
  for (let i = 0; i < 3; i++) {
    const r = await call('p4.states', '/api/cron/states', { method: 'GET', query: `?secret=${encodeURIComponent(CRON_SECRET)}` })
    if (r.json?.done) break
  }
  // stories: one batch to exercise the Groq narrative path under the budget
  await call('p4.stories', '/api/cron/stories', { method: 'GET', query: `?secret=${encodeURIComponent(CRON_SECRET)}` })
  report('p4.states'); report('p4.stories')
}

async function phase5_degradation(agents: Agent[], orgId: number, savedBudget: number) {
  console.log('\n=== Phase 5: budget degradation — set org budget to 0, verify vision SKIPS gracefully ===')
  await sql`UPDATE orgs SET monthly_ai_budget_cents = 0 WHERE id = ${orgId}`
  const sample = agents.slice(0, 5)
  const results = await Promise.all(
    sample.map((a) => call('p5.shot_nobudget', '/api/agent/screenshots', { token: a.token, body: { capturedAt: nowIso(-1000), displayIndex: 0, jpegBase64: JPEG_B64 } })),
  )
  report('p5.shot_nobudget')
  const stored = results.filter((r) => r.status === 200 && r.json?.ok).length
  const skipped = results.filter((r) => r.status === 200 && r.json?.analysis === null).length
  notes.push(
    stored === sample.length && skipped === sample.length
      ? `✓ degradation OK: with budget=0, all ${stored} screenshots stored but vision skipped (analysis=null) — no crash, no spend`
      : `⚠ degradation: stored=${stored}/${sample.length} skipped-vision=${skipped}/${sample.length} (expected all stored, all skipped)`,
  )
  await sql`UPDATE orgs SET monthly_ai_budget_cents = ${savedBudget} WHERE id = ${orgId}`
  console.log(`   restored org budget → ${savedBudget}c`)
}

async function verify(agents: Agent[], orgId: number, since: Date) {
  console.log('\n=== Verification — what landed in the DB ===')
  const ids = agents.map((a) => a.userId)
  const tokenIds = agents.map((a) => a.tokenId)
  const q1 = (await sql`SELECT count(*)::int n FROM local_activity WHERE agent_token_id = ANY(${tokenIds})`)[0] as any
  const q2 = (await sql`SELECT count(*)::int n FROM screenshots WHERE agent_token_id = ANY(${tokenIds})`)[0] as any
  const q3 = (await sql`SELECT app_category, count(*)::int n FROM shot_analyses WHERE user_id = ANY(${ids}) AND analyzed_at >= ${since.toISOString()} GROUP BY app_category ORDER BY n DESC`) as any[]
  const q4 = (await sql`SELECT count(*)::int n FROM breaks WHERE user_id = ANY(${ids}) AND category='blocked' AND started_at >= ${since.toISOString()}`)[0] as any
  const q5 = (await sql`SELECT count(*)::int n FROM deliverables WHERE user_id = ANY(${ids}) AND completed_at >= ${since.toISOString()}`)[0] as any
  const q6 = (await sql`SELECT verification_status, count(*)::int n FROM shifts WHERE user_id = ANY(${ids}) AND punched_out_at >= ${since.toISOString()} GROUP BY verification_status`) as any[]
  const q7 = (await sql`SELECT state, count(*)::int n FROM daily_states WHERE user_id = ANY(${ids}) AND day = to_char(now(),'YYYY-MM-DD') GROUP BY state ORDER BY n DESC`) as any[]
  const q8 = (await sql`SELECT count(*)::int n FROM notifications WHERE org_id=${orgId} AND kind='state.blocked' AND created_at >= ${since.toISOString()}`)[0] as any
  const q9 = (await sql`SELECT kind, provider, count(*)::int n, COALESCE(sum(cost_cents),0)::int cents FROM ai_spend WHERE org_id=${orgId} AND created_at >= ${since.toISOString()} GROUP BY kind, provider ORDER BY n DESC`) as any[]
  const q10 = (await sql`SELECT count(*)::int n FROM narratives WHERE user_id = ANY(${ids}) AND created_at >= ${since.toISOString()}`)[0] as any

  console.log(`  local_activity rows ............ ${q1.n}`)
  console.log(`  screenshots stored ............. ${q2.n}`)
  console.log(`  shot_analyses (scene) .......... ${q3.reduce((s, x) => s + x.n, 0)}  by category: ${q3.map((x) => `${x.app_category}:${x.n}`).join(' ') || '(none)'}`)
  console.log(`  blockers (category=blocked) .... ${q4.n}`)
  console.log(`  state.blocked notifications .... ${q8.n}`)
  console.log(`  deliverables ................... ${q5.n}`)
  console.log(`  shifts verified ................ ${q6.map((x) => `${x.verification_status}:${x.n}`).join(' ') || '(none)'}`)
  console.log(`  daily_states (today) ........... ${q7.map((x) => `${x.state}:${x.n}`).join(' ') || '(none)'}`)
  console.log(`  narratives (today, fresh) ...... ${q10.n}`)
  console.log(`  ai_spend ....................... ${q9.map((x) => `${x.kind}/${x.provider}:${x.n}(${x.cents}c)`).join(' ') || '(none)'}`)

  // Dashboard-equivalent aggregates (what the manager HQ would show).
  const stateRows = (await sql`SELECT state FROM daily_states WHERE user_id = ANY(${ids}) AND day = to_char(now(),'YYYY-MM-DD')`) as any[]
  const active = stateRows.filter((s) => s.state === 'High' || s.state === 'Steady').length
  const followup = stateRows.filter((s) => ['Blocked', 'Disengaged', 'PossiblyDummying'].includes(s.state)).length
  console.log(`  → dashboard would show: ${active} active, ${followup} need-a-look, ${q4.n} blocked across ${ids.length} agents`)
}

async function teardown(agents: Agent[], orgId: number, savedBudget: number) {
  console.log('\n=== Teardown ===')
  const tokenIds = agents.map((a) => a.tokenId)
  await sql`UPDATE agent_tokens SET revoked_at = now() WHERE id = ANY(${tokenIds})`
  await sql`UPDATE orgs SET monthly_ai_budget_cents = ${savedBudget} WHERE id = ${orgId}`
  console.log(`  revoked ${tokenIds.length} load-test tokens, budget restored to ${savedBudget}c.`)
  console.log('  (load-test activity/screenshots/shifts remain in the demo org — useful for eyeballing the dashboard; reseed with DEMO_RESET=1 pnpm seed:demo:dev to fully reset.)')
}

async function main() {
  const since = new Date()
  console.log(`\n■ MARINA 20-agent load test — ${BASE} — ${since.toISOString()}\n`)
  // reachability
  try {
    const r = await fetch(BASE + '/api/agent/heartbeat', { method: 'POST' })
    if (r.status === 0) throw new Error('no response')
  } catch (e: any) {
    console.error(`✗ server not reachable at ${BASE}. Start it: pnpm dev  (then re-run).`)
    process.exit(1)
  }

  const { agents, orgId, savedBudget } = await setup()
  try {
    await warmup(agents[0])
    await phase1_ingestion(agents)
    await phase1b_ratelimit(agents[0])
    await phase2_vision(agents)
    await phase3_punchout(agents)
    await phase4_reports(orgId)
    await phase5_degradation(agents, orgId, savedBudget)
    await verify(agents, orgId, since)
  } finally {
    await teardown(agents, orgId, savedBudget)
  }

  console.log('\n=== Findings / robustness notes ===')
  for (const n of notes) console.log('  ' + n)
  const all = recs.filter((x) => x.phase !== 'warmup')
  const fivexx = all.filter((x) => x.status >= 500).length
  const neterr = all.filter((x) => x.status === 0).length
  console.log(`\n■ Totals (excl warmup): ${all.length} requests, ${fivexx} server-errors (5xx), ${neterr} network-errors.`)
  console.log(fivexx === 0 && neterr === 0 ? '■ No 5xx / network errors — ingestion held under 20-way concurrency.\n' : '■ ⚠ Saw server/network errors — investigate above.\n')
}

main().catch((e) => { console.error('FATAL', e); process.exit(1) })
