import { NextResponse } from 'next/server'
import { and, eq, isNull } from 'drizzle-orm'
import { db, schema } from '@/lib/db/client'
import { HttpError, requireMembership } from '@/lib/auth/guards'
import { audit, requestMeta } from '@/lib/audit/log'
import { afterResponse } from '@/lib/after'

export const runtime = 'nodejs'

const VALID_TYPES = new Set(['unblocked', 'workaround', 'cancelled'])

/**
 * Manager-side blocker resolver. Closes the break on the employee's behalf,
 * stamps who resolved it, with what note, and how. The employee gets an
 * in-app notification when they come back so they know who unstuck them.
 */
export async function POST(
  req: Request,
  ctx: { params: Promise<{ orgId: string; breakId: string }> },
) {
  const { orgId: rawOrg, breakId: rawBreak } = await ctx.params
  const orgId = Number(rawOrg)
  const breakId = Number(rawBreak)
  if (!Number.isInteger(orgId) || !Number.isInteger(breakId)) {
    return NextResponse.json({ error: 'invalid ids' }, { status: 400 })
  }

  try {
    const { session } = await requireMembership(orgId, 'manager')
    const body = (await req.json().catch(() => ({}))) as {
      note?: string
      resolutionType?: string
    }

    const note = (body.note ?? '').trim().slice(0, 500)
    const resolutionType = VALID_TYPES.has(body.resolutionType ?? '')
      ? (body.resolutionType as 'unblocked' | 'workaround' | 'cancelled')
      : 'unblocked'
    if (note.length === 0) {
      return NextResponse.json({ error: 'note required (max 500 chars)' }, { status: 400 })
    }

    const row = await db.query.breaks.findFirst({
      where: and(
        eq(schema.breaks.id, breakId),
        eq(schema.breaks.orgId, orgId),
        isNull(schema.breaks.endedAt),
      ),
    })
    if (!row) {
      return NextResponse.json({ error: 'blocker not found or already resolved' }, { status: 404 })
    }
    if (row.category !== 'blocked') {
      return NextResponse.json({ error: 'not a blocker' }, { status: 400 })
    }

    const now = new Date()
    const minutesBlocked = Math.max(0, Math.round((now.getTime() - row.startedAt.getTime()) / 60_000))

    // End the break + stamp resolution. If the new resolution_* columns
    // haven't been migrated yet, fall back to just ending the break.
    try {
      await db
        .update(schema.breaks)
        .set({
          endedAt: now,
          resolvedByUserId: session.appUserId,
          resolutionNote: note,
          resolutionType,
        })
        .where(eq(schema.breaks.id, breakId))
    } catch (e) {
      console.warn('blocker resolution cols missing (run db:push):', e instanceof Error ? e.message : e)
      await db
        .update(schema.breaks)
        .set({ endedAt: now })
        .where(eq(schema.breaks.id, breakId))
    }

    // Log the resolution in the thread. Best-effort; the blocker is still
    // resolved even if the audit row fails to insert.
    try {
      await db.insert(schema.blockerThread).values({
        breakId: row.id,
        authorUserId: session.appUserId,
        kind: 'resolution',
        body: `Resolved (${resolutionType}): ${note}`,
      })
    } catch (e) {
      console.warn('blocker_thread missing (run db:push):', e instanceof Error ? e.message : e)
    }

    audit({
      action: 'blocker.resolved',
      orgId,
      actorUserId: session.appUserId,
      targetType: 'break',
      targetId: row.id,
      payload: {
        resolved: true,
        resolutionType,
        minutesBlocked,
        blockedUserId: row.userId,
      },
      ...requestMeta(req),
    })

    // Notify the blocked employee — they need to know who got them moving.
    afterResponse(
      async () => {
        const resolver = await db.query.users.findFirst({
          where: eq(schema.users.id, session.appUserId),
        })
        await db.insert(schema.notifications).values({
          userId: row.userId,
          orgId,
          kind: 'blocker.resolved',
          title: `${resolver?.name ?? resolver?.login ?? 'A manager'} unblocked you`,
          body: note.length > 200 ? note.slice(0, 200) + '…' : note,
          href: null,
        })
      },
      'notify resolution',
    )

    return NextResponse.json({
      ok: true,
      resolvedAt: now.toISOString(),
      minutesBlocked,
    })
  } catch (err) {
    if (err instanceof HttpError) {
      return NextResponse.json({ error: err.message }, { status: err.status })
    }
    console.error('blocker resolve failed', err)
    return NextResponse.json({ error: 'internal' }, { status: 500 })
  }
}
