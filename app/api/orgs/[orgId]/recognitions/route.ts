import { NextResponse } from 'next/server'
import { and, desc, eq } from 'drizzle-orm'
import { db, schema } from '@/lib/db/client'
import { HttpError, requireMembership } from '@/lib/auth/guards'
import { createRecognition } from '@/lib/recognitions/create'

export const runtime = 'nodejs'

/** List recent recognitions in the org. Any active member can read the feed. */
export async function GET(_req: Request, ctx: { params: Promise<{ orgId: string }> }) {
  const orgId = Number((await ctx.params).orgId)
  if (!Number.isInteger(orgId)) return NextResponse.json({ error: 'invalid orgId' }, { status: 400 })
  try {
    await requireMembership(orgId, 'member')
    const fromU = schema.users
    const rows = await db
      .select({
        id: schema.recognitions.id,
        message: schema.recognitions.message,
        createdAt: schema.recognitions.createdAt,
        fromName: fromU.name,
        fromLogin: fromU.login,
      })
      .from(schema.recognitions)
      .innerJoin(fromU, eq(schema.recognitions.fromUserId, fromU.id))
      .where(eq(schema.recognitions.orgId, orgId))
      .orderBy(desc(schema.recognitions.createdAt))
      .limit(50)
    return NextResponse.json({ recognitions: rows })
  } catch (e) {
    if (e instanceof HttpError) return NextResponse.json({ error: e.message }, { status: e.status })
    throw e
  }
}

/** Give recognition to a teammate. Any active member can. */
export async function POST(req: Request, ctx: { params: Promise<{ orgId: string }> }) {
  const orgId = Number((await ctx.params).orgId)
  if (!Number.isInteger(orgId)) return NextResponse.json({ error: 'invalid orgId' }, { status: 400 })
  try {
    const { session } = await requireMembership(orgId, 'member')
    const body = (await req.json().catch(() => ({}))) as { toUserId?: number | string; message?: string }
    const toUserId = Number(body.toUserId)
    if (!Number.isInteger(toUserId)) return NextResponse.json({ error: 'Pick a teammate.' }, { status: 400 })
    const r = await createRecognition({
      orgId,
      fromUserId: session.appUserId,
      toUserId,
      message: body.message ?? '',
      source: 'web',
    })
    if (!r.ok) return NextResponse.json({ error: r.error }, { status: 400 })
    return NextResponse.json({ ok: true, id: r.id })
  } catch (e) {
    if (e instanceof HttpError) return NextResponse.json({ error: e.message }, { status: e.status })
    throw e
  }
}
