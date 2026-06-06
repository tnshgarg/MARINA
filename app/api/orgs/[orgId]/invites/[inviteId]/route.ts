import { NextResponse } from 'next/server'
import { and, eq, isNull } from 'drizzle-orm'
import { db, schema } from '@/lib/db/client'
import { HttpError, requireMembership } from '@/lib/auth/guards'

export const runtime = 'nodejs'

export async function DELETE(
  _req: Request,
  ctx: { params: Promise<{ orgId: string; inviteId: string }> }
) {
  const { orgId: orgIdRaw, inviteId: inviteIdRaw } = await ctx.params
  const orgId = Number(orgIdRaw)
  const inviteId = Number(inviteIdRaw)
  if (!Number.isInteger(orgId) || !Number.isInteger(inviteId)) {
    return NextResponse.json({ error: 'invalid ids' }, { status: 400 })
  }

  try {
    await requireMembership(orgId, 'manager')
    const deleted = await db
      .delete(schema.invites)
      .where(
        and(
          eq(schema.invites.id, inviteId),
          eq(schema.invites.orgId, orgId),
          isNull(schema.invites.acceptedAt)
        )
      )
      .returning()
    if (deleted.length === 0) {
      return NextResponse.json({ error: 'invite not found or already accepted' }, { status: 404 })
    }
    return NextResponse.json({ ok: true })
  } catch (err) {
    if (err instanceof HttpError) {
      return NextResponse.json({ error: err.message }, { status: err.status })
    }
    console.error('invite DELETE failed', err)
    return NextResponse.json({ error: 'internal' }, { status: 500 })
  }
}
