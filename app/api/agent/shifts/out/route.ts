import { NextResponse } from 'next/server'
import { and, eq, isNull } from 'drizzle-orm'
import { db, schema } from '@/lib/db/client'
import { authenticateAgent } from '@/lib/agent/auth'
import { verifyShiftSummary } from '@/lib/engine/verify-shift'
import { buildStory } from '@/lib/engine/story'
import { audit, requestMeta } from '@/lib/audit/log'
import { notify } from '@/lib/notify/send'

export const runtime = 'nodejs'
export const maxDuration = 60

const SUMMARY_MAX = 4000
const SUMMARY_MIN = 20

export async function POST(req: Request) {
  const agent = await authenticateAgent(req)
  if (!agent) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const body = (await req.json().catch(() => ({}))) as { summary?: string }
  const summary = (body.summary ?? '').toString().trim().slice(0, SUMMARY_MAX)
  if (summary.length < SUMMARY_MIN) {
    return NextResponse.json(
      { error: `Summary must be at least ${SUMMARY_MIN} characters.` },
      { status: 400 }
    )
  }

  const shift = await db.query.shifts.findFirst({
    where: and(eq(schema.shifts.userId, agent.user.id), isNull(schema.shifts.punchedOutAt)),
  })
  if (!shift) {
    return NextResponse.json({ error: 'No open shift — punch in first.' }, { status: 404 })
  }

  const punchedOutAt = new Date()
  const [updated] = await db
    .update(schema.shifts)
    .set({
      punchedOutAt,
      punchedOutVia: 'agent',
      workSummary: summary,
      verificationStatus: 'unverified',
    })
    .where(eq(schema.shifts.id, shift.id))
    .returning()

  void audit({
    action: 'shift.punch_out',
    orgId: updated.orgId,
    actorUserId: agent.user.id,
    targetType: 'shift',
    targetId: updated.id,
    payload: { via: 'agent' },
    ...requestMeta(req),
  })

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
    actorUserId: agent.user.id,
    targetType: 'shift',
    targetId: verified.id,
    payload: { score: verdict.score, status: verdict.status },
    ...requestMeta(req),
  })

  // Fire-and-forget daily story generation so the manager sees a fresh story
  // by the time they next open the dashboard. Failures don't block punch-out.
  void buildStory(agent.user.id, new Date()).catch((err) => {
    console.error('[shifts/out] background story generation failed', err)
  })

  if (verified.orgId) {
    const user = agent.user
    void notify({
      kind: 'shift.punched_out',
      orgId: verified.orgId,
      userName: user.name ?? `@${user.login}`,
      userLogin: user.login,
      durationMins: Math.max(0, Math.round((punchedOutAt.getTime() - verified.punchedInAt.getTime()) / 60000)),
      verificationStatus: verdict.status,
      verificationScore: verdict.score,
      summary,
      notes: verdict.notes,
    })
    if (verdict.status === 'suspect') {
      void notify({
        kind: 'shift.suspicious',
        orgId: verified.orgId,
        userName: user.name ?? `@${user.login}`,
        userLogin: user.login,
        reason: `Summary score ${verdict.score}/100 — ${verdict.notes}`,
      })
    }
  }

  return NextResponse.json({
    ok: true,
    shift: {
      id: verified.id,
      punchedInAt: verified.punchedInAt.toISOString(),
      punchedOutAt: verified.punchedOutAt?.toISOString() ?? null,
    },
    verification: {
      status: verdict.status,
      score: verdict.score,
      notes: verdict.notes,
    },
  })
}
