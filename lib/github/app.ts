import { createSign } from 'crypto'
import { existsSync, readFileSync } from 'fs'
import { Octokit } from '@octokit/rest'

/**
 * GitHub App authentication.
 *
 * Why an App (not per-user OAuth): an org admin installs the MARINA GitHub App
 * once and picks which repos to share. GitHub then lets us authenticate AS the
 * installation to read those repos' commits + PRs server-side — no per-employee
 * token, no org third-party-access friction, works for PRIVATE repos. Employees
 * separately link their GitHub account just so we can map activity to them.
 *
 * Env needed (set after you create the App on github.com):
 *   GITHUB_APP_ID            — numeric App id
 *   GITHUB_APP_PRIVATE_KEY   — the App's PEM private key (literal \n is fine)
 *   GITHUB_APP_SLUG          — the App's URL slug, e.g. "marina-tracker"
 */

export function githubAppConfigured(): boolean {
  return !!(process.env.GITHUB_APP_ID && process.env.GITHUB_APP_PRIVATE_KEY)
}

function b64url(input: Buffer | string): string {
  return Buffer.from(input)
    .toString('base64')
    .replace(/=+$/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
}

/** Short-lived (10 min) App JWT, signed RS256 with the App private key. */
function appJwt(): string {
  const appId = process.env.GITHUB_APP_ID
  let privateKey = process.env.GITHUB_APP_PRIVATE_KEY
  if (!appId || !privateKey) throw new Error('GitHub App not configured (GITHUB_APP_ID / GITHUB_APP_PRIVATE_KEY)')
  // Accept EITHER the PEM contents OR (for local dev convenience) a path to the
  // .pem file. On Vercel there's no filesystem, so set the contents there.
  if (!privateKey.includes('BEGIN') && existsSync(privateKey.trim())) {
    privateKey = readFileSync(privateKey.trim(), 'utf8')
  }
  // Env vars often store PEMs with literal "\n" — normalise to real newlines.
  if (privateKey.includes('\\n')) privateKey = privateKey.replace(/\\n/g, '\n')

  const now = Math.floor(Date.now() / 1000)
  const header = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))
  // iat backdated 60s to tolerate clock skew; exp 9 min (GitHub max is 10).
  const payload = b64url(JSON.stringify({ iat: now - 60, exp: now + 9 * 60, iss: appId }))
  const unsigned = `${header}.${payload}`
  const signature = createSign('RSA-SHA256').update(unsigned).sign(privateKey)
  return `${unsigned}.${b64url(signature)}`
}

/** Exchange the App JWT for a short-lived installation access token. */
export async function installationToken(installationId: number): Promise<string> {
  const res = await fetch(
    `https://api.github.com/app/installations/${installationId}/access_tokens`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${appJwt()}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
      },
    },
  )
  if (!res.ok) {
    throw new Error(`installation token failed: ${res.status} ${await res.text()}`)
  }
  const data = (await res.json()) as { token: string }
  return data.token
}

/** An Octokit authenticated as the installation (can read the shared repos). */
export async function installationOctokit(installationId: number): Promise<Octokit> {
  return new Octokit({ auth: await installationToken(installationId) })
}

/** Where to send an org admin to install/configure the App for their org. */
export function appInstallUrl(orgId: number): string {
  const slug = process.env.GITHUB_APP_SLUG ?? 'marina'
  // `state` carries the orgId so our setup callback knows which workspace this
  // installation belongs to.
  return `https://github.com/apps/${slug}/installations/new?state=${orgId}`
}
