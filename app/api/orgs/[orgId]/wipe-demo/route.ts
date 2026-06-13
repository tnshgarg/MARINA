import { NextResponse } from 'next/server'
import { and, eq, inArray, like } from 'drizzle-orm'
import { db, schema } from '@/lib/db/client'
import { HttpError, requireMembership } from '@/lib/auth/guards'
import { audit, requestMeta } from '@/lib/audit/log'

export const runtime = 'nodejs'

/**
 * Owner-only: purge any seed/demo GitHub events for this org's members.
 * Only deletes rows where externalId starts with "seed-" — real synced data
 * (numeric or SHA externalIds) is untouched. Idempotent.
 */
export async function POST(req: Request, ctx: { params: Promise<{ orgId: string }> }) {
  const { orgId: raw } = await ctx.params
  const orgId = Number(raw)
  if (!Number.isInteger(orgId)) {
    return NextResponse.json({ error: 'invalid orgId' }, { status: 400 })
  }

  try {
    const { session } = await requireMembership(orgId, 'admin')

    const memberIds = await db
      .select({ userId: schema.memberships.userId })
      .from(schema.memberships)
      .where(eq(schema.memberships.orgId, orgId))
    const userIds = memberIds.map((m) => m.userId)
    if (userIds.length === 0) return NextResponse.json({ ok: true, deleted: 0 })

    const deleted = await db
      .delete(schema.githubEvents)
      .where(
        and(
          inArray(schema.githubEvents.userId, userIds),
          like(schema.githubEvents.externalId, 'seed-%'),
        ),
      )
      .returning({ id: schema.githubEvents.id })

    void audit({
      action: 'org.settings_changed',
      orgId,
      actorUserId: session.appUserId,
      targetType: 'org',
      targetId: orgId,
      payload: { wipedDemoEvents: deleted.length },
      ...requestMeta(req),
    })

    return NextResponse.json({ ok: true, deleted: deleted.length })
  } catch (err) {
    if (err instanceof HttpError) {
      return NextResponse.json({ error: err.message }, { status: err.status })
    }
    console.error('wipe-demo failed', err)
    return NextResponse.json({ error: 'internal' }, { status: 500 })
  }
}
