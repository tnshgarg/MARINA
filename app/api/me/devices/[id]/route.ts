import { NextResponse } from 'next/server'
import { and, eq } from 'drizzle-orm'
import { db, schema } from '@/lib/db/client'
import { HttpError, requireSession } from '@/lib/auth/guards'

export const runtime = 'nodejs'

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id: raw } = await ctx.params
  const id = Number(raw)
  if (!Number.isInteger(id)) {
    return NextResponse.json({ error: 'invalid id' }, { status: 400 })
  }
  try {
    const session = await requireSession()
    const [updated] = await db
      .update(schema.agentTokens)
      .set({ revokedAt: new Date() })
      .where(
        and(
          eq(schema.agentTokens.id, id),
          eq(schema.agentTokens.userId, session.appUserId)
        )
      )
      .returning()
    if (!updated) return NextResponse.json({ error: 'not found' }, { status: 404 })
    return NextResponse.json({ ok: true })
  } catch (err) {
    if (err instanceof HttpError) {
      return NextResponse.json({ error: err.message }, { status: err.status })
    }
    console.error('device DELETE failed', err)
    return NextResponse.json({ error: 'internal' }, { status: 500 })
  }
}
