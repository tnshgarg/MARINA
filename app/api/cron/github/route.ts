import { NextResponse } from 'next/server'
import { isNotNull } from 'drizzle-orm'
import { db, schema } from '@/lib/db/client'
import { authorizeCron } from '@/lib/cron/auth'
import { syncOrgViaApp } from '@/lib/github/app-sync'
import { syncGithubForUser } from '@/lib/github/auto-sync'
import { log } from '@/lib/log/log'

export const runtime = 'nodejs'
export const maxDuration = 300

/**
 * Daily GitHub refresh for the whole platform. Two passes:
 *   1. Org App installations → `syncOrgViaApp` (the reliable manager path;
 *      attributes every member's commits/PRs/reviews server-side).
 *   2. Every user who connected their own GitHub OAuth → `syncUserActivity`
 *      (covers solo employees and orgs that never installed the App).
 *
 * This is what guarantees an employee's activity reaches their manager even if
 * nobody opens the web app that day. Idempotent — runs in production daily.
 */
export async function GET(req: Request) {
  if (!authorizeCron(req)) return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  return run()
}
export async function POST(req: Request) {
  if (!authorizeCron(req)) return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  return run()
}

async function run() {
  let orgsSynced = 0
  let usersSynced = 0
  const errors: Array<{ kind: string; id: number; error: string }> = []

  // Pass 1 — org App installations.
  const orgs = await db
    .select({ id: schema.orgs.id })
    .from(schema.orgs)
    .where(isNotNull(schema.orgs.githubInstallationId))
  for (const o of orgs) {
    try {
      await syncOrgViaApp(o.id)
      orgsSynced++
    } catch (err) {
      errors.push({ kind: 'org', id: o.id, error: String(err) })
      log.error('cron.github.org_failed', { orgId: o.id, err: String(err) })
    }
  }

  // Pass 2 — individually-connected users (OAuth token on file).
  const users = await db
    .select({ id: schema.users.id, login: schema.users.login })
    .from(schema.users)
    .where(isNotNull(schema.users.accessToken))
  for (const u of users) {
    try {
      const r = await syncGithubForUser(u.id, u.login, { daysBack: 7 })
      if (r.ran) usersSynced++
    } catch (err) {
      errors.push({ kind: 'user', id: u.id, error: String(err) })
      log.error('cron.github.user_failed', { userId: u.id, err: String(err) })
    }
  }

  log.info('cron.github.done', { orgsSynced, usersSynced, errors: errors.length })
  return NextResponse.json({ ok: true, orgsSynced, usersSynced, errors })
}
