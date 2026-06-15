import { NextResponse } from 'next/server'
import { and, desc, eq } from 'drizzle-orm'
import { db, schema } from '@/lib/db/client'
import { HttpError, requireCapability, requireScope } from '@/lib/auth/guards'
import { audit, requestMeta } from '@/lib/audit/log'

export const runtime = 'nodejs'

const NAME_MAX = 120

/** Strict YYYY-MM-DD validator (also rejects impossible calendar dates). */
function isIsoDate(s: unknown): s is string {
  if (typeof s !== 'string') return false
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false
  const d = new Date(`${s}T00:00:00Z`)
  if (Number.isNaN(d.getTime())) return false
  // Round-trip guard: "2026-02-31" parses to March 3 — reject those.
  return d.toISOString().slice(0, 10) === s
}

/**
 * GET /api/orgs/[orgId]/reviews — list review cycles for the org, newest first.
 *
 * Manager+ can read (the page surfaces cadence/review status for their scope);
 * the cycle list itself isn't person-sensitive, so any in-scope manager sees it.
 */
export async function GET(_req: Request, ctx: { params: Promise<{ orgId: string }> }) {
  const { orgId: raw } = await ctx.params
  const orgId = Number(raw)
  if (!Number.isInteger(orgId)) {
    return NextResponse.json({ error: 'invalid orgId' }, { status: 400 })
  }
  try {
    // Manager+ may view. We don't need the scope set here, just the gate.
    await requireScope(orgId, 'manager')
    const rows = await db
      .select()
      .from(schema.reviewCycles)
      .where(eq(schema.reviewCycles.orgId, orgId))
      .orderBy(desc(schema.reviewCycles.createdAt))
      .limit(200)
    return NextResponse.json({ ok: true, cycles: rows.map(serialise) })
  } catch (err) {
    if (err instanceof HttpError) {
      return NextResponse.json({ error: err.message }, { status: err.status })
    }
    console.error('reviews list failed', err)
    return NextResponse.json({ error: 'internal' }, { status: 500 })
  }
}

/**
 * POST /api/orgs/[orgId]/reviews — open a new review cycle.
 *
 * HR/admin action — gated on `view_all_data` (HR-grade capability; admins hold
 * it implicitly). Validates name (1..120) + a YYYY-MM-DD start<=end window.
 */
export async function POST(req: Request, ctx: { params: Promise<{ orgId: string }> }) {
  const { orgId: raw } = await ctx.params
  const orgId = Number(raw)
  if (!Number.isInteger(orgId)) {
    return NextResponse.json({ error: 'invalid orgId' }, { status: 400 })
  }
  try {
    const { session } = await requireCapability(orgId, 'view_all_data')
    const body = (await req.json().catch(() => ({}))) as {
      name?: string
      periodStart?: string
      periodEnd?: string
    }

    const name = (body.name ?? '').toString().trim()
    if (!name) return NextResponse.json({ error: 'name is required' }, { status: 400 })
    if (name.length > NAME_MAX) {
      return NextResponse.json({ error: `name must be ${NAME_MAX} characters or fewer` }, { status: 400 })
    }
    if (!isIsoDate(body.periodStart) || !isIsoDate(body.periodEnd)) {
      return NextResponse.json({ error: 'periodStart and periodEnd must be YYYY-MM-DD dates' }, { status: 400 })
    }
    if (body.periodStart > body.periodEnd) {
      return NextResponse.json({ error: 'periodStart must be on or before periodEnd' }, { status: 400 })
    }

    const [cycle] = await db
      .insert(schema.reviewCycles)
      .values({
        orgId,
        name,
        // `date` columns accept the ISO string directly.
        periodStart: body.periodStart,
        periodEnd: body.periodEnd,
        status: 'open',
        createdByUserId: session.appUserId,
      })
      .returning()

    void audit({
      action: 'org.settings_changed',
      orgId,
      actorUserId: session.appUserId,
      targetType: 'org',
      targetId: cycle.id,
      payload: {
        event: 'review_cycle_opened',
        name: cycle.name,
        periodStart: cycle.periodStart,
        periodEnd: cycle.periodEnd,
      },
      ...requestMeta(req),
    })

    return NextResponse.json({ ok: true, cycle: serialise(cycle) })
  } catch (err) {
    if (err instanceof HttpError) {
      return NextResponse.json({ error: err.message }, { status: err.status })
    }
    console.error('reviews create failed', err)
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
