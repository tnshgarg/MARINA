import { NextResponse } from 'next/server'
import { eq } from 'drizzle-orm'
import { db, schema } from '@/lib/db/client'
import { HttpError, requireMembership } from '@/lib/auth/guards'
import { syncUserActivity } from '@/lib/github/sync'
import { syncOrgViaApp } from '@/lib/github/app-sync'
import { audit, requestMeta } from '@/lib/audit/log'

export const runtime = 'nodejs'
export const maxDuration = 60

/**
 * Manager-triggered bulk re-sync of every team member who has a GitHub token.
 * Runs sequentially with a 30-day window. Returns per-member outcome.
 */
export async function POST(req: Request, ctx: { params: Promise<{ orgId: string }> }) {
  const { orgId: raw } = await ctx.params
  const orgId = Number(raw)
  if (!Number.isInteger(orgId)) {
    return NextResponse.json({ error: 'invalid orgId' }, { status: 400 })
  }

  try {
    const { session } = await requireMembership(orgId, 'manager')

    const org = await db.query.orgs.findFirst({ where: eq(schema.orgs.id, orgId) })
    const trackedOrgs = (org as { trackedGithubOrgs?: string[] } | undefined)?.trackedGithubOrgs ?? []

    const memberships = await db
      .select({ userId: schema.memberships.userId })
      .from(schema.memberships)
      .where(eq(schema.memberships.orgId, orgId))

    const userIds = memberships.map((m) => m.userId)
    const results: Array<{ userId: number; login: string; inserted?: number; skipped?: string; error?: string }> = []

    for (const uid of userIds) {
      const user = await db.query.users.findFirst({ where: eq(schema.users.id, uid) })
      if (!user) continue
      if (!user.accessToken || !user.login) {
        results.push({ userId: uid, login: user.login ?? '?', skipped: 'no GitHub token' })
        continue
      }
      try {
        const res = await syncUserActivity(uid, user.login, user.accessToken, 30, trackedOrgs)
        results.push({ userId: uid, login: user.login, inserted: res.inserted })
      } catch (err) {
        results.push({ userId: uid, login: user.login, error: (err as Error).message })
      }
    }

    // Also pull via the GitHub App installation (the reliable path for the
    // org's selected repos, incl. private). Best-effort — never fail the whole
    // sync if the App isn't installed.
    let appSync: { repos: number; inserted: number } | null = null
    try {
      const r = await syncOrgViaApp(orgId)
      if (r.installationId) appSync = { repos: r.repos, inserted: r.inserted }
    } catch (e) {
      console.error('[sync-team] app sync failed', e)
    }

    void audit({
      action: 'org.settings_changed',
      orgId,
      actorUserId: session.appUserId,
      targetType: 'org',
      targetId: orgId,
      payload: { bulkSync: results.length },
      ...requestMeta(req),
    })

    const succeeded = results.filter((r) => r.inserted !== undefined).length
    const skipped = results.filter((r) => r.skipped).length
    const failed = results.filter((r) => r.error).length

    return NextResponse.json({
      ok: true,
      summary: { total: results.length, succeeded, skipped, failed },
      appSync,
      results,
    })
  } catch (err) {
    if (err instanceof HttpError) {
      return NextResponse.json({ error: err.message }, { status: err.status })
    }
    console.error('bulk team sync failed', err)
    return NextResponse.json({ error: 'internal' }, { status: 500 })
  }
}
