import { db, schema } from '@/lib/db/client'
import { afterResponse } from '@/lib/after'

export type AuditAction =
  | 'leave.requested'
  | 'leave.decided'
  | 'leave.cancelled'
  | 'break.started'
  | 'break.ended'
  | 'break.checked_in'
  | 'blocker.pinged'
  | 'blocker.resolved'
  | 'shift.punch_in'
  | 'shift.punch_out'
  | 'shift.verified'
  | 'member.invited'
  | 'member.removed'
  | 'member.role_changed'
  | 'member.updated'
  | 'invite.revoked'
  | 'device.paired'
  | 'device.revoked'
  | 'org.settings_changed'
  | 'org.ownership_transferred'
  | 'data.exported'
  | 'account.deleted'

export type AuditTargetType = 'user' | 'membership' | 'leave' | 'break' | 'shift' | 'device' | 'org' | 'invite' | 'team'

export type AuditPayload = {
  orgId?: number | null
  actorUserId?: number | null
  action: AuditAction
  targetType?: AuditTargetType
  targetId?: number
  payload?: Record<string, unknown>
  ip?: string | null
  userAgent?: string | null
}

/**
 * Record an audit entry. Uses Next's `after()` so the write survives serverless
 * function teardown — `void audit(...)` callers don't lose entries when Vercel
 * tears down the container before the promise resolves.
 *
 * Audit must never break the request path; any write failure is swallowed and
 * logged. Callers can ignore the returned void.
 */
export function audit(input: AuditPayload): void {
  afterResponse(
    () =>
      db
        .insert(schema.auditLogs)
        .values({
          orgId: input.orgId ?? null,
          actorUserId: input.actorUserId ?? null,
          action: input.action,
          targetType: input.targetType,
          targetId: input.targetId,
          payload: input.payload as never,
          ip: input.ip ?? null,
          userAgent: input.userAgent ?? null,
        }),
    `audit:${input.action}`,
  )
}

export function requestMeta(req: Request): { ip: string | null; userAgent: string | null } {
  const ua = req.headers.get('user-agent') ?? null
  const xff = req.headers.get('x-forwarded-for')
  const ip = xff ? xff.split(',')[0]!.trim() : req.headers.get('x-real-ip') ?? null
  return { ip, userAgent: ua }
}
