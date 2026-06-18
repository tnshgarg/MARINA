/**
 * Runtime smoke test for the new Slack endpoints against a running dev server.
 * Verifies the parts that DON'T need a connected workspace: signature
 * rejection, the events url_verification handshake, and the cron secret guard.
 *
 *   (server up) pnpm tsx --env-file=.env scripts/test-slack-endpoints.ts
 */
import { createHmac } from 'crypto'

const BASE = process.env.LOADTEST_BASE || 'http://localhost:3000'
const secret = process.env.SLACK_SIGNING_SECRET || ''
const sign = (body: string, ts: string) =>
  'v0=' + createHmac('sha256', secret).update(`v0:${ts}:${body}`).digest('hex')

let pass = 0, fail = 0
const check = (name: string, ok: boolean, detail = '') => {
  if (ok) { pass++; console.log('PASS  ' + name + (detail ? '  — ' + detail : '')) }
  else { fail++; console.log('FAIL  ' + name + (detail ? '  — ' + detail : '')) }
}

async function main() {
  // 1. events: valid signature + url_verification → echoes challenge
  const body = JSON.stringify({ type: 'url_verification', challenge: 'marina-test-challenge-123' })
  const ts = Math.floor(Date.now() / 1000).toString()
  const r1 = await fetch(BASE + '/api/slack/events', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-slack-request-timestamp': ts, 'x-slack-signature': sign(body, ts) },
    body,
  })
  const j1 = (await r1.json().catch(() => null)) as { challenge?: string } | null
  check('events url_verification handshake', r1.status === 200 && j1?.challenge === 'marina-test-challenge-123', `status ${r1.status}`)

  // 2. events: no signature → 401
  const r2 = await fetch(BASE + '/api/slack/events', { method: 'POST', headers: { 'content-type': 'application/json' }, body })
  check('events rejects unsigned (401)', r2.status === 401, `status ${r2.status}`)

  // 3. events: tampered signature → 401
  const r3 = await fetch(BASE + '/api/slack/events', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-slack-request-timestamp': ts, 'x-slack-signature': 'v0=deadbeef' },
    body,
  })
  check('events rejects bad signature (401)', r3.status === 401, `status ${r3.status}`)

  // 4. interactivity: no signature → 401
  const r4 = await fetch(BASE + '/api/slack/interactivity', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: 'payload=%7B%7D',
  })
  check('interactivity rejects unsigned (401)', r4.status === 401, `status ${r4.status}`)

  // 5. slack-brief cron: no secret → 403
  const r5 = await fetch(BASE + '/api/cron/slack-brief')
  check('slack-brief cron guards (403 no secret)', r5.status === 403, `status ${r5.status}`)

  // 6. slack-brief cron: valid secret → 200, safely no-ops (no org has Slack)
  const r6 = await fetch(BASE + '/api/cron/slack-brief?secret=' + encodeURIComponent(process.env.CRON_SECRET || ''))
  const j6 = (await r6.json().catch(() => null)) as { ok?: boolean; posted?: number; skipped?: number } | null
  check('slack-brief cron runs with secret', r6.status === 200 && j6?.ok === true, `status ${r6.status} ${JSON.stringify(j6)}`)

  console.log(`\n${pass}/${pass + fail} endpoint checks passed`)
  if (fail) process.exit(1)
}

main().catch((e) => { console.error('FATAL', e); process.exit(1) })
