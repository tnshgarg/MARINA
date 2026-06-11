import { NextResponse } from 'next/server'
import { and, eq } from 'drizzle-orm'
import { db, schema } from '@/lib/db/client'
import { HttpError, requireSession } from '@/lib/auth/guards'
import { revokeToken } from '@/lib/google/oauth'

export const runtime = 'nodejs'

/**
 * Disconnect Google Calendar: revoke at Google, delete the `accounts` row,
 * and purge synced meetings (so we don't keep stale data).
 */
export async function POST() {
  try {
    const session = await requireSession()

    const account = await db.query.accounts.findFirst({
      where: and(
        eq(schema.accounts.userId, session.appUserId),
        eq(schema.accounts.provider, 'google'),
      ),
    })
    if (!account) {
      return NextResponse.json({ ok: true, alreadyDisconnected: true })
    }

    // Await Google revocation so we know whether upstream is actually disconnected.
    // If it failed we still purge local state but tell the user to revoke at
    // myaccount.google.com — important for DPDP "right to disconnect" compliance.
    const revoked = account.refresh_token
      ? await revokeToken(account.refresh_token)
      : account.access_token
        ? await revokeToken(account.access_token)
        : true

    await db
      .delete(schema.accounts)
      .where(
        and(
          eq(schema.accounts.provider, 'google'),
          eq(schema.accounts.providerAccountId, account.providerAccountId),
        ),
      )

    // Purge meetings for this user — they came from the now-disconnected calendar.
    await db
      .delete(schema.meetings)
      .where(
        and(
          eq(schema.meetings.userId, session.appUserId),
          eq(schema.meetings.provider, 'google'),
        ),
      )

    return NextResponse.json({
      ok: true,
      revokedUpstream: revoked,
      // If false, the user should also revoke at https://myaccount.google.com/permissions
      manualRevokeUrl: revoked ? null : 'https://myaccount.google.com/permissions',
    })
  } catch (err) {
    if (err instanceof HttpError) {
      return NextResponse.json({ error: err.message }, { status: err.status })
    }
    console.error('calendar/disconnect failed', err)
    return NextResponse.json({ error: 'internal' }, { status: 500 })
  }
}
