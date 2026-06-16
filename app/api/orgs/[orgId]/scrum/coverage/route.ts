import { NextResponse } from 'next/server'
import { and, eq } from 'drizzle-orm'
import { db, schema } from '@/lib/db/client'
import { HttpError, requireMembership } from '@/lib/auth/guards'
import { getVisibleScope } from '@/lib/auth/scope'

export const runtime = 'nodejs'

/**
 * Scrum coverage state for today (or a specific ?day=YYYY-MM-DD).
 *
 * GET    → { day, coveredUserIds: number[] }
 * POST   → toggle one userId: { userId, covered: true|false }
 * DELETE → wipe today's coverage for this org
 */
export async function GET(req: Request, ctx: { params: Promise<{ orgId: string }> }) {
  const { orgId: raw } = await ctx.params
  const orgId = Number(raw)
  if (!Number.isInteger(orgId)) {
    return NextResponse.json({ error: 'invalid orgId' }, { status: 400 })
  }
  try {
    await requireMembership(orgId, 'manager')
    const url = new URL(req.url)
    const day = isoDay(parseDay(url.searchParams.get('day')))

    const rows = await db
      .select({ coveredUserId: schema.scrumCoverage.coveredUserId })
      .from(schema.scrumCoverage)
      .where(
        and(
          eq(schema.scrumCoverage.orgId, orgId),
          eq(schema.scrumCoverage.day, day),
        ),
      )

    return NextResponse.json({ day, coveredUserIds: rows.map((r) => r.coveredUserId) })
  } catch (err) {
    return errorResponse(err)
  }
}

export async function POST(req: Request, ctx: { params: Promise<{ orgId: string }> }) {
  const { orgId: raw } = await ctx.params
  const orgId = Number(raw)
  if (!Number.isInteger(orgId)) {
    return NextResponse.json({ error: 'invalid orgId' }, { status: 400 })
  }
  try {
    const { session, membership } = await requireMembership(orgId, 'manager')
    const body = (await req.json().catch(() => ({}))) as {
      userId?: number
      covered?: boolean
      day?: string
    }
    if (typeof body.userId !== 'number') {
      return NextResponse.json({ error: 'userId required' }, { status: 400 })
    }
    const day = isoDay(parseDay(body.day ?? null))

    // Validate the target is a member of this org.
    const peer = await db.query.memberships.findFirst({
      where: and(
        eq(schema.memberships.orgId, orgId),
        eq(schema.memberships.userId, body.userId),
      ),
    })
    if (!peer) {
      return NextResponse.json({ error: 'not a member of this org' }, { status: 400 })
    }
    // RBAC: a manager can only toggle coverage for people in their scope.
    const scope = await getVisibleScope(orgId, {
      userId: session.appUserId,
      membershipId: membership.id,
      role: membership.role as 'admin' | 'manager' | 'lead' | 'member',
    })
    if (!scope.isAdminScope && !scope.userIds.has(body.userId)) {
      return NextResponse.json({ error: 'not in your scope' }, { status: 403 })
    }

    if (body.covered === false) {
      await db
        .delete(schema.scrumCoverage)
        .where(
          and(
            eq(schema.scrumCoverage.orgId, orgId),
            eq(schema.scrumCoverage.day, day),
            eq(schema.scrumCoverage.coveredUserId, body.userId),
          ),
        )
    } else {
      // Idempotent upsert via on-conflict-do-nothing on the unique index.
      await db
        .insert(schema.scrumCoverage)
        .values({
          orgId,
          day,
          coveredUserId: body.userId,
          coveredByUserId: session.appUserId,
        })
        .onConflictDoNothing({
          target: [
            schema.scrumCoverage.orgId,
            schema.scrumCoverage.day,
            schema.scrumCoverage.coveredUserId,
          ],
        })
    }

    return NextResponse.json({ ok: true })
  } catch (err) {
    return errorResponse(err)
  }
}

export async function DELETE(req: Request, ctx: { params: Promise<{ orgId: string }> }) {
  const { orgId: raw } = await ctx.params
  const orgId = Number(raw)
  if (!Number.isInteger(orgId)) {
    return NextResponse.json({ error: 'invalid orgId' }, { status: 400 })
  }
  try {
    await requireMembership(orgId, 'manager')
    const url = new URL(req.url)
    const day = isoDay(parseDay(url.searchParams.get('day')))
    await db
      .delete(schema.scrumCoverage)
      .where(
        and(
          eq(schema.scrumCoverage.orgId, orgId),
          eq(schema.scrumCoverage.day, day),
        ),
      )
    return NextResponse.json({ ok: true, day })
  } catch (err) {
    return errorResponse(err)
  }
}

function parseDay(raw: string | null): Date {
  if (!raw) return new Date()
  const m = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!m) return new Date()
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
  return Number.isNaN(d.getTime()) ? new Date() : d
}
function isoDay(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
function errorResponse(err: unknown) {
  if (err instanceof HttpError) {
    return NextResponse.json({ error: err.message }, { status: err.status })
  }
  console.error('scrum/coverage failed', err)
  return NextResponse.json({ error: 'internal' }, { status: 500 })
}
