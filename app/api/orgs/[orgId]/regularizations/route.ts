import { NextResponse } from 'next/server'
import { and, desc, eq, inArray } from 'drizzle-orm'
import { db, schema } from '@/lib/db/client'
import { HttpError, requireScope } from '@/lib/auth/guards'

export const runtime = 'nodejs'

/**
 * GET: the regularization review queue for a manager — pending requests plus
 * recently decided ones, constrained to the people the viewer actually manages
 * (admins see the whole org via scope.isAdminScope).
 */
export async function GET(
  _req: Request,
  ctx: { params: Promise<{ orgId: string }> },
) {
  const { orgId: raw } = await ctx.params
  const orgId = Number(raw)
  if (!Number.isInteger(orgId)) {
    return NextResponse.json({ error: 'invalid orgId' }, { status: 400 })
  }

  try {
    const { scope } = await requireScope(orgId, 'manager')

    // Non-admins only see requests filed by people in their visible scope.
    const scopeWhere = scope.isAdminScope
      ? eq(schema.attendanceRegularizations.orgId, orgId)
      : and(
          eq(schema.attendanceRegularizations.orgId, orgId),
          inArray(schema.attendanceRegularizations.userId, Array.from(scope.userIds)),
        )

    const rows = await db
      .select({ r: schema.attendanceRegularizations, u: schema.users })
      .from(schema.attendanceRegularizations)
      .innerJoin(schema.users, eq(schema.attendanceRegularizations.userId, schema.users.id))
      .where(scopeWhere)
      .orderBy(desc(schema.attendanceRegularizations.createdAt))
      .limit(200)

    return NextResponse.json({
      ok: true,
      regularizations: rows.map((row) => serialise(row.r, row.u)),
    })
  } catch (err) {
    if (err instanceof HttpError) {
      return NextResponse.json({ error: err.message }, { status: err.status })
    }
    console.error('org regularizations route failed', err)
    return NextResponse.json({ error: 'internal' }, { status: 500 })
  }
}

function serialise(
  r: typeof schema.attendanceRegularizations.$inferSelect,
  u: typeof schema.users.$inferSelect,
) {
  return {
    id: r.id,
    day: r.day,
    requestedKind: r.requestedKind,
    note: r.note,
    status: r.status,
    decidedByUserId: r.decidedByUserId,
    decidedAt: r.decidedAt?.toISOString() ?? null,
    decidedNote: r.decidedNote,
    createdAt: r.createdAt.toISOString(),
    user: {
      id: u.id,
      login: u.login,
      name: u.name,
      characterKey: u.characterKey,
    },
  }
}
