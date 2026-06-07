import { NextResponse } from 'next/server'
import { and, eq, isNull } from 'drizzle-orm'
import { db, schema } from '@/lib/db/client'
import { authenticateAgent } from '@/lib/agent/auth'
import { audit, requestMeta } from '@/lib/audit/log'

export const runtime = 'nodejs'

export async function POST(req: Request) {
  const agent = await authenticateAgent(req)
  if (!agent) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const ms = await db
    .select({ orgId: schema.memberships.orgId })
    .from(schema.memberships)
    .where(eq(schema.memberships.userId, agent.user.id))
    .limit(1)
  const orgId = ms[0]?.orgId ?? null

  const existing = await db.query.shifts.findFirst({
    where: and(eq(schema.shifts.userId, agent.user.id), isNull(schema.shifts.punchedOutAt)),
  })
  if (existing) {
    return NextResponse.json({
      ok: true,
      alreadyOpen: true,
      shift: serialise(existing),
    })
  }

  const [row] = await db
    .insert(schema.shifts)
    .values({
      userId: agent.user.id,
      orgId: orgId ?? undefined,
      punchedInVia: 'agent',
    })
    .returning()

  void audit({
    action: 'shift.punch_in',
    orgId,
    actorUserId: agent.user.id,
    targetType: 'shift',
    targetId: row.id,
    payload: { via: 'agent' },
    ...requestMeta(req),
  })

  return NextResponse.json({ ok: true, shift: serialise(row) })
}

function serialise(s: typeof schema.shifts.$inferSelect) {
  return {
    id: s.id,
    punchedInAt: s.punchedInAt.toISOString(),
    punchedOutAt: s.punchedOutAt?.toISOString() ?? null,
  }
}
