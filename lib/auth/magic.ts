import { createHash, randomBytes } from 'crypto'
import { and, eq, gt, isNull } from 'drizzle-orm'
import { db, schema } from '@/lib/db/client'

// 60 minutes — enough headroom for the email to land, the inbox-spam-triage
// dance, and the user actually finding a moment to click. 15 min was too short
// for invite flows where the user is on a meeting / commute / etc. and comes
// back to their inbox an hour later. Standard for Slack/Notion/Linear too.
export const MAGIC_TTL_MINUTES = 60

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
    // ATOMIC single-use: flip consumedAt only if it's still null AND unexpired,
    // and return the row in the same statement. Two concurrent redemptions of
    // the same link now race on one UPDATE — exactly one gets a row back, the
    // other gets zero rows (→ null). The old find-then-update had a window
    // where both reads saw an unconsumed token before either wrote.
    const updated = await db
      .update(schema.magicLinks)
      .set({ consumedAt: new Date() })
      .where(
        and(
          eq(schema.magicLinks.tokenHash, hash),
          isNull(schema.magicLinks.consumedAt),
          gt(schema.magicLinks.expiresAt, new Date()),
        ),
      )
      .returning({ email: schema.magicLinks.email })
    return updated[0]?.email ?? null
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
