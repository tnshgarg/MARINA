import { NextResponse } from 'next/server'
import { and, desc, eq, inArray, isNull, ne } from 'drizzle-orm'
import { db, schema } from '@/lib/db/client'
import { HttpError, listMembershipsForCurrentUser, requireSession } from '@/lib/auth/guards'
import { audit, requestMeta } from '@/lib/audit/log'
import { afterResponse } from '@/lib/after'
import type { AttendanceRegularization } from '@/lib/db/schema'

export const runtime = 'nodejs'

const NOTE_MAX = 500
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/
const VALID_KINDS = ['present', 'leave', 'wfh', 'holiday'] as const
type RequestedKind = (typeof VALID_KINDS)[number]

const KIND_LABELS: Record<RequestedKind, string> = {
  present: 'Present',
  leave: 'On leave',
  wfh: 'Work from home',
  holiday: 'Holiday',
}

/** GET: the caller's own regularization requests (newest first). */
export async function GET() {
  try {
    const session = await requireSession()
    const rows = await db
      .select()
      .from(schema.attendanceRegularizations)
      .where(eq(schema.attendanceRegularizations.userId, session.appUserId))
      .orderBy(desc(schema.attendanceRegularizations.createdAt))
      .limit(60)
    return NextResponse.json({ ok: true, regularizations: rows.map(serialise) })
  } catch (err) {
    return error(err)
  }
}

/** POST: file a new regularization request for one of the caller's own days. */
export async function POST(req: Request) {
  try {
    const session = await requireSession()
    const body = (await req.json().catch(() => ({}))) as {
      orgId?: number
      day?: string
      requestedKind?: string
      note?: string
    }

    if (typeof body.orgId !== 'number') {
      return NextResponse.json({ error: 'orgId required' }, { status: 400 })
    }
    if (typeof body.day !== 'string' || !ISO_DATE.test(body.day)) {
      return NextResponse.json({ error: 'day must be YYYY-MM-DD' }, { status: 400 })
    }
    // Reject impossible / future days. Compare on the calendar-date string so
    // we don't get tripped up by the server's local timezone.
    const today = new Date()
    const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`
    const parsed = new Date(body.day + 'T00:00:00')
    if (Number.isNaN(parsed.getTime())) {
      return NextResponse.json({ error: 'day is not a valid date' }, { status: 400 })
    }
    if (body.day > todayStr) {
      return NextResponse.json({ error: "you can't regularize a future day" }, { status: 400 })
    }
    if (!VALID_KINDS.includes(body.requestedKind as RequestedKind)) {
      return NextResponse.json(
        { error: 'requestedKind must be one of present|leave|wfh|holiday' },
        { status: 400 },
      )
    }
    const requestedKind = body.requestedKind as RequestedKind
    const note = (body.note ?? '').toString().trim().slice(0, NOTE_MAX)
    if (note.length === 0) {
      return NextResponse.json({ error: 'note required' }, { status: 400 })
    }

    // Verify the caller actually belongs to the org they're filing under —
    // otherwise a user could inject a request (and a manager notification)
    // into any org. Mirrors app/api/me/breaks/route.ts's orgId validation.
    const memberships = await listMembershipsForCurrentUser()
    const member = memberships.find((m) => m.orgId === body.orgId)
    if (!member) {
      return NextResponse.json({ error: 'not a member of that org' }, { status: 403 })
    }
    const orgId = body.orgId

    // One open request per (user, day): if a pending one already exists, don't
    // create a duplicate — point the user at it instead.
    const dup = await db.query.attendanceRegularizations.findFirst({
      where: and(
        eq(schema.attendanceRegularizations.userId, session.appUserId),
        eq(schema.attendanceRegularizations.day, body.day),
        eq(schema.attendanceRegularizations.status, 'pending'),
      ),
    })
    if (dup) {
      return NextResponse.json(
        { error: 'You already have a pending request for that day.' },
        { status: 409 },
      )
    }

    const [row] = await db
      .insert(schema.attendanceRegularizations)
      .values({
        orgId,
        userId: session.appUserId,
        day: body.day,
        requestedKind,
        note,
        status: 'pending',
      })
      .returning()

    void audit({
      action: 'org.settings_changed',
      orgId,
      actorUserId: session.appUserId,
      targetType: 'user',
      targetId: row.id,
      payload: { kind: 'regularization.requested', day: body.day, requestedKind },
      ...requestMeta(req),
    })

    // Let managers/owners in the org know there's something to review. Mirrors
    // how me/leaves notifies managers via the in-app inbox.
    const me = await db.query.users.findFirst({ where: eq(schema.users.id, session.appUserId) })
    const requesterName = me?.name ?? `@${session.login}`
    const title = `${requesterName} requested attendance regularization`
    const notifBody = `${body.day} · ${KIND_LABELS[requestedKind]}${note ? ` · ${note.slice(0, 120)}` : ''}`
    afterResponse(async () => {
      const managers = await db
        .select({ userId: schema.memberships.userId })
        .from(schema.memberships)
        .where(
          and(
            eq(schema.memberships.orgId, orgId),
            isNull(schema.memberships.endedAt),
            inArray(schema.memberships.role, ['admin', 'manager']),
            ne(schema.memberships.userId, session.appUserId),
          ),
        )
      if (managers.length === 0) return
      await db.insert(schema.notifications).values(
        managers.map((m) => ({
          userId: m.userId,
          orgId,
          kind: 'regularization.requested',
          title,
          body: notifBody.slice(0, 200),
          href: `/org/${orgId}/regularizations`,
        })),
      )
    }, 'notify managers of regularization')

    return NextResponse.json({ ok: true, regularization: serialise(row) })
  } catch (err) {
    return error(err)
  }
}

function serialise(r: AttendanceRegularization) {
  return {
    id: r.id,
    orgId: r.orgId,
    userId: r.userId,
    day: r.day,
    requestedKind: r.requestedKind,
    note: r.note,
    status: r.status,
    decidedByUserId: r.decidedByUserId,
    decidedAt: r.decidedAt?.toISOString() ?? null,
    decidedNote: r.decidedNote,
    createdAt: r.createdAt.toISOString(),
  }
}

function error(err: unknown) {
  if (err instanceof HttpError) {
    return NextResponse.json({ error: err.message }, { status: err.status })
  }
  console.error('me/regularizations route failed', err)
  return NextResponse.json({ error: 'internal' }, { status: 500 })
}
