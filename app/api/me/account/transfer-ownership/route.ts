import { NextResponse } from 'next/server'
import { and, eq, isNull, ne } from 'drizzle-orm'
import { db, schema } from '@/lib/db/client'
import { HttpError, requireSession } from '@/lib/auth/guards'
import { audit, requestMeta } from '@/lib/audit/log'

export const runtime = 'nodejs'

/**
 * Ownership transfer. The org owner can hand the workspace to another member
 * before deleting their account (or just to step back). We set `orgs.ownerId`
 * to the new owner and promote them to `admin`. The previous owner stays an
 * admin (they can then leave / delete their account, since they're no longer
 * the sole owner).
 */

// GET → the org this user owns + the members they could transfer it to.
export async function GET() {
  const session = await requireSession()
  const org = await db.query.orgs.findFirst({ where: eq(schema.orgs.ownerId, session.appUserId) })
  if (!org) return NextResponse.json({ org: null, candidates: [] })

  const rows = await db
    .select({ m: schema.memberships, u: schema.users })
    .from(schema.memberships)
    .innerJoin(schema.users, eq(schema.memberships.userId, schema.users.id))
    .where(
      and(
        eq(schema.memberships.orgId, org.id),
        isNull(schema.memberships.endedAt),
        ne(schema.memberships.userId, session.appUserId),
      ),
    )

  return NextResponse.json({
    org: { id: org.id, name: org.name },
    candidates: rows.map((r) => ({
      membershipId: r.m.id,
      userId: r.u.id,
      name: r.u.name,
      login: r.u.login,
      role: r.m.role,
    })),
  })
}

export async function POST(req: Request) {
  try {
    const session = await requireSession()
    const { orgId, toMembershipId } = (await req.json().catch(() => ({}))) as {
      orgId?: number
      toMembershipId?: number
    }
    if (!Number.isInteger(orgId) || !Number.isInteger(toMembershipId)) {
      return NextResponse.json({ error: 'orgId and toMembershipId required' }, { status: 400 })
    }

    const org = await db.query.orgs.findFirst({ where: eq(schema.orgs.id, orgId!) })
    if (!org) return NextResponse.json({ error: 'workspace not found' }, { status: 404 })
    if (org.ownerId !== session.appUserId) {
      return NextResponse.json({ error: 'Only the current owner can transfer ownership.' }, { status: 403 })
    }

    const target = await db.query.memberships.findFirst({
      where: and(
        eq(schema.memberships.id, toMembershipId!),
        eq(schema.memberships.orgId, orgId!),
        isNull(schema.memberships.endedAt),
      ),
    })
    if (!target) return NextResponse.json({ error: 'That member is not in this workspace.' }, { status: 404 })
    if (target.userId === session.appUserId) {
      return NextResponse.json({ error: "You can't transfer ownership to yourself." }, { status: 400 })
    }

    // Hand over: new owner + promote them to admin.
    await db.update(schema.orgs).set({ ownerId: target.userId }).where(eq(schema.orgs.id, orgId!))
    await db.update(schema.memberships).set({ role: 'admin' }).where(eq(schema.memberships.id, target.id))

    void audit({
      action: 'org.ownership_transferred',
      orgId: orgId!,
      actorUserId: session.appUserId,
      targetType: 'user',
      targetId: target.userId,
      ...requestMeta(req),
    })

    return NextResponse.json({ ok: true })
  } catch (err) {
    if (err instanceof HttpError) {
      return NextResponse.json({ error: err.message }, { status: err.status })
    }
    console.error('transfer ownership failed', err)
    return NextResponse.json({ error: 'internal' }, { status: 500 })
  }
}
