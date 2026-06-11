import { NextResponse } from 'next/server'
import { and, eq } from 'drizzle-orm'
import { db, schema } from '@/lib/db/client'
import { HttpError, requireMembership } from '@/lib/auth/guards'
import { syncUserActivity } from '@/lib/github/sync'

export const runtime = 'nodejs'

export async function POST(
  _req: Request,
  ctx: { params: Promise<{ orgId: string; membershipId: string }> }
) {
  const { orgId: orgIdRaw, membershipId: midRaw } = await ctx.params
  const orgId = Number(orgIdRaw)
  const membershipId = Number(midRaw)
  if (!Number.isInteger(orgId) || !Number.isInteger(membershipId)) {
    return NextResponse.json({ error: 'invalid ids' }, { status: 400 })
  }

  try {
    await requireMembership(orgId, 'manager')

    const target = await db.query.memberships.findFirst({
      where: and(
        eq(schema.memberships.id, membershipId),
        eq(schema.memberships.orgId, orgId)
      ),
    })
    if (!target) return NextResponse.json({ error: 'membership not found' }, { status: 404 })

    const user = await db.query.users.findFirst({ where: eq(schema.users.id, target.userId) })
    if (!user?.accessToken) {
      return NextResponse.json(
        { error: "member hasn't connected GitHub yet" },
        { status: 409 }
      )
    }

    const org = await db.query.orgs.findFirst({ where: eq(schema.orgs.id, orgId) })
    const trackedOrgs = (org as { trackedGithubOrgs?: string[] } | undefined)?.trackedGithubOrgs ?? []
    const result = await syncUserActivity(user.id, user.login, user.accessToken, 7, trackedOrgs)
    return NextResponse.json({ ok: true, ...result })
  } catch (err) {
    if (err instanceof HttpError) {
      return NextResponse.json({ error: err.message }, { status: err.status })
    }
    console.error('member sync failed', err)
    return NextResponse.json({ error: 'internal', message: String(err) }, { status: 500 })
  }
}
