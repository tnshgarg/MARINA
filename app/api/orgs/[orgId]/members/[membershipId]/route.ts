import { NextResponse } from 'next/server'
import { and, eq } from 'drizzle-orm'
import { db, schema } from '@/lib/db/client'
import { HttpError, requireMembership } from '@/lib/auth/guards'

export const runtime = 'nodejs'

export async function DELETE(
  _req: Request,
  ctx: { params: Promise<{ orgId: string; membershipId: string }> }
) {
  const { orgId: orgIdRaw, membershipId: midRaw } = await ctx.params
  const orgId = Number(orgIdRaw)
  const membershipId = Number(midRaw)
  if (!Number.isInteger(orgId) || !Number.isInteger(membershipId)) {
    return NextResponse.json({ error: 'invalid ids' }, { status: 400 })
  }

  try {
    const { membership: actor } = await requireMembership(orgId, 'owner')

    const target = await db.query.memberships.findFirst({
      where: and(
        eq(schema.memberships.id, membershipId),
        eq(schema.memberships.orgId, orgId)
      ),
    })
    if (!target) return NextResponse.json({ error: 'membership not found' }, { status: 404 })
    if (target.role === 'owner') {
      return NextResponse.json({ error: "can't remove the owner" }, { status: 409 })
    }
    if (target.id === actor.id) {
      return NextResponse.json({ error: "can't remove yourself" }, { status: 409 })
    }

    await db.delete(schema.memberships).where(eq(schema.memberships.id, membershipId))
    return NextResponse.json({ ok: true })
  } catch (err) {
    if (err instanceof HttpError) {
      return NextResponse.json({ error: err.message }, { status: err.status })
    }
    console.error('remove member failed', err)
    return NextResponse.json({ error: 'internal' }, { status: 500 })
  }
}
