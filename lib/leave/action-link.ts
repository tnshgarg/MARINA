import { createHmac, timingSafeEqual } from 'crypto'

/**
 * Signed one-click leave-action links for emails / notifications.
 *
 * A manager gets "Approve" / "Deny" buttons that work with a single click —
 * no app round-trip. The link carries a signed token binding the leaveId, the
 * decision, the deciding user, and an expiry. The action route still re-checks
 * RBAC (capability + scope) before applying — the token is a convenience, not
 * the authorization.
 */
const SEP = '.'

function secret(): string {
  const s = process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET
  if (!s) throw new Error('AUTH_SECRET must be set to sign leave-action links.')
  return s
}

export type LeaveActionPayload = {
  leaveId: number
  decision: 'approve' | 'deny'
  /** Unix seconds expiry. */
  exp: number
}

export function signLeaveAction(p: LeaveActionPayload): string {
  const body = Buffer.from(JSON.stringify(p)).toString('base64url')
  const sig = createHmac('sha256', secret()).update(body).digest('base64url')
  return `${body}${SEP}${sig}`
}

export function verifyLeaveAction(token: string): LeaveActionPayload | null {
  const [body, sig] = token.split(SEP)
  if (!body || !sig) return null
  const expected = createHmac('sha256', secret()).update(body).digest('base64url')
  const a = Buffer.from(sig)
  const b = Buffer.from(expected)
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null
  try {
    const p = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as LeaveActionPayload
    if (typeof p.leaveId !== 'number' || (p.decision !== 'approve' && p.decision !== 'deny')) return null
    if (typeof p.exp !== 'number' || p.exp * 1000 < Date.now()) return null
    return p
  } catch {
    return null
  }
}

/** 7-day links — long enough for a manager to act on a weekend request. */
export function leaveActionExpiry(): number {
  return Math.floor(Date.now() / 1000) + 7 * 24 * 60 * 60
}
