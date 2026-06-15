/**
 * GitHub App diagnostic — talks to GitHub directly with the App credentials so
 * we can see ground truth: is the key valid, is the App installed, on which
 * account, and can it see repos. No DB, no Next. Run:
 *   pnpm tsx scripts/gh-app-diag.ts            # uses .env
 *   ENV_FILE=.env.production pnpm tsx scripts/gh-app-diag.ts
 */
import { createSign } from 'crypto'
import { existsSync, readFileSync } from 'fs'

const ENV_FILE = process.env.ENV_FILE ?? '.env'

function loadEnv(file: string): Record<string, string> {
  const out: Record<string, string> = {}
  if (!existsSync(file)) return out
  const txt = readFileSync(file, 'utf8')
  // Minimal .env parser that supports a single-line quoted value (covers our keys).
  for (const m of txt.matchAll(/^([A-Z0-9_]+)=(.*)$/gm)) {
    let v = m[2]
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1)
    }
    out[m[1]] = v
  }
  return out
}

function normalizeKey(raw: string): string {
  let k = raw.trim()
  if (!k.includes('BEGIN') && existsSync(k)) k = readFileSync(k, 'utf8')
  if (k.includes('\\n')) k = k.replace(/\\n/g, '\n')
  // Repair a PEM whose structural newlines were turned into spaces or stripped:
  // pull the base64 body from between the header/footer, strip ALL whitespace,
  // re-wrap at 64 chars with proper newlines.
  const m = k.match(/-----BEGIN ([A-Z0-9 ]+?)-----([\s\S]*?)-----END \1-----/)
  if (m) {
    const label = m[1].trim()
    const body = m[2].replace(/\s+/g, '')
    const wrapped = body.match(/.{1,64}/g)?.join('\n') ?? ''
    k = `-----BEGIN ${label}-----\n${wrapped}\n-----END ${label}-----\n`
  }
  return k
}

function b64url(input: Buffer | string): string {
  return Buffer.from(input).toString('base64').replace(/=+$/g, '').replace(/\+/g, '-').replace(/\//g, '_')
}

function appJwt(appId: string, privateKey: string): string {
  const now = Math.floor(Date.now() / 1000)
  const header = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))
  const payload = b64url(JSON.stringify({ iat: now - 60, exp: now + 9 * 60, iss: appId }))
  const unsigned = `${header}.${payload}`
  const signature = createSign('RSA-SHA256').update(unsigned).sign(privateKey)
  return `${unsigned}.${b64url(signature)}`
}

async function gh(path: string, token: string, method = 'GET') {
  const res = await fetch(`https://api.github.com${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
    },
  })
  const body = await res.text()
  let json: unknown = null
  try { json = JSON.parse(body) } catch { /* leave as text */ }
  return { ok: res.ok, status: res.status, json, text: body }
}

async function main() {
  const env = loadEnv(ENV_FILE)
  const appId = env.GITHUB_APP_ID
  const slug = env.GITHUB_APP_SLUG
  const rawKey = env.GITHUB_APP_PRIVATE_KEY
  console.log(`\n=== gh-app-diag (${ENV_FILE}) ===`)
  console.log('APP_ID  :', appId || '(unset)')
  console.log('APP_SLUG:', slug || '(unset)')
  if (!appId || !rawKey) { console.log('Missing APP_ID or PRIVATE_KEY — stop.'); return }

  const key = normalizeKey(rawKey)
  const realNewlines = (key.match(/\n/g) || []).length
  console.log('KEY shape: len=%d hasBEGIN=%s realNewlines=%d', key.length, key.includes('BEGIN'), realNewlines)

  let jwt: string
  try {
    jwt = appJwt(appId, key)
    console.log('JWT sign : OK (len %d)', jwt.length)
  } catch (e) {
    console.log('JWT sign : FAILED ->', (e as Error).message)
    console.log('\n>>> The private key cannot be parsed. This alone explains "0 repos · 0 events".')
    return
  }

  // 1) Who am I (validates the JWT against GitHub)
  const app = await gh('/app', jwt)
  if (!app.ok) {
    console.log('GET /app : FAILED %d -> %s', app.status, app.text.slice(0, 300))
    console.log('\n>>> JWT signed locally but GitHub rejected it. Wrong key for this App ID, or App ID mismatch.')
    return
  }
  const appData = app.json as { slug?: string; name?: string; owner?: { login?: string } }
  console.log('GET /app : OK -> name=%j slug=%j owner=%j', appData.name, appData.slug, appData.owner?.login)

  // 2) Installations
  const insts = await gh('/app/installations?per_page=100', jwt)
  if (!insts.ok) { console.log('GET /app/installations FAILED %d -> %s', insts.status, insts.text.slice(0, 300)); return }
  const installations = insts.json as Array<{
    id: number
    account?: { login?: string; type?: string }
    target_type?: string
    repository_selection?: string
  }>
  console.log('\nInstallations: %d', installations.length)
  if (installations.length === 0) {
    console.log('>>> The App is not installed anywhere. Nothing to sync. Install it (and make sure the redirect actually bound it).')
    return
  }

  for (const inst of installations) {
    console.log('  • id=%d account=%j type=%s selection=%s',
      inst.id, inst.account?.login, inst.target_type, inst.repository_selection)
    // 3) Mint an installation token and list repos
    const tok = await gh(`/app/installations/${inst.id}/access_tokens`, jwt, 'POST')
    if (!tok.ok) { console.log('      token FAILED %d -> %s', tok.status, tok.text.slice(0, 200)); continue }
    const token = (tok.json as { token: string }).token
    const repos = await gh('/installation/repositories?per_page=100', token)
    if (!repos.ok) { console.log('      repos FAILED %d -> %s', repos.status, repos.text.slice(0, 200)); continue }
    const rj = repos.json as { total_count: number; repositories: Array<{ full_name: string; private: boolean }> }
    console.log('      repos: total=%d ->', rj.total_count, rj.repositories.map((r) => r.full_name + (r.private ? ' (private)' : '')).join(', ') || '(none)')
  }
  console.log('\nDone.')
}

main().catch((e) => { console.error(e); process.exit(1) })
