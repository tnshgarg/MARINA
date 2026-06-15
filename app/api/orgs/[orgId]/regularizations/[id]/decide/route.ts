import { NextResponse } from 'next/server'
import { and, eq } from 'drizzle-orm'
import { db, schema } from '@/lib/db/client'
import { HttpError, ensureScopeUser, requireScope } from '@/lib/auth/guards'
import { audit, requestMeta } from '@/lib/audit/log'
import { inbox } from '@/lib/notify/inbox'

export const runtime = 'nodejs'

const NOTE_MAX = 500

const KIND_LABELS: Record<'present' | 'leave' | 'wfh' | 'holiday', string> = {
  present: 'Present',
  leave: 'On leave',
  wfh: 'Work from home',
  holiday: 'Holiday',
}

/** POST: approve or deny a regularization request. Re-deciding is allowed. */
export async function POST(
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
    const { session, scope } = await requireScope(orgId, 'manager')
    const body = (await req.json().catch(() => ({}))) as {
      decision?: 'approve' | 'deny'
      note?: string
    }
    if (body.decision !== 'approve' && body.decision !== 'deny') {
      return NextResponse.json({ error: 'decision must be approve|deny' }, { status: 400 })
    }
    const note = (body.note ?? '').toString().trim().slice(0, NOTE_MAX)

    // Load the row scoped to this org so we never act on another tenant's data.
    const existing = await db.query.attendanceRegularizations.findFirst({
      where: and(
        eq(schema.attendanceRegularizations.id, id),
        eq(schema.attendanceRegularizations.orgId, orgId),
      ),
    })
    if (!existing) {
      return NextResponse.json({ error: 'request not found' }, { status: 404 })
    }

    // RBAC: only decide for people in your visible scope (404, don't leak).
    ensureScopeUser(scope, existing.userId)

    // Conflict of interest: you can't decide your own regularization.
    if (existing.userId === session.appUserId) {
      return NextResponse.json(
        { error: "You can't decide your own regularization request." },
        { status: 403 },
      )
    }

    const newStatus = body.decision === 'approve' ? 'approved' : 'denied'

    const [row] = await db
      .update(schema.attendanceRegularizations)
      .set({
        status: newStatus,
        decidedByUserId: session.appUserId,
        decidedAt: new Date(),
        decidedNote: note || null,
      })
      .where(
        and(
          eq(schema.attendanceRegularizations.id, id),
          eq(schema.attendanceRegularizations.orgId, orgId),
        ),
      )
      .returning()

    if (!row) {
      return NextResponse.json({ error: 'request not found' }, { status: 404 })
    }

    void audit({
      action: 'org.settings_changed',
      orgId,
      actorUserId: session.appUserId,
      targetType: 'user',
      targetId: row.id,
      payload: {
        kind: 'regularization.decided',
        from: existing.status,
        to: newStatus,
        day: row.day,
        requestedKind: row.requestedKind,
        note: note || null,
      },
      ...requestMeta(req),
    })

    // Tell the employee their request was decided (in-app inbox bell).
    const verb = newStatus === 'approved' ? 'approved' : 'denied'
    inbox({
      userId: row.userId,
      orgId,
      kind: 'regularization.decided',
      title: `Your attendance regularization was ${verb}`,
      body: `${row.day} · ${KIND_LABELS[row.requestedKind]}${note ? ` · ${note}` : ''}`,
      href: `/me/regularizations`,
    })

    return NextResponse.json({ ok: true, regularization: serialise(row), changed: true })
  } catch (err) {
    if (err instanceof HttpError) {
      return NextResponse.json({ error: err.message }, { status: err.status })
    }
    console.error('regularization decide failed', err)
    return NextResponse.json({ error: 'internal' }, { status: 500 })
  }
}

function serialise(row: typeof schema.attendanceRegularizations.$inferSelect) {
  return {
    id: row.id,
    status: row.status,
    decidedByUserId: row.decidedByUserId,
    decidedAt: row.decidedAt?.toISOString() ?? null,
    decidedNote: row.decidedNote,
  }
}
