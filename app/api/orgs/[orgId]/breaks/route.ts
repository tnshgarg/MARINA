import { NextResponse } from 'next/server'
import { and, desc, eq, gte, inArray, isNull, or } from 'drizzle-orm'
import { db, schema } from '@/lib/db/client'
import { HttpError, requireScope } from '@/lib/auth/guards'

export const runtime = 'nodejs'

/** Manager+: ongoing breaks + recent breaks (last 24h), joined with user.
 *  Scoped to the viewer's reports (admins see the whole org). */
export async function GET(_req: Request, ctx: { params: Promise<{ orgId: string }> }) {
  const { orgId: raw } = await ctx.params
  const orgId = Number(raw)
  if (!Number.isInteger(orgId)) {
    return NextResponse.json({ error: 'invalid orgId' }, { status: 400 })
  }
  try {
    const { scope } = await requireScope(orgId, 'manager')
    const userIds = Array.from(scope.userIds)
    if (userIds.length === 0) {
      return NextResponse.json({ ok: true, breaks: [] })
    }

    const since = new Date(Date.now() - 24 * 60 * 60 * 1000)
    const rows = await db
      .select({ b: schema.breaks, u: schema.users })
      .from(schema.breaks)
      .innerJoin(schema.users, eq(schema.breaks.userId, schema.users.id))
      .where(
        and(
          inArray(schema.breaks.userId, userIds),
          or(isNull(schema.breaks.endedAt), gte(schema.breaks.startedAt, since))!
        )
      )
      .orderBy(desc(schema.breaks.startedAt))
      .limit(100)

    return NextResponse.json({
      ok: true,
      breaks: rows.map((r) => ({
        id: r.b.id,
        userId: r.b.userId,
        login: r.u.login,
        name: r.u.name,
        characterKey: r.u.characterKey,
        startedAt: r.b.startedAt.toISOString(),
        endedAt: r.b.endedAt?.toISOString() ?? null,
        reason: r.b.reason,
      })),
    })
  } catch (err) {
    if (err instanceof HttpError) {
      return NextResponse.json({ error: err.message }, { status: err.status })
    }
    console.error('org breaks list failed', err)
    return NextResponse.json({ error: 'internal' }, { status: 500 })
  }
}
