import { NextResponse } from 'next/server'
import { and, eq, isNull } from 'drizzle-orm'
import { db, schema } from '@/lib/db/client'
import { HttpError, requireSession } from '@/lib/auth/guards'

export const runtime = 'nodejs'

/** End an ongoing break. */
export async function PATCH(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireSession()
    const { id: raw } = await ctx.params
    const id = Number(raw)
    if (!Number.isInteger(id)) {
      return NextResponse.json({ error: 'invalid id' }, { status: 400 })
    }
    const [row] = await db
      .update(schema.breaks)
      .set({ endedAt: new Date() })
      .where(
        and(
          eq(schema.breaks.id, id),
          eq(schema.breaks.userId, session.appUserId),
          isNull(schema.breaks.endedAt)
        )
      )
      .returning()
    if (!row) {
      return NextResponse.json({ error: 'break not found or already ended' }, { status: 404 })
    }
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
