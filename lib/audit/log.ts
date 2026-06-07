import { db, schema } from '@/lib/db/client'

export type AuditAction =
  | 'leave.requested'
  | 'leave.decided'
  | 'leave.cancelled'
  | 'break.started'
  | 'break.ended'
  | 'break.checked_in'
  | 'blocker.pinged'
  | 'shift.punch_in'
  | 'shift.punch_out'
  | 'shift.verified'
  | 'member.invited'
  | 'member.removed'
  | 'member.role_changed'
  | 'invite.revoked'
  | 'device.paired'
  | 'device.revoked'
  | 'org.settings_changed'
  | 'data.exported'
  | 'account.deleted'

export type AuditTargetType = 'user' | 'membership' | 'leave' | 'break' | 'shift' | 'device' | 'org' | 'invite'

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

export async function audit(input: AuditPayload): Promise<void> {
  try {
    await db.insert(schema.auditLogs).values({
      orgId: input.orgId ?? null,
      actorUserId: input.actorUserId ?? null,
      action: input.action,
      targetType: input.targetType,
      targetId: input.targetId,
      payload: input.payload as never,
      ip: input.ip ?? null,
      userAgent: input.userAgent ?? null,
    })
  } catch (err) {
    // Audit must never break the request path.
    console.error('[audit] write failed', err)
  }
}

export function requestMeta(req: Request): { ip: string | null; userAgent: string | null } {
  const ua = req.headers.get('user-agent') ?? null
  const xff = req.headers.get('x-forwarded-for')
  const ip = xff ? xff.split(',')[0]!.trim() : req.headers.get('x-real-ip') ?? null
  return { ip, userAgent: ua }
}
