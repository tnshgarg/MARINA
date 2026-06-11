import { NextResponse } from 'next/server'
import { and, eq } from 'drizzle-orm'
import { db, schema } from '@/lib/db/client'
import { HttpError, requireSession } from '@/lib/auth/guards'

export const runtime = 'nodejs'

/**
 * Allow the owner of a deliverable to delete it (e.g. logged the wrong
 * thing). We don't allow edits — encourage logging a new one instead so
 * the audit trail stays honest.
 */
export async function DELETE(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id: raw } = await ctx.params
  const id = Number(raw)
  if (!Number.isInteger(id)) {
    return NextResponse.json({ error: 'invalid id' }, { status: 400 })
  }
  try {
    const session = await requireSession()
    const row = await db.query.deliverables.findFirst({
      where: and(
        eq(schema.deliverables.id, id),
        eq(schema.deliverables.userId, session.appUserId),
      ),
    })
    if (!row) return NextResponse.json({ error: 'not found' }, { status: 404 })
    await db.delete(schema.deliverables).where(eq(schema.deliverables.id, id))
    return NextResponse.json({ ok: true })
  } catch (err) {
    if (err instanceof HttpError) {
      return NextResponse.json({ error: err.message }, { status: err.status })
    }
    console.error('delete deliverable failed', err)
    return NextResponse.json({ error: 'internal' }, { status: 500 })
  }
}
