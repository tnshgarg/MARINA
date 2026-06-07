import { NextResponse } from 'next/server'
import { desc, eq } from 'drizzle-orm'
import { db, schema } from '@/lib/db/client'
import { HttpError, requireMembership } from '@/lib/auth/guards'

export const runtime = 'nodejs'

/** Manager+: list leaves for the org, joined with the requesting user. */
export async function GET(_req: Request, ctx: { params: Promise<{ orgId: string }> }) {
  const { orgId: raw } = await ctx.params
  const orgId = Number(raw)
  if (!Number.isInteger(orgId)) {
    return NextResponse.json({ error: 'invalid orgId' }, { status: 400 })
  }
  try {
    await requireMembership(orgId, 'manager')
    const rows = await db
      .select({
        l: schema.leaveRequests,
        u: schema.users,
      })
      .from(schema.leaveRequests)
      .innerJoin(schema.users, eq(schema.leaveRequests.userId, schema.users.id))
      .where(eq(schema.leaveRequests.orgId, orgId))
      .orderBy(desc(schema.leaveRequests.createdAt))
      .limit(200)

    return NextResponse.json({
      ok: true,
      leaves: rows.map((r) => ({
        id: r.l.id,
        userId: r.l.userId,
        login: r.u.login,
        name: r.u.name,
        avatarUrl: r.u.avatarUrl,
        characterKey: r.u.characterKey,
        startDate: r.l.startDate,
        endDate: r.l.endDate,
        reason: r.l.reason,
        status: r.l.status,
        decidedAt: r.l.decidedAt?.toISOString() ?? null,
        decidedNote: r.l.decidedNote,
        createdAt: r.l.createdAt.toISOString(),
      })),
    })
  } catch (err) {
    if (err instanceof HttpError) {
      return NextResponse.json({ error: err.message }, { status: err.status })
    }
    console.error('org leaves list failed', err)
    return NextResponse.json({ error: 'internal' }, { status: 500 })
  }
}
