import { NextResponse } from 'next/server'
import { desc, eq } from 'drizzle-orm'
import { db, schema } from '@/lib/db/client'
import { HttpError, requireSession } from '@/lib/auth/guards'

export const runtime = 'nodejs'

export async function GET() {
  try {
    const session = await requireSession()
    const rows = await db
      .select()
      .from(schema.agentTokens)
      .where(eq(schema.agentTokens.userId, session.appUserId))
      .orderBy(desc(schema.agentTokens.pairedAt))

    return NextResponse.json({
      ok: true,
      devices: rows.map((r) => ({
        id: r.id,
        label: r.label,
        platform: r.platform,
        tokenPrefix: r.tokenPrefix,
        agentVersion: r.agentVersion,
        pairedAt: r.pairedAt.toISOString(),
        lastSeenAt: r.lastSeenAt?.toISOString() ?? null,
        revokedAt: r.revokedAt?.toISOString() ?? null,
      })),
    })
  } catch (err) {
    if (err instanceof HttpError) {
      return NextResponse.json({ error: err.message }, { status: err.status })
    }
    console.error('devices GET failed', err)
    return NextResponse.json({ error: 'internal' }, { status: 500 })
  }
}
