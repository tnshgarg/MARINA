import { NextResponse } from 'next/server'
import { and, eq, isNull } from 'drizzle-orm'
import { db, schema } from '@/lib/db/client'
import { HttpError, requireSession } from '@/lib/auth/guards'

export const runtime = 'nodejs'

const UNDO_WINDOW_MS = 5 * 60 * 1000

/**
 * Delete a misclicked break — only allowed within 5 minutes of starting, and
 * only if the break hasn't already been ended. Past that window the user
 * should keep the record and let the manager see the (possibly-erroneous)
 * pause; data integrity over erasure.
 */
export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireSession()
    const { id: raw } = await ctx.params
    const id = Number(raw)
    if (!Number.isInteger(id)) {
      return NextResponse.json({ error: 'invalid id' }, { status: 400 })
    }
    const row = await db.query.breaks.findFirst({
      where: and(eq(schema.breaks.id, id), eq(schema.breaks.userId, session.appUserId)),
    })
    if (!row) return NextResponse.json({ error: 'break not found' }, { status: 404 })
    if (row.endedAt) {
      return NextResponse.json({ error: 'cannot delete an ended break' }, { status: 409 })
    }
    if (Date.now() - row.startedAt.getTime() > UNDO_WINDOW_MS) {
      return NextResponse.json(
        { error: 'undo window expired — end the break instead' },
        { status: 409 },
      )
    }
    await db.delete(schema.breaks).where(eq(schema.breaks.id, id))
    return NextResponse.json({ ok: true })
  } catch (err) {
    if (err instanceof HttpError) {
      return NextResponse.json({ error: err.message }, { status: err.status })
    }
    console.error('break delete failed', err)
    return NextResponse.json({ error: 'internal' }, { status: 500 })
  }
}

/** End an ongoing break. */
export async function PATCH(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireSession()
    const { id: raw } = await ctx.params
    const id = Number(raw)
    if (!Number.isInteger(id)) {
      return NextResponse.json({ error: 'invalid id' }, { status: 400 })
    }
    // Load first so we can branch on category. For blocked breaks we also
    // stamp `resolvedByUserId` + `resolutionType='self_resolved'` so the
    // manager view distinguishes "employee figured it out themselves" from
    // "manager unblocked them".
    const existing = await db.query.breaks.findFirst({
      where: and(
        eq(schema.breaks.id, id),
        eq(schema.breaks.userId, session.appUserId),
        isNull(schema.breaks.endedAt),
      ),
    })
    if (!existing) {
      return NextResponse.json({ error: 'break not found or already ended' }, { status: 404 })
    }

    const now = new Date()
    const patch: Record<string, unknown> = { endedAt: now }
    if (existing.category === 'blocked') {
      patch.resolvedByUserId = session.appUserId
      patch.resolutionType = 'self_resolved'
    }

    const [row] = await db
      .update(schema.breaks)
      .set(patch)
      .where(eq(schema.breaks.id, id))
      .returning()

    return NextResponse.json({
      ok: true,
      break: {
        id: row.id,
        startedAt: row.startedAt.toISOString(),
        endedAt: row.endedAt?.toISOString() ?? null,
        reason: row.reason,
      },
    })
  } catch (err) {
    if (err instanceof HttpError) {
      return NextResponse.json({ error: err.message }, { status: err.status })
    }
    console.error('break end failed', err)
    return NextResponse.json({ error: 'internal' }, { status: 500 })
  }
}
