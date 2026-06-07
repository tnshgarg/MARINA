import { NextResponse } from 'next/server'
import { eq } from 'drizzle-orm'
import { db, schema } from '@/lib/db/client'
import { authenticateAgent } from '@/lib/agent/auth'

export const runtime = 'nodejs'

const REASON_MAX = 500
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/

/** Agent-authenticated leave-request submission. */
export async function POST(req: Request) {
  const agent = await authenticateAgent(req)
  if (!agent) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  let body: {
    orgId?: number
    startDate?: string
    endDate?: string
    reason?: string
  } = {}
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'invalid json' }, { status: 400 })
  }

  // Default orgId to the user's first membership
  let orgId: number | null = typeof body.orgId === 'number' ? body.orgId : null
  if (!orgId) {
    const ms = await db
      .select({ orgId: schema.memberships.orgId })
      .from(schema.memberships)
      .where(eq(schema.memberships.userId, agent.user.id))
      .limit(1)
    orgId = ms[0]?.orgId ?? null
  }
  if (!orgId) {
    return NextResponse.json({ error: 'no team — accept a team invite first' }, { status: 400 })
  }

  if (typeof body.startDate !== 'string' || !ISO_DATE.test(body.startDate)) {
    return NextResponse.json({ error: 'startDate must be YYYY-MM-DD' }, { status: 400 })
  }
  if (typeof body.endDate !== 'string' || !ISO_DATE.test(body.endDate)) {
    return NextResponse.json({ error: 'endDate must be YYYY-MM-DD' }, { status: 400 })
  }
  if (body.endDate < body.startDate) {
    return NextResponse.json({ error: 'endDate must be on or after startDate' }, { status: 400 })
  }
  const reason = (body.reason ?? '').toString().trim().slice(0, REASON_MAX)
  if (reason.length === 0) {
    return NextResponse.json({ error: 'reason required' }, { status: 400 })
  }

  // Confirm membership
  const membership = await db.query.memberships.findFirst({
    where: eq(schema.memberships.userId, agent.user.id),
  })
  if (!membership || membership.orgId !== orgId) {
    return NextResponse.json({ error: 'not a member of that org' }, { status: 403 })
  }

  const [row] = await db
    .insert(schema.leaveRequests)
    .values({
      userId: agent.user.id,
      orgId,
      startDate: body.startDate,
      endDate: body.endDate,
      reason,
      status: 'pending',
    })
    .returning()

  return NextResponse.json({
    ok: true,
    leave: {
      id: row.id,
      startDate: row.startDate,
      endDate: row.endDate,
      reason: row.reason,
      status: row.status,
      createdAt: row.createdAt.toISOString(),
    },
  })
}
