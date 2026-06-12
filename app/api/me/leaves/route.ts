import { NextResponse } from 'next/server'
import { and, desc, eq, inArray, isNull, ne } from 'drizzle-orm'
import { db, schema } from '@/lib/db/client'
import { LEAVE_TYPE_LABELS, type LeaveType } from '@/lib/db/schema'
import { HttpError, requireMembership, requireSession } from '@/lib/auth/guards'
import { audit, requestMeta } from '@/lib/audit/log'
import { notify } from '@/lib/notify/send'
import { afterResponse } from '@/lib/after'

const VALID_LEAVE_TYPES: ReadonlyArray<LeaveType> = [
  'sick', 'casual', 'earned', 'maternity', 'paternity', 'bereavement', 'compoff', 'unpaid', 'other',
]

export const runtime = 'nodejs'

const REASON_MAX = 500
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/

export async function GET() {
  try {
    const session = await requireSession()
    const rows = await db
      .select()
      .from(schema.leaveRequests)
      .where(eq(schema.leaveRequests.userId, session.appUserId))
      .orderBy(desc(schema.leaveRequests.createdAt))
      .limit(40)
    return NextResponse.json({ ok: true, leaves: rows.map(serialise) })
  } catch (err) {
    return error(err)
  }
}

export async function POST(req: Request) {
  try {
    const session = await requireSession()
    const body = (await req.json().catch(() => ({}))) as {
      orgId?: number
      startDate?: string
      endDate?: string
      reason?: string
      leaveType?: string
    }

    if (typeof body.orgId !== 'number') {
      return NextResponse.json({ error: 'orgId required' }, { status: 400 })
    }
    if (typeof body.startDate !== 'string' || !ISO_DATE.test(body.startDate)) {
      return NextResponse.json({ error: 'startDate must be YYYY-MM-DD' }, { status: 400 })
    }
    if (typeof body.endDate !== 'string' || !ISO_DATE.test(body.endDate)) {
      return NextResponse.json({ error: 'endDate must be YYYY-MM-DD' }, { status: 400 })
    }
    if (body.endDate < body.startDate) {
      return NextResponse.json({ error: 'endDate must be on or after startDate' }, { status: 400 })
    }
    const reason = (body.reason ?? '').toString().trim().slice(0, REASON_MAX)
    if (reason.length === 0) {
      return NextResponse.json({ error: 'reason required' }, { status: 400 })
    }
    const leaveType: LeaveType = VALID_LEAVE_TYPES.includes(body.leaveType as LeaveType)
      ? (body.leaveType as LeaveType)
      : 'casual'

    // Must be a member of the org to file leave under it.
    await requireMembership(body.orgId, 'member')

    const [row] = await db
      .insert(schema.leaveRequests)
      .values({
        userId: session.appUserId,
        orgId: body.orgId,
        startDate: body.startDate,
        endDate: body.endDate,
        reason,
        leaveType,
        status: 'pending',
      })
      .returning()

    void audit({
      action: 'leave.requested',
      orgId: body.orgId,
      actorUserId: session.appUserId,
      targetType: 'leave',
      targetId: row.id,
      payload: { startDate: body.startDate, endDate: body.endDate, leaveType },
      ...requestMeta(req),
    })

    const me = await db.query.users.findFirst({ where: eq(schema.users.id, session.appUserId) })
    void notify({
      kind: 'leave.requested',
      orgId: body.orgId,
      actorUserId: session.appUserId,
      userName: me?.name ?? `@${session.login}`,
      userLogin: session.login,
      startDate: body.startDate,
      endDate: body.endDate,
      leaveType: LEAVE_TYPE_LABELS[leaveType],
      reason,
    })

    // In-app + desktop notification to every active manager/owner in the org
    // so they actually see it land. Slack might not be configured; the bell
    // and agent definitely are.
    const requesterName = me?.name ?? `@${session.login}`
    const orgIdForNotify = body.orgId
    const leaveTitle = `${requesterName} requested ${LEAVE_TYPE_LABELS[leaveType]}`
    const leaveBody = `${body.startDate}${body.startDate !== body.endDate ? ` → ${body.endDate}` : ''}${reason ? ` · ${reason.slice(0, 120)}` : ''}`
    afterResponse(
      async () => {
        const managers = await db
          .select({ userId: schema.memberships.userId, role: schema.memberships.role })
          .from(schema.memberships)
          .where(
            and(
              eq(schema.memberships.orgId, orgIdForNotify),
              isNull(schema.memberships.endedAt),
              inArray(schema.memberships.role, ['owner', 'manager']),
              ne(schema.memberships.userId, session.appUserId),
            ),
          )
        if (managers.length === 0) return
        await db.insert(schema.notifications).values(
          managers.map((m) => ({
            userId: m.userId,
            orgId: orgIdForNotify,
            kind: 'leave.requested',
            title: leaveTitle,
            body: leaveBody.slice(0, 200),
            href: `/org/${orgIdForNotify}/leaves`,
          })),
        )
      },
      'notify managers of leave',
    )

    return NextResponse.json({ ok: true, leave: serialise(row) })
  } catch (err) {
    return error(err)
  }
}

function serialise(l: typeof schema.leaveRequests.$inferSelect) {
  return {
    id: l.id,
    userId: l.userId,
    orgId: l.orgId,
    startDate: l.startDate,
    endDate: l.endDate,
    reason: l.reason,
    status: l.status,
    decidedAt: l.decidedAt?.toISOString() ?? null,
    decidedBy: l.decidedBy,
    decidedNote: l.decidedNote,
    createdAt: l.createdAt.toISOString(),
  }
}

function error(err: unknown) {
  if (err instanceof HttpError) {
    return NextResponse.json({ error: err.message }, { status: err.status })
  }
  console.error('leaves route failed', err)
  return NextResponse.json({ error: 'internal' }, { status: 500 })
}
