import { NextResponse } from 'next/server'
import { eq } from 'drizzle-orm'
import { db, schema } from '@/lib/db/client'
import { isAdminSession } from '@/lib/auth/admin'

export const runtime = 'nodejs'

/** Retire an announcement immediately by setting endsAt = now. */
export async function DELETE(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  if (!(await isAdminSession())) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  }
  const { id: raw } = await ctx.params
  const id = Number(raw)
  if (!Number.isInteger(id)) {
    return NextResponse.json({ error: 'invalid id' }, { status: 400 })
  }
  await db
    .update(schema.announcements)
    .set({ endsAt: new Date() })
    .where(eq(schema.announcements.id, id))
  return NextResponse.json({ ok: true })
}
