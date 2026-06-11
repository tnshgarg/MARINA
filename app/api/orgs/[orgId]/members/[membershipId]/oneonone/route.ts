import { NextResponse } from 'next/server'
import { and, eq } from 'drizzle-orm'
import { db, schema } from '@/lib/db/client'
import { HttpError, requireMembership } from '@/lib/auth/guards'
import { buildOneOnOneBrief } from '@/lib/digest/oneonone'

export const runtime = 'nodejs'

/**
 * Manager 1-on-1 prep brief. Read-only, no LLM call, ~200ms.
 *
 * Returns wins / risks / questions / past commitments grounded in real
 * GitHub events + breaks + narratives + shifts.
 */
export async function GET(
  _req: Request,
  ctx: { params: Promise<{ orgId: string; membershipId: string }> },
) {
  const { orgId: rawO, membershipId: rawM } = await ctx.params
  const orgId = Number(rawO)
  const membershipId = Number(rawM)
  if (!Number.isInteger(orgId) || !Number.isInteger(membershipId)) {
    return NextResponse.json({ error: 'invalid ids' }, { status: 400 })
  }

  try {
    await requireMembership(orgId, 'manager')
    const membership = await db.query.memberships.findFirst({
      where: and(
        eq(schema.memberships.id, membershipId),
        eq(schema.memberships.orgId, orgId),
      ),
    })
    if (!membership) return NextResponse.json({ error: 'member not found' }, { status: 404 })

    const brief = await buildOneOnOneBrief(membership.userId)
    if (!brief) return NextResponse.json({ error: 'user not found' }, { status: 404 })

    return NextResponse.json(brief)
  } catch (err) {
    if (err instanceof HttpError) {
      return NextResponse.json({ error: err.message }, { status: err.status })
    }
    console.error('oneonone failed', err)
    return NextResponse.json({ error: 'internal' }, { status: 500 })
  }
}
