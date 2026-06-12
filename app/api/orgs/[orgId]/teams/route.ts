import { NextResponse } from 'next/server'
import { and, asc, eq, inArray } from 'drizzle-orm'
import { db, schema } from '@/lib/db/client'
import { HttpError, requireCapability, requireMembership } from '@/lib/auth/guards'
import { audit, requestMeta } from '@/lib/audit/log'

export const runtime = 'nodejs'

/** GET /api/orgs/[orgId]/teams — list every team in the org with members. */
export async function GET(_req: Request, ctx: { params: Promise<{ orgId: string }> }) {
  const { orgId: raw } = await ctx.params
  const orgId = Number(raw)
  if (!Number.isInteger(orgId)) {
    return NextResponse.json({ error: 'invalid orgId' }, { status: 400 })
  }
  try {
    await requireMembership(orgId, 'member')
    const teams = await db
      .select()
      .from(schema.teams)
      .where(eq(schema.teams.orgId, orgId))
      .orderBy(asc(schema.teams.name))
    const teamIds = teams.map((t) => t.id)
    const members = teamIds.length
      ? await db
          .select({
            tm: schema.teamMembers,
            m: schema.memberships,
            u: schema.users,
          })
          .from(schema.teamMembers)
          .innerJoin(schema.memberships, eq(schema.teamMembers.membershipId, schema.memberships.id))
          .innerJoin(schema.users, eq(schema.memberships.userId, schema.users.id))
          .where(inArray(schema.teamMembers.teamId, teamIds))
      : []
    return NextResponse.json({
      teams: teams.map((t) => ({
        id: t.id,
        name: t.name,
        description: t.description,
        managerMembershipId: t.managerMembershipId,
        color: t.color,
        members: members
          .filter((row) => row.tm.teamId === t.id)
          .map((row) => ({
            membershipId: row.m.id,
            userId: row.u.id,
            login: row.u.login,
            name: row.u.name,
            characterKey: row.u.characterKey,
            avatarUrl: row.u.avatarUrl,
            role: row.m.role,
            discipline: row.m.discipline,
            jobTitle: row.m.jobTitle,
          })),
      })),
    })
  } catch (err) {
    if (err instanceof HttpError) {
      return NextResponse.json({ error: err.message }, { status: err.status })
    }
    return NextResponse.json({ error: 'internal' }, { status: 500 })
  }
}

/** POST /api/orgs/[orgId]/teams — create a team. Gated on manage_members. */
export async function POST(req: Request, ctx: { params: Promise<{ orgId: string }> }) {
  const { orgId: raw } = await ctx.params
  const orgId = Number(raw)
  if (!Number.isInteger(orgId)) {
    return NextResponse.json({ error: 'invalid orgId' }, { status: 400 })
  }
  try {
    const { session } = await requireCapability(orgId, 'manage_members')
    const body = (await req.json().catch(() => ({}))) as {
      name?: string
      description?: string
      managerMembershipId?: number | null
      color?: string
      memberMembershipIds?: number[]
    }
    const name = (body.name ?? '').trim()
    if (!name) return NextResponse.json({ error: 'name required' }, { status: 400 })

    const [team] = await db
      .insert(schema.teams)
      .values({
        orgId,
        name: name.slice(0, 120),
        description: body.description?.slice(0, 500) ?? null,
        managerMembershipId: body.managerMembershipId ?? null,
        color: body.color ?? null,
      })
      .returning()

    // Initial members. We dedupe and ignore any that don't belong to this org.
    const ids = Array.from(new Set(body.memberMembershipIds ?? []))
    if (ids.length > 0) {
      const valid = await db
        .select({ id: schema.memberships.id })
        .from(schema.memberships)
        .where(and(eq(schema.memberships.orgId, orgId), inArray(schema.memberships.id, ids)))
      const validIds = valid.map((r) => r.id)
      if (validIds.length > 0) {
        await db
          .insert(schema.teamMembers)
          .values(validIds.map((id) => ({ teamId: team.id, membershipId: id })))
      }
    }

    audit({
      action: 'org.settings_changed',
      orgId,
      actorUserId: session.appUserId,
      targetType: 'team',
      targetId: team.id,
      payload: { event: 'team_created', name: team.name },
      ...requestMeta(req),
    })

    return NextResponse.json({ ok: true, team })
  } catch (err) {
    if (err instanceof HttpError) {
      return NextResponse.json({ error: err.message }, { status: err.status })
    }
    console.error('[teams POST] failed', err)
    return NextResponse.json({ error: 'internal' }, { status: 500 })
  }
}
