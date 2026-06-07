import { NextResponse } from 'next/server'
import { and, eq, isNull } from 'drizzle-orm'
import { db, schema } from '@/lib/db/client'
import { authenticateAgent } from '@/lib/agent/auth'

export const runtime = 'nodejs'

const REASON_MAX = 500

/** Agent-authenticated break-start. Returns the new break and ongoing-break info. */
export async function POST(req: Request) {
  const agent = await authenticateAgent(req)
  if (!agent) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  let body: { reason?: string; orgId?: number } = {}
  try {
    body = (await req.json()) as { reason?: string; orgId?: number }
  } catch {
    return NextResponse.json({ error: 'invalid json' }, { status: 400 })
  }

  const reason = (body.reason ?? '').toString().trim().slice(0, REASON_MAX)
  if (reason.length === 0) {
    return NextResponse.json({ error: 'reason required' }, { status: 400 })
  }

  // Resolve org — explicit or first membership.
  let orgId: number | null = typeof body.orgId === 'number' ? body.orgId : null
  if (!orgId) {
    const ms = await db
      .select({ orgId: schema.memberships.orgId })
      .from(schema.memberships)
      .where(eq(schema.memberships.userId, agent.user.id))
      .limit(1)
    orgId = ms[0]?.orgId ?? null
  }

  // End any existing ongoing break — at most one ongoing at a time.
  await db
    .update(schema.breaks)
    .set({ endedAt: new Date() })
    .where(and(eq(schema.breaks.userId, agent.user.id), isNull(schema.breaks.endedAt)))

  const [row] = await db
    .insert(schema.breaks)
    .values({ userId: agent.user.id, orgId: orgId ?? undefined, reason })
    .returning()

  return NextResponse.json({
    ok: true,
    break: {
      id: row.id,
      startedAt: row.startedAt.toISOString(),
      endedAt: null,
      reason: row.reason,
    },
  })
}
