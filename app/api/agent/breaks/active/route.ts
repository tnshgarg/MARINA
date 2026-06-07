import { NextResponse } from 'next/server'
import { and, eq, isNull } from 'drizzle-orm'
import { db, schema } from '@/lib/db/client'
import { authenticateAgent } from '@/lib/agent/auth'

export const runtime = 'nodejs'

/** End the user's active break (if any). Idempotent. */
export async function PATCH(req: Request) {
  const agent = await authenticateAgent(req)
  if (!agent) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const [row] = await db
    .update(schema.breaks)
    .set({ endedAt: new Date() })
    .where(and(eq(schema.breaks.userId, agent.user.id), isNull(schema.breaks.endedAt)))
    .returning()

  if (!row) {
    return NextResponse.json({ ok: true, ended: false })
  }
  return NextResponse.json({
    ok: true,
    ended: true,
    break: {
      id: row.id,
      startedAt: row.startedAt.toISOString(),
      endedAt: row.endedAt?.toISOString() ?? null,
      reason: row.reason,
    },
  })
}
