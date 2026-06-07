import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { and, eq, isNull } from 'drizzle-orm'
import { db, schema } from '@/lib/db/client'
import { HttpError, requireSession } from '@/lib/auth/guards'

export const runtime = 'nodejs'

export async function POST(req: Request) {
  try {
    const session = await requireSession()
    const { token } = (await req.json()) as { token?: string }
    if (!token || typeof token !== 'string') {
      return NextResponse.json({ error: 'token required' }, { status: 400 })
    }

    const invite = await db.query.invites.findFirst({
      where: and(eq(schema.invites.token, token), isNull(schema.invites.acceptedAt)),
    })
    if (!invite) return NextResponse.json({ error: 'invite not found or already used' }, { status: 404 })
    if (invite.expiresAt.getTime() < Date.now()) {
      return NextResponse.json({ error: 'invite expired' }, { status: 410 })
    }

    const existing = await db.query.memberships.findFirst({
      where: and(
        eq(schema.memberships.orgId, invite.orgId),
        eq(schema.memberships.userId, session.appUserId)
      ),
    })

    if (!existing) {
      await db.insert(schema.memberships).values({
        orgId: invite.orgId,
        userId: session.appUserId,
        role: invite.role,
      })
    }

    await db
      .update(schema.invites)
      .set({ acceptedAt: new Date() })
      .where(eq(schema.invites.id, invite.id))

    // Clear the pending-invite cookie now that we've accepted.
    try {
      const jar = await cookies()
      jar.delete('marina_pending_invite')
    } catch {
      // ignore
    }

    return NextResponse.json({ ok: true, orgId: invite.orgId })
  } catch (err) {
    if (err instanceof HttpError) {
      return NextResponse.json({ error: err.message }, { status: err.status })
    }
    console.error('invite accept failed', err)
    return NextResponse.json({ error: 'internal' }, { status: 500 })
  }
}
