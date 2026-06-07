import { NextResponse } from 'next/server'
import { and, eq, isNull } from 'drizzle-orm'
import { db, schema } from '@/lib/db/client'
import { HttpError, requireSession } from '@/lib/auth/guards'
import { verifyShiftSummary } from '@/lib/engine/verify-shift'
import { buildStory } from '@/lib/engine/story'
import { audit, requestMeta } from '@/lib/audit/log'
import { notify } from '@/lib/notify/send'

export const runtime = 'nodejs'
export const maxDuration = 60 // AI call can take ~10-30s

const SUMMARY_MAX = 4000
const SUMMARY_MIN = 20

export async function POST(req: Request) {
  try {
    const session = await requireSession()
    const body = (await req.json().catch(() => ({}))) as { summary?: string }
    const summary = (body.summary ?? '').toString().trim().slice(0, SUMMARY_MAX)
    if (summary.length < SUMMARY_MIN) {
      return NextResponse.json(
        { error: `Summary must be at least ${SUMMARY_MIN} characters.` },
        { status: 400 }
      )
    }

    const shift = await db.query.shifts.findFirst({
      where: and(eq(schema.shifts.userId, session.appUserId), isNull(schema.shifts.punchedOutAt)),
    })
    if (!shift) {
      return NextResponse.json({ error: 'No open shift — punch in first.' }, { status: 404 })
    }

    // Close the shift first; verification runs after.
    const punchedOutAt = new Date()
    const [updated] = await db
      .update(schema.shifts)
      .set({
        punchedOutAt,
        punchedOutVia: 'web',
        workSummary: summary,
        verificationStatus: 'unverified',
      })
      .where(eq(schema.shifts.id, shift.id))
      .returning()

    void audit({
      action: 'shift.punch_out',
      orgId: updated.orgId,
      actorUserId: session.appUserId,
      targetType: 'shift',
      targetId: updated.id,
      payload: { via: 'web', durationMins: durationMinutes(updated.punchedInAt, punchedOutAt) },
      ...requestMeta(req),
    })

    // Run verification synchronously up to the function timeout. The user is
    // waiting on the result so we want it inline rather than via background job.
    const verdict = await verifyShiftSummary(updated, summary)

    const [verified] = await db
      .update(schema.shifts)
      .set({
        verificationStatus: verdict.status,
        verificationScore: verdict.score,
        verificationNotes: verdict.notes,
        verificationProvider: `${verdict.provider}/${verdict.model}`,
        verifiedAt: new Date(),
      })
      .where(eq(schema.shifts.id, updated.id))
      .returning()

    void audit({
      action: 'shift.verified',
      orgId: verified.orgId,
      actorUserId: session.appUserId,
      targetType: 'shift',
      targetId: verified.id,
      payload: { score: verdict.score, status: verdict.status },
      ...requestMeta(req),
    })

    // Fire-and-forget daily story generation so the manager sees a fresh story
    // by the time they next open the dashboard. Failures don't block punch-out.
    void buildStory(session.appUserId, new Date()).catch((err) => {
      console.error('[shifts/out] background story generation failed', err)
    })

    // Notify the manager
    if (verified.orgId) {
      const user = await db.query.users.findFirst({ where: eq(schema.users.id, session.appUserId) })
      void notify({
        kind: 'shift.punched_out',
        orgId: verified.orgId,
        userName: user?.name ?? `@${session.login}`,
        userLogin: session.login,
        durationMins: durationMinutes(verified.punchedInAt, punchedOutAt),
        verificationStatus: verdict.status,
        verificationScore: verdict.score,
        summary,
        notes: verdict.notes,
      })
      if (verdict.status === 'suspect') {
        void notify({
          kind: 'shift.suspicious',
          orgId: verified.orgId,
          userName: user?.name ?? `@${session.login}`,
          userLogin: session.login,
          reason: `Summary score ${verdict.score}/100 — ${verdict.notes}`,
        })
      }
    }

    return NextResponse.json({
      ok: true,
      shift: serialise(verified),
      verification: {
        status: verdict.status,
        score: verdict.score,
        notes: verdict.notes,
      },
    })
  } catch (err) {
    if (err instanceof HttpError) {
      return NextResponse.json({ error: err.message }, { status: err.status })
    }
    console.error('shift out failed', err)
    return NextResponse.json({ error: 'internal', message: String(err) }, { status: 500 })
  }
}

function durationMinutes(start: Date, end: Date): number {
  return Math.max(0, Math.round((end.getTime() - start.getTime()) / 60000))
}

function serialise(s: typeof schema.shifts.$inferSelect) {
  return {
    id: s.id,
    punchedInAt: s.punchedInAt.toISOString(),
    punchedOutAt: s.punchedOutAt?.toISOString() ?? null,
    workSummary: s.workSummary,
    verificationStatus: s.verificationStatus,
    verificationScore: s.verificationScore,
    verificationNotes: s.verificationNotes,
  }
}
