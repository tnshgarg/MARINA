import { NextResponse } from 'next/server'
import { and, eq, inArray, notInArray } from 'drizzle-orm'
import { db, schema } from '@/lib/db/client'
import { HttpError, requireCapability } from '@/lib/auth/guards'

export const runtime = 'nodejs'

/**
 * Single-team CRUD: PATCH renames / re-assigns; PUT replaces the full
 * member set; DELETE removes the team. Members are reconciled by diffing
 * the incoming set against the current rows, so the client can send the
 * full membership list and let the server figure out adds vs removes.
 */
export async function PATCH(req: Request, ctx: { params: Promise<{ orgId: string; teamId: string }> }) {
  const { orgId: rawO, teamId: rawT } = await ctx.params
  const orgId = Number(rawO)
  const teamId = Number(rawT)
  if (!Number.isInteger(orgId) || !Number.isInteger(teamId)) {
    return NextResponse.json({ error: 'invalid ids' }, { status: 400 })
  }
  try {
    await requireCapability(orgId, 'manage_members')
    const body = (await req.json().catch(() => ({}))) as {
      name?: string
      description?: string | null
      managerMembershipId?: number | null
      color?: string | null
      memberMembershipIds?: number[]
    }

    const patch: Record<string, unknown> = {}
    if (typeof body.name === 'string') patch.name = body.name.slice(0, 120)
    if (body.description !== undefined) patch.description = body.description?.slice(0, 500) ?? null
    if (body.managerMembershipId !== undefined) patch.managerMembershipId = body.managerMembershipId
    if (body.color !== undefined) patch.color = body.color
    if (Object.keys(patch).length > 0) {
      await db
        .update(schema.teams)
        .set(patch)
        .where(and(eq(schema.teams.id, teamId), eq(schema.teams.orgId, orgId)))
    }

    if (Array.isArray(body.memberMembershipIds)) {
      const wanted = Array.from(new Set(body.memberMembershipIds))
      // Drop everyone not in the new list…
      if (wanted.length > 0) {
        await db
          .delete(schema.teamMembers)
          .where(
            and(eq(schema.teamMembers.teamId, teamId), notInArray(schema.teamMembers.membershipId, wanted)),
          )
      } else {
        await db.delete(schema.teamMembers).where(eq(schema.teamMembers.teamId, teamId))
      }
      // …and add anyone new. We dedupe via the unique index.
      if (wanted.length > 0) {
        // Validate the IDs belong to the same org so a bad payload can't add
        // someone from a different workspace.
        const valid = await db
          .select({ id: schema.memberships.id })
          .from(schema.memberships)
          .where(and(eq(schema.memberships.orgId, orgId), inArray(schema.memberships.id, wanted)))
        for (const v of valid) {
          await db
            .insert(schema.teamMembers)
            .values({ teamId, membershipId: v.id })
            .onConflictDoNothing()
        }
      }
    }

    return NextResponse.json({ ok: true })
  } catch (err) {
    if (err instanceof HttpError) {
      return NextResponse.json({ error: err.message }, { status: err.status })
    }
    console.error('[teams PATCH] failed', err)
    return NextResponse.json({ error: 'internal' }, { status: 500 })
  }
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ orgId: string; teamId: string }> }) {
  const { orgId: rawO, teamId: rawT } = await ctx.params
  const orgId = Number(rawO)
  const teamId = Number(rawT)
  if (!Number.isInteger(orgId) || !Number.isInteger(teamId)) {
    return NextResponse.json({ error: 'invalid ids' }, { status: 400 })
  }
  try {
    await requireCapability(orgId, 'manage_members')
    await db
      .delete(schema.teams)
      .where(and(eq(schema.teams.id, teamId), eq(schema.teams.orgId, orgId)))
    return NextResponse.json({ ok: true })
  } catch (err) {
    if (err instanceof HttpError) {
      return NextResponse.json({ error: err.message }, { status: err.status })
    }
    return NextResponse.json({ error: 'internal' }, { status: 500 })
  }
}
