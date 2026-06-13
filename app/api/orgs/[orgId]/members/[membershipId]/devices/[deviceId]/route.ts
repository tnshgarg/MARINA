import { NextResponse } from 'next/server'
import { and, eq, isNull } from 'drizzle-orm'
import { db, schema } from '@/lib/db/client'
import { HttpError, requireMembership } from '@/lib/auth/guards'
import { audit, requestMeta } from '@/lib/audit/log'

export const runtime = 'nodejs'

/**
 * Revoke a paired desktop device on behalf of an employee.
 *
 * Owner-only — managers can SEE devices but only the workspace owner can
 * cut the cord. The intended use cases:
 *
 *   - Lost / stolen laptop: kill the token so it can't stream activity any
 *     more, even if the attacker knows the user's password.
 *   - Offboarding: revoke every paired device before changing the
 *     ex-employee's email or removing their membership.
 *
 * We set `revokedAt` (instead of deleting the row) so the audit trail of
 * "this device was active from X to Y" stays intact. The agent's heartbeat
 * will get a 401 and stop after the next ping.
 */
export async function DELETE(
  req: Request,
  ctx: { params: Promise<{ orgId: string; membershipId: string; deviceId: string }> },
) {
  const { orgId: rawO, membershipId: rawM, deviceId: rawD } = await ctx.params
  const orgId = Number(rawO)
  const membershipId = Number(rawM)
  const deviceId = Number(rawD)
  if (!Number.isInteger(orgId) || !Number.isInteger(membershipId) || !Number.isInteger(deviceId)) {
    return NextResponse.json({ error: 'invalid ids' }, { status: 400 })
  }

  try {
    const { session, membership } = await requireMembership(orgId, 'manager')
    if (membership.role !== 'owner') {
      return NextResponse.json(
        { error: 'Only the workspace owner can revoke a teammate\'s device.' },
        { status: 403 },
      )
    }

    const target = await db.query.memberships.findFirst({
      where: and(
        eq(schema.memberships.id, membershipId),
        eq(schema.memberships.orgId, orgId),
        isNull(schema.memberships.endedAt),
      ),
    })
    if (!target) return NextResponse.json({ error: 'member not found' }, { status: 404 })

    const device = await db.query.agentTokens.findFirst({
      where: and(eq(schema.agentTokens.id, deviceId), eq(schema.agentTokens.userId, target.userId)),
    })
    if (!device) return NextResponse.json({ error: 'device not found' }, { status: 404 })

    if (device.revokedAt) {
      return NextResponse.json({ ok: true, alreadyRevoked: true })
    }

    await db
      .update(schema.agentTokens)
      .set({ revokedAt: new Date() })
      .where(eq(schema.agentTokens.id, deviceId))

    const meta = requestMeta(req)
    audit({
      actorUserId: session.appUserId,
      orgId,
      action: 'device.revoked',
      targetType: 'device',
      targetId: deviceId,
      payload: { deviceLabel: device.label, targetUserId: target.userId },
      ip: meta.ip,
      userAgent: meta.userAgent,
    })

    return NextResponse.json({ ok: true })
  } catch (err) {
    if (err instanceof HttpError) {
      return NextResponse.json({ error: err.message }, { status: err.status })
    }
    console.error('device revoke failed', err)
    return NextResponse.json({ error: 'internal' }, { status: 500 })
  }
}
