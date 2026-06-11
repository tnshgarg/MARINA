import { NextResponse } from 'next/server'
import { and, eq } from 'drizzle-orm'
import { db, schema } from '@/lib/db/client'
import { HttpError, requireSession } from '@/lib/auth/guards'
import { audit, requestMeta } from '@/lib/audit/log'

export const runtime = 'nodejs'

const REASON_MAX = 1000
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

/**
 * Edit my own leave request — but only while it's still pending. Once a
 * manager has decided, the employee must cancel-and-resubmit. Accepts any
 * subset of { startDate, endDate, leaveType, reason }.
 */
export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireSession()
    const { id: raw } = await ctx.params
    const id = Number(raw)
    if (!Number.isInteger(id)) {
      return NextResponse.json({ error: 'invalid id' }, { status: 400 })
    }

    const body = (await req.json().catch(() => ({}))) as {
      startDate?: string
      endDate?: string
      leaveType?: string
      reason?: string
    }

    const update: Record<string, unknown> = {}
    if (body.startDate) {
      if (!DATE_RE.test(body.startDate)) {
        return NextResponse.json({ error: 'startDate must be YYYY-MM-DD' }, { status: 400 })
      }
      update.startDate = body.startDate
    }
    if (body.endDate) {
      if (!DATE_RE.test(body.endDate)) {
        return NextResponse.json({ error: 'endDate must be YYYY-MM-DD' }, { status: 400 })
      }
      update.endDate = body.endDate
    }
    if (body.leaveType) update.leaveType = body.leaveType
    if (typeof body.reason === 'string') {
      update.reason = body.reason.trim().slice(0, REASON_MAX)
    }
    if (Object.keys(update).length === 0) {
      return NextResponse.json({ error: 'nothing to update' }, { status: 400 })
    }
    if (
      update.startDate &&
      update.endDate &&
      String(update.startDate) > String(update.endDate)
    ) {
      return NextResponse.json({ error: 'endDate must be on/after startDate' }, { status: 400 })
    }

    const [row] = await db
      .update(schema.leaveRequests)
      .set(update)
      .where(
        and(
          eq(schema.leaveRequests.id, id),
          eq(schema.leaveRequests.userId, session.appUserId),
          eq(schema.leaveRequests.status, 'pending'),
        ),
      )
      .returning()
    if (!row) {
      return NextResponse.json({ error: 'pending leave not found' }, { status: 404 })
    }

    audit({
      action: 'leave.requested',
      orgId: row.orgId,
      actorUserId: session.appUserId,
      targetType: 'leave',
      targetId: row.id,
      payload: { update, edited: true },
      ...requestMeta(req),
    })

    return NextResponse.json({
      ok: true,
      leave: {
        id: row.id,
        startDate: row.startDate,
        endDate: row.endDate,
        leaveType: row.leaveType,
        reason: row.reason,
        status: row.status,
      },
    })
  } catch (err) {
    if (err instanceof HttpError) {
      return NextResponse.json({ error: err.message }, { status: err.status })
    }
    console.error('leave edit failed', err)
    return NextResponse.json({ error: 'internal' }, { status: 500 })
  }
}

/** Cancel my own pending leave request. */
export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireSession()
    const { id: raw } = await ctx.params
    const id = Number(raw)
    if (!Number.isInteger(id)) {
      return NextResponse.json({ error: 'invalid id' }, { status: 400 })
    }
    const [row] = await db
      .update(schema.leaveRequests)
      .set({ status: 'cancelled', decidedAt: new Date(), decidedBy: session.appUserId })
      .where(
        and(
          eq(schema.leaveRequests.id, id),
          eq(schema.leaveRequests.userId, session.appUserId),
          eq(schema.leaveRequests.status, 'pending')
        )
      )
      .returning()
    if (!row) {
      return NextResponse.json({ error: 'pending leave not found' }, { status: 404 })
    }
    return NextResponse.json({ ok: true, leave: { id: row.id, status: row.status } })
  } catch (err) {
    if (err instanceof HttpError) {
      return NextResponse.json({ error: err.message }, { status: err.status })
    }
    console.error('leave cancel failed', err)
    return NextResponse.json({ error: 'internal' }, { status: 500 })
  }
}
