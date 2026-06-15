import { NextResponse } from 'next/server'
import { and, eq } from 'drizzle-orm'
import { db, schema } from '@/lib/db/client'
import { HttpError, requireCapability } from '@/lib/auth/guards'
import { audit, requestMeta } from '@/lib/audit/log'

export const runtime = 'nodejs'

/**
 * PATCH /api/orgs/[orgId]/reviews/[id] — close or reopen a review cycle.
 *
 * HR/admin action — gated on `view_all_data` (HR-grade; admins implicit).
 * Body: { status: 'open' | 'closed' }.
 */
export async function PATCH(
  req: Request,
  ctx: { params: Promise<{ orgId: string; id: string }> },
) {
  const { orgId: orgRaw, id: idRaw } = await ctx.params
  const orgId = Number(orgRaw)
  const id = Number(idRaw)
  if (!Number.isInteger(orgId) || !Number.isInteger(id)) {
    return NextResponse.json({ error: 'invalid ids' }, { status: 400 })
  }
  try {
    const { session } = await requireCapability(orgId, 'view_all_data')
    const body = (await req.json().catch(() => ({}))) as { status?: 'open' | 'closed' }
    if (body.status !== 'open' && body.status !== 'closed') {
      return NextResponse.json({ error: "status must be 'open' or 'closed'" }, { status: 400 })
    }

    // Scope the lookup to this org so a cross-org id can't be touched.
    const existing = await db.query.reviewCycles.findFirst({
      where: and(eq(schema.reviewCycles.id, id), eq(schema.reviewCycles.orgId, orgId)),
    })
    if (!existing) {
      return NextResponse.json({ error: 'review cycle not found' }, { status: 404 })
    }

    if (existing.status === body.status) {
      return NextResponse.json({ ok: true, cycle: serialise(existing), changed: false })
    }

    const [row] = await db
      .update(schema.reviewCycles)
      .set({ status: body.status })
      .where(and(eq(schema.reviewCycles.id, id), eq(schema.reviewCycles.orgId, orgId)))
      .returning()

    if (!row) {
      return NextResponse.json({ error: 'review cycle not found' }, { status: 404 })
    }

    void audit({
      action: 'org.settings_changed',
      orgId,
      actorUserId: session.appUserId,
      targetType: 'org',
      targetId: row.id,
      payload: {
        event: body.status === 'closed' ? 'review_cycle_closed' : 'review_cycle_reopened',
        from: existing.status,
        to: body.status,
      },
      ...requestMeta(req),
    })

    return NextResponse.json({ ok: true, cycle: serialise(row), changed: true })
  } catch (err) {
    if (err instanceof HttpError) {
      return NextResponse.json({ error: err.message }, { status: err.status })
    }
    console.error('reviews patch failed', err)
    return NextResponse.json({ error: 'internal' }, { status: 500 })
  }
}

/**
 * DELETE /api/orgs/[orgId]/reviews/[id] — delete a review cycle.
 *
 * HR/admin action — gated on `view_all_data`. Deleting only removes the cycle
 * window; narratives and meetings (the underlying review/cadence data) are
 * untouched.
 */
export async function DELETE(
  req: Request,
  ctx: { params: Promise<{ orgId: string; id: string }> },
) {
  const { orgId: orgRaw, id: idRaw } = await ctx.params
  const orgId = Number(orgRaw)
  const id = Number(idRaw)
  if (!Number.isInteger(orgId) || !Number.isInteger(id)) {
    return NextResponse.json({ error: 'invalid ids' }, { status: 400 })
  }
  try {
    const { session } = await requireCapability(orgId, 'view_all_data')

    const [row] = await db
      .delete(schema.reviewCycles)
      .where(and(eq(schema.reviewCycles.id, id), eq(schema.reviewCycles.orgId, orgId)))
      .returning()

    if (!row) {
      return NextResponse.json({ error: 'review cycle not found' }, { status: 404 })
    }

    void audit({
      action: 'org.settings_changed',
      orgId,
      actorUserId: session.appUserId,
      targetType: 'org',
      targetId: row.id,
      payload: { event: 'review_cycle_deleted', name: row.name },
      ...requestMeta(req),
    })

    return NextResponse.json({ ok: true })
  } catch (err) {
    if (err instanceof HttpError) {
      return NextResponse.json({ error: err.message }, { status: err.status })
    }
    console.error('reviews delete failed', err)
    return NextResponse.json({ error: 'internal' }, { status: 500 })
  }
}

function serialise(row: typeof schema.reviewCycles.$inferSelect) {
  return {
    id: row.id,
    name: row.name,
    periodStart: row.periodStart,
    periodEnd: row.periodEnd,
    status: row.status,
    createdByUserId: row.createdByUserId,
    createdAt: row.createdAt.toISOString(),
  }
}
