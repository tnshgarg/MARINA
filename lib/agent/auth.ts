import { createHash, randomBytes, timingSafeEqual } from 'crypto'
import { and, eq, isNull } from 'drizzle-orm'
import { db, schema } from '@/lib/db/client'
import type { AgentToken, User } from '@/lib/db/schema'

export const AGENT_TOKEN_PREFIX = 'mka_'

export function generateAgentToken(): { plaintext: string; hash: string; prefix: string } {
  const raw = randomBytes(32).toString('base64url')
  const plaintext = `${AGENT_TOKEN_PREFIX}${raw}`
  const hash = sha256(plaintext)
  const prefix = plaintext.slice(0, 8) // mka_xxxx for display
  return { plaintext, hash, prefix }
}

export function sha256(input: string): string {
  return createHash('sha256').update(input).digest('hex')
}

export function constantTimeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  try {
    return timingSafeEqual(Buffer.from(a, 'hex'), Buffer.from(b, 'hex'))
  } catch {
    return false
  }
}

export type AuthenticatedAgent = {
  token: AgentToken
  user: User
}

export async function authenticateAgent(req: Request): Promise<AuthenticatedAgent | null> {
  const header = req.headers.get('authorization') ?? ''
  const match = /^Bearer\s+(.+)$/i.exec(header.trim())
  if (!match) return null
  const presented = match[1].trim()
  if (!presented.startsWith(AGENT_TOKEN_PREFIX)) return null

  const hash = sha256(presented)
  const row = await db
    .select({ token: schema.agentTokens, user: schema.users })
    .from(schema.agentTokens)
    .innerJoin(schema.users, eq(schema.agentTokens.userId, schema.users.id))
    .where(and(eq(schema.agentTokens.tokenHash, hash), isNull(schema.agentTokens.revokedAt)))
    .limit(1)
    .then((rows) => rows[0])

  if (!row) return null

  // Touch lastSeenAt without blocking the request path on failure.
  void db
    .update(schema.agentTokens)
    .set({ lastSeenAt: new Date() })
    .where(eq(schema.agentTokens.id, row.token.id))
    .catch((err) => console.error('lastSeenAt update failed', err))

  return { token: row.token, user: row.user }
}

// Pairing code helpers — 8 chars, base32-ish (no I, O, 0, 1 to avoid ambiguity).
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'

export function generatePairingCode(): { plaintext: string; hash: string } {
  const bytes = randomBytes(8)
  let out = ''
  for (let i = 0; i < 8; i++) {
    out += CODE_ALPHABET[bytes[i] % CODE_ALPHABET.length]
  }
  return { plaintext: out, hash: sha256(out) }
}

export function normalizePairingCode(input: string): string {
  return input.trim().toUpperCase().replace(/[^A-Z2-9]/g, '')
}

export function hashPairingCode(code: string): string {
  return sha256(code)
}
