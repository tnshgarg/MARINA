import { NextResponse } from 'next/server'
import { and, eq, isNull } from 'drizzle-orm'
import { db, schema } from '@/lib/db/client'
import { HttpError, requireCapability } from '@/lib/auth/guards'
import { audit, requestMeta } from '@/lib/audit/log'

export const runtime = 'nodejs'

export async function DELETE(
  req: Request,
  ctx: { params: Promise<{ orgId: string; inviteId: string }> },
) {
  const { orgId: orgIdRaw, inviteId: inviteIdRaw } = await ctx.params
  const orgId = Number(orgIdRaw)
  const inviteId = Number(inviteIdRaw)
  if (!Number.isInteger(orgId) || !Number.isInteger(inviteId)) {
    return NextResponse.json({ error: 'invalid ids' }, { status: 400 })
  }

  try {
    const { session } = await requireCapability(orgId, 'manage_members')
    const deleted = await db
      .delete(schema.invites)
      .where(
        and(
          eq(schema.invites.id, inviteId),
          eq(schema.invites.orgId, orgId),
          isNull(schema.invites.acceptedAt),
        ),
      )
      .returning()
    if (deleted.length === 0) {
      return NextResponse.json({ error: 'invite not found or already accepted' }, { status: 404 })
    }
    audit({
      action: 'invite.revoked',
      orgId,
      actorUserId: session.appUserId,
      targetType: 'invite',
      targetId: inviteId,
      payload: { email: deleted[0]!.email, role: deleted[0]!.role },
      ...requestMeta(req),
    })
    return NextResponse.json({ ok: true })
  } catch (err) {
    if (err instanceof HttpError) {
      return NextResponse.json({ error: err.message }, { status: err.status })
    }
    console.error('invite DELETE failed', err)
    return NextResponse.json({ error: 'internal' }, { status: 500 })
  }
}
