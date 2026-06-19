import { NextResponse } from 'next/server'
import { desc, eq } from 'drizzle-orm'
import { db, schema } from '@/lib/db/client'
import { HttpError, requireMembership } from '@/lib/auth/guards'
import { createOrgAnnouncement } from '@/lib/announcements/create'

export const runtime = 'nodejs'

/** List org announcements. Any active member can read. */
export async function GET(_req: Request, ctx: { params: Promise<{ orgId: string }> }) {
  const orgId = Number((await ctx.params).orgId)
  if (!Number.isInteger(orgId)) return NextResponse.json({ error: 'invalid orgId' }, { status: 400 })
  try {
    await requireMembership(orgId, 'member')
    const rows = await db
      .select({
        id: schema.orgAnnouncements.id,
        title: schema.orgAnnouncements.title,
        body: schema.orgAnnouncements.body,
        createdAt: schema.orgAnnouncements.createdAt,
        authorName: schema.users.name,
        authorLogin: schema.users.login,
      })
      .from(schema.orgAnnouncements)
      .innerJoin(schema.users, eq(schema.orgAnnouncements.authorUserId, schema.users.id))
      .where(eq(schema.orgAnnouncements.orgId, orgId))
      .orderBy(desc(schema.orgAnnouncements.createdAt))
      .limit(50)
    return NextResponse.json({ announcements: rows })
  } catch (e) {
    if (e instanceof HttpError) return NextResponse.json({ error: e.message }, { status: e.status })
    throw e
  }
}

/** Post an announcement. Managers + admins only. */
export async function POST(req: Request, ctx: { params: Promise<{ orgId: string }> }) {
  const orgId = Number((await ctx.params).orgId)
  if (!Number.isInteger(orgId)) return NextResponse.json({ error: 'invalid orgId' }, { status: 400 })
  try {
    const { session } = await requireMembership(orgId, 'manager')
    const body = (await req.json().catch(() => ({}))) as { title?: string; body?: string }
    const r = await createOrgAnnouncement({
      orgId,
      authorUserId: session.appUserId,
      title: body.title ?? null,
      body: body.body ?? '',
      source: 'web',
    })
    if (!r.ok) return NextResponse.json({ error: r.error }, { status: 400 })
    return NextResponse.json({ ok: true, id: r.id })
  } catch (e) {
    if (e instanceof HttpError) return NextResponse.json({ error: e.message }, { status: e.status })
    throw e
  }
}
