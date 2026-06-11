import { NextResponse } from 'next/server'
import { and, eq, isNull } from 'drizzle-orm'
import { db, schema } from '@/lib/db/client'
import { HttpError, requireMembership } from '@/lib/auth/guards'
import { audit, requestMeta } from '@/lib/audit/log'

export const runtime = 'nodejs'

const VALID_DISCIPLINES = new Set([
  'engineering', 'design', 'product', 'sales', 'support',
  'marketing', 'ops', 'hr', 'finance', 'exec', 'other',
])

const VALID_CAPS = new Set([
  'manage_billing', 'manage_members', 'manage_integrations', 'manage_workspace',
  'view_all_data', 'view_reports_only', 'decide_leaves', 'schedule_meetings',
  'manage_celebrations', 'export_data',
])

/**
 * Update a membership's discipline (engineering/design/sales/…) and/or
 * free-text job title. Managers and owners can edit anyone (including
 * themselves); plain members get 403.
 *
 * The discipline drives the role-aware UI — designers see Figma-shaped
 * tiles, sales sees deal-shaped tiles, etc.
 */
export async function PATCH(
  req: Request,
  ctx: { params: Promise<{ orgId: string; membershipId: string }> },
) {
  const { orgId: orgIdRaw, membershipId: midRaw } = await ctx.params
  const orgId = Number(orgIdRaw)
  const membershipId = Number(midRaw)
  if (!Number.isInteger(orgId) || !Number.isInteger(membershipId)) {
    return NextResponse.json({ error: 'invalid ids' }, { status: 400 })
  }
  let body: {
    discipline?: string
    jobTitle?: string | null
    extraCaps?: string[]
    reportsToMembershipId?: number | null
    workingDays?: boolean[]
    birthdayMmDd?: string | null
    joinedOn?: string | null
  }
  try {
    body = (await req.json()) ?? {}
  } catch {
    return NextResponse.json({ error: 'invalid json' }, { status: 400 })
  }

  try {
    const { session } = await requireMembership(orgId, 'manager')

    const target = await db.query.memberships.findFirst({
      where: and(
        eq(schema.memberships.id, membershipId),
        eq(schema.memberships.orgId, orgId),
        isNull(schema.memberships.endedAt),
      ),
    })
    if (!target) return NextResponse.json({ error: 'membership not found' }, { status: 404 })

    const patch: Record<string, unknown> = {}
    if (body.discipline !== undefined) {
      if (typeof body.discipline !== 'string' || !VALID_DISCIPLINES.has(body.discipline)) {
        return NextResponse.json({ error: 'invalid discipline' }, { status: 400 })
      }
      patch.discipline = body.discipline
    }
    if (body.jobTitle !== undefined) {
      if (body.jobTitle !== null && typeof body.jobTitle !== 'string') {
        return NextResponse.json({ error: 'invalid jobTitle' }, { status: 400 })
      }
      const trimmed = typeof body.jobTitle === 'string' ? body.jobTitle.trim().slice(0, 80) : null
      patch.jobTitle = trimmed && trimmed.length > 0 ? trimmed : null
    }
    if (body.extraCaps !== undefined) {
      // Only the org owner can grant or revoke capabilities — promoting one
      // manager to "see everyone's data" is the kind of thing that should
      // never be a peer-to-peer decision.
      const { membership: actor } = await requireMembership(orgId, 'manager')
      if (actor.role !== 'owner') {
        return NextResponse.json({ error: 'only the owner can edit capabilities' }, { status: 403 })
      }
      if (!Array.isArray(body.extraCaps)) {
        return NextResponse.json({ error: 'invalid extraCaps' }, { status: 400 })
      }
      const cleaned: string[] = []
      const seen = new Set<string>()
      for (const cap of body.extraCaps) {
        if (typeof cap !== 'string') continue
        if (!VALID_CAPS.has(cap)) continue
        if (seen.has(cap)) continue
        seen.add(cap)
        cleaned.push(cap)
      }
      patch.extraCaps = cleaned
    }
    if (body.reportsToMembershipId !== undefined) {
      if (body.reportsToMembershipId !== null && typeof body.reportsToMembershipId !== 'number') {
        return NextResponse.json({ error: 'invalid reportsToMembershipId' }, { status: 400 })
      }
      patch.reportsToMembershipId = body.reportsToMembershipId
    }
    if (body.workingDays !== undefined) {
      if (!Array.isArray(body.workingDays) || body.workingDays.length !== 7) {
        return NextResponse.json({ error: 'workingDays must be length-7 array of booleans' }, { status: 400 })
      }
      patch.workingDays = body.workingDays.map((b) => !!b)
    }
    if (body.birthdayMmDd !== undefined) {
      if (body.birthdayMmDd === null || body.birthdayMmDd === '') {
        // Stored on the user, not the membership — handled separately below.
      } else if (typeof body.birthdayMmDd !== 'string' || !/^\d{2}-\d{2}$/.test(body.birthdayMmDd)) {
        return NextResponse.json({ error: 'birthdayMmDd must be MM-DD' }, { status: 400 })
      }
    }
    if (body.joinedOn !== undefined) {
      if (body.joinedOn !== null && (typeof body.joinedOn !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(body.joinedOn))) {
        return NextResponse.json({ error: 'joinedOn must be YYYY-MM-DD' }, { status: 400 })
      }
    }
    if (Object.keys(patch).length === 0 && body.birthdayMmDd === undefined && body.joinedOn === undefined) {
      return NextResponse.json({ error: 'nothing to update' }, { status: 400 })
    }

    if (Object.keys(patch).length > 0) {
      await db
        .update(schema.memberships)
        .set(patch)
        .where(eq(schema.memberships.id, membershipId))
    }

    // birthdayMmDd + joinedOn live on the user row (people data is intrinsic
    // to the person, not the org-specific membership).
    const userPatch: Record<string, unknown> = {}
    if (body.birthdayMmDd !== undefined) {
      userPatch.birthdayMmDd =
        typeof body.birthdayMmDd === 'string' && /^\d{2}-\d{2}$/.test(body.birthdayMmDd)
          ? body.birthdayMmDd
          : null
    }
    if (body.joinedOn !== undefined) {
      userPatch.joinedOn =
        typeof body.joinedOn === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(body.joinedOn)
          ? body.joinedOn
          : null
    }
    if (Object.keys(userPatch).length > 0) {
      await db.update(schema.users).set(userPatch).where(eq(schema.users.id, target.userId))
    }

    audit({
      action: 'member.updated',
      orgId,
      actorUserId: session.appUserId,
      targetType: 'membership',
      targetId: membershipId,
      payload: patch,
      ...requestMeta(req),
    })

    return NextResponse.json({ ok: true })
  } catch (err) {
    if (err instanceof HttpError) {
      return NextResponse.json({ error: err.message }, { status: err.status })
    }
    console.error('update member failed', err)
    return NextResponse.json({ error: 'internal' }, { status: 500 })
  }
}

/**
 * Remove a member from the org. Soft-delete via `endedAt` rather than
 * dropping the row, so the tenant-scoping windows still resolve and
 * managers can still see historical events from while the user was a
 * member.
 *
 * A subsequent re-invite creates a new membership row with a fresh window.
 */
export async function DELETE(
  req: Request,
  ctx: { params: Promise<{ orgId: string; membershipId: string }> },
) {
  const { orgId: orgIdRaw, membershipId: midRaw } = await ctx.params
  const orgId = Number(orgIdRaw)
  const membershipId = Number(midRaw)
  if (!Number.isInteger(orgId) || !Number.isInteger(membershipId)) {
    return NextResponse.json({ error: 'invalid ids' }, { status: 400 })
  }

  try {
    const { session, membership: actor } = await requireMembership(orgId, 'owner')

    const target = await db.query.memberships.findFirst({
      where: and(
        eq(schema.memberships.id, membershipId),
        eq(schema.memberships.orgId, orgId),
        isNull(schema.memberships.endedAt),
      ),
    })
    if (!target) return NextResponse.json({ error: 'membership not found' }, { status: 404 })
    if (target.role === 'owner') {
      return NextResponse.json({ error: "can't remove the owner" }, { status: 409 })
    }
    if (target.id === actor.id) {
      return NextResponse.json({ error: "can't remove yourself" }, { status: 409 })
    }

    await db
      .update(schema.memberships)
      .set({ endedAt: new Date() })
      .where(eq(schema.memberships.id, membershipId))

    audit({
      action: 'member.removed',
      orgId,
      actorUserId: session.appUserId,
      targetType: 'membership',
      targetId: membershipId,
      payload: { userId: target.userId, role: target.role },
      ...requestMeta(req),
    })

    return NextResponse.json({ ok: true })
  } catch (err) {
    if (err instanceof HttpError) {
      return NextResponse.json({ error: err.message }, { status: err.status })
    }
    console.error('remove member failed', err)
    return NextResponse.json({ error: 'internal' }, { status: 500 })
  }
}
