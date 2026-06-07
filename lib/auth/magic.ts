import { createHash, randomBytes } from 'crypto'
import { and, eq, gt, isNull } from 'drizzle-orm'
import { db, schema } from '@/lib/db/client'

export const MAGIC_TTL_MINUTES = 15

export function generateMagicToken(): { plaintext: string; hash: string } {
  const raw = randomBytes(32).toString('base64url')
  const hash = createHash('sha256').update(raw).digest('hex')
  return { plaintext: raw, hash }
}

export function hashMagicToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

export async function consumeMagicToken(token: string): Promise<string | null> {
  const hash = hashMagicToken(token)
  const row = await db.query.magicLinks.findFirst({
    where: and(
      eq(schema.magicLinks.tokenHash, hash),
      isNull(schema.magicLinks.consumedAt),
      gt(schema.magicLinks.expiresAt, new Date())
    ),
  })
  if (!row) return null
  await db
    .update(schema.magicLinks)
    .set({ consumedAt: new Date() })
    .where(eq(schema.magicLinks.id, row.id))
  return row.email
}

export function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email.trim())
}
