import { NextResponse } from 'next/server'
import { eq } from 'drizzle-orm'
import { db, schema } from '@/lib/db/client'
import { HttpError, requireCapability } from '@/lib/auth/guards'
import { audit, requestMeta } from '@/lib/audit/log'

export const runtime = 'nodejs'

/**
 * Revoke this org's Slack install. We clear every Slack column on the org
 * AND every cached `slackUserId` on its memberships, so a re-install picks
 * up the new workspace cleanly instead of inheriting stale per-user ids.
 *
 * We deliberately don't call `auth.revoke` against Slack here — if the org
 * wants to actually revoke the token in Slack itself they can use the
 * workspace UI. We just stop using it.
 */
export async function POST(req: Request) {
  let orgIdRaw: string | null = null
  try {
    const body = await req.json().catch(() => ({}))
    orgIdRaw = body?.orgId != null ? String(body.orgId) : null
  } catch {
    /* noop */
  }
  const orgId = Number(orgIdRaw)
  if (!Number.isInteger(orgId)) {
    return NextResponse.json({ error: 'missing orgId' }, { status: 400 })
  }

  try {
    const { session } = await requireCapability(orgId, 'manage_integrations')
    await db
      .update(schema.orgs)
      .set({
        slackTeamId: null,
        slackTeamName: null,
        slackBotToken: null,
        slackBotUserId: null,
        slackDefaultChannelId: null,
        slackInstalledAt: null,
      })
      .where(eq(schema.orgs.id, orgId))

    await db
      .update(schema.memberships)
      .set({ slackUserId: null, slackResolvedAt: null })
      .where(eq(schema.memberships.orgId, orgId))

    audit({
      action: 'org.settings_changed',
      orgId,
      actorUserId: session.appUserId,
      targetType: 'org',
      targetId: orgId,
      payload: { event: 'slack_disconnected' },
      ...requestMeta(req),
    })
    return NextResponse.json({ ok: true })
  } catch (e) {
    if (e instanceof HttpError) {
      return NextResponse.json({ error: e.message }, { status: e.status })
    }
    console.error('[slack/disconnect] failed', e)
    return NextResponse.json({ error: 'internal' }, { status: 500 })
  }
}
