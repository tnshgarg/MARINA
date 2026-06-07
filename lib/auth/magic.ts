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
  try {
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
  } catch (err) {
    // Most common cause: the `magic_links` table doesn't exist yet (forgot
    // to run `pnpm db:push`). Never let this propagate to NextAuth as a
    // Configuration error — return null and log clearly.
    console.error(
      '\n[auth/magic] consumeMagicToken failed.\n' +
      'Most likely the `magic_links` table is missing. Run:\n' +
      '   cd marina && pnpm db:push\n' +
      'Original error:',
      err
    )
    return null
  }
}

export function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email.trim())
}
