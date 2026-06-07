import { NextResponse } from 'next/server'
import { db, schema } from '@/lib/db/client'
import { authenticateAgent } from '@/lib/agent/auth'
import { checkLimit, rateLimitHeaders } from '@/lib/agent/rate-limit'

export const runtime = 'nodejs'

export async function POST(req: Request) {
  const agent = await authenticateAgent(req)
  if (!agent) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const limit = checkLimit('pause', agent.token.id)
  if (!limit.ok) {
    return NextResponse.json(
      { error: 'rate limited' },
      { status: 429, headers: rateLimitHeaders(limit) }
    )
  }

  let body: { paused?: boolean } = {}
  try {
    body = (await req.json()) as { paused?: boolean }
  } catch {
    return NextResponse.json({ error: 'invalid json' }, { status: 400 })
  }

  if (typeof body.paused !== 'boolean') {
    return NextResponse.json({ error: 'paused (boolean) required' }, { status: 400 })
  }

  // Upsert user_settings row.
  await db
    .insert(schema.userSettings)
    .values({
      userId: agent.user.id,
      trackingPausedAt: body.paused ? new Date() : null,
    })
    .onConflictDoUpdate({
      target: schema.userSettings.userId,
      set: {
        trackingPausedAt: body.paused ? new Date() : null,
        updatedAt: new Date(),
      },
    })

  return NextResponse.json(
    {
      ok: true,
      pausedAt: body.paused ? new Date().toISOString() : null,
    },
    { headers: rateLimitHeaders(limit) }
  )
}
