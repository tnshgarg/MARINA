import { NextResponse } from 'next/server'
import { and, eq } from 'drizzle-orm'
import { db, schema } from '@/lib/db/client'
import { HttpError, requireSession } from '@/lib/auth/guards'

export const runtime = 'nodejs'

/** Cancel my own pending leave request. */
export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireSession()
    const { id: raw } = await ctx.params
    const id = Number(raw)
    if (!Number.isInteger(id)) {
      return NextResponse.json({ error: 'invalid id' }, { status: 400 })
    }
    const [row] = await db
      .update(schema.leaveRequests)
      .set({ status: 'cancelled', decidedAt: new Date(), decidedBy: session.appUserId })
      .where(
        and(
          eq(schema.leaveRequests.id, id),
          eq(schema.leaveRequests.userId, session.appUserId),
          eq(schema.leaveRequests.status, 'pending')
        )
      )
      .returning()
    if (!row) {
      return NextResponse.json({ error: 'pending leave not found' }, { status: 404 })
    }
    return NextResponse.json({ ok: true, leave: { id: row.id, status: row.status } })
  } catch (err) {
    if (err instanceof HttpError) {
      return NextResponse.json({ error: err.message }, { status: err.status })
    }
    console.error('leave cancel failed', err)
    return NextResponse.json({ error: 'internal' }, { status: 500 })
  }
}
