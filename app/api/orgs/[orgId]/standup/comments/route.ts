import { NextResponse } from 'next/server'
import { and, asc, eq } from 'drizzle-orm'
import { db, schema } from '@/lib/db/client'
import { HttpError, requireMembership } from '@/lib/auth/guards'

export const runtime = 'nodejs'

function dayParam(req: Request): string {
  const d = new URL(req.url).searchParams.get('day')
  if (d && /^\d{4}-\d{2}-\d{2}$/.test(d)) return d
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
}

/** GET — the standup discussion thread for a day. Any active member can read. */
export async function GET(req: Request, ctx: { params: Promise<{ orgId: string }> }) {
  const { orgId: raw } = await ctx.params
  const orgId = Number(raw)
  if (!Number.isInteger(orgId)) return NextResponse.json({ error: 'invalid orgId' }, { status: 400 })
  try {
    await requireMembership(orgId, 'member')
    const day = dayParam(req)
    const rows = await db
      .select({
        id: schema.standupComments.id,
        body: schema.standupComments.body,
        createdAt: schema.standupComments.createdAt,
        authorUserId: schema.standupComments.authorUserId,
        authorName: schema.users.name,
        authorLogin: schema.users.login,
      })
      .from(schema.standupComments)
      .innerJoin(schema.users, eq(schema.standupComments.authorUserId, schema.users.id))
      .where(and(eq(schema.standupComments.orgId, orgId), eq(schema.standupComments.day, day)))
      .orderBy(asc(schema.standupComments.createdAt))
    return NextResponse.json({
      day,
      comments: rows.map((r) => ({
        id: r.id,
        body: r.body,
        createdAt: r.createdAt.toISOString(),
        authorUserId: r.authorUserId,
        authorName: r.authorName ?? `@${r.authorLogin}`,
        authorLogin: r.authorLogin,
      })),
    })
  } catch (err) {
    if (err instanceof HttpError) return NextResponse.json({ error: err.message }, { status: err.status })
    console.error('standup comments GET failed', err)
    return NextResponse.json({ error: 'internal' }, { status: 500 })
  }
}

/** POST — add a comment to the day's thread. Any active member can post. */
export async function POST(req: Request, ctx: { params: Promise<{ orgId: string }> }) {
  const { orgId: raw } = await ctx.params
  const orgId = Number(raw)
  if (!Number.isInteger(orgId)) return NextResponse.json({ error: 'invalid orgId' }, { status: 400 })
  try {
    const { session } = await requireMembership(orgId, 'member')
    const body = (await req.json().catch(() => ({}))) as { day?: string; body?: string; teamId?: number; targetUserId?: number }
    const text = (body.body ?? '').trim().slice(0, 2000)
    if (text.length === 0) return NextResponse.json({ error: 'empty' }, { status: 400 })
    const day = body.day && /^\d{4}-\d{2}-\d{2}$/.test(body.day) ? body.day : dayParam(req)

    const [row] = await db
      .insert(schema.standupComments)
      .values({
        orgId,
        day,
        teamId: typeof body.teamId === 'number' ? body.teamId : null,
        authorUserId: session.appUserId,
        targetUserId: typeof body.targetUserId === 'number' ? body.targetUserId : null,
        body: text,
      })
      .returning()
    return NextResponse.json({ ok: true, id: row.id })
  } catch (err) {
    if (err instanceof HttpError) return NextResponse.json({ error: err.message }, { status: err.status })
    console.error('standup comments POST failed', err)
    return NextResponse.json({ error: 'internal' }, { status: 500 })
  }
}
