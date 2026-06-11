import { NextResponse } from 'next/server'
import { and, eq } from 'drizzle-orm'
import { db, schema } from '@/lib/db/client'
import { HttpError, requireSession } from '@/lib/auth/guards'
import { audit, requestMeta } from '@/lib/audit/log'

export const runtime = 'nodejs'

const SUMMARY_MAX = 4000

/**
 * Edit my own shift's work summary. Allowed only for shifts that have already
 * been punched out (the summary makes no sense before then), and only within
 * 7 days — beyond that the manager has likely already acted on the summary.
 *
 * Editing resets the verification status to 'unverified' so the AI can
 * re-validate against the updated text. Audit-logged so manager has visibility.
 */
export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireSession()
    const { id: raw } = await ctx.params
    const id = Number(raw)
    if (!Number.isInteger(id)) {
      return NextResponse.json({ error: 'invalid id' }, { status: 400 })
    }

    const body = (await req.json().catch(() => ({}))) as { summary?: string }
    const summary = (body.summary ?? '').toString().trim().slice(0, SUMMARY_MAX)
    if (!summary) {
      return NextResponse.json({ error: 'summary required' }, { status: 400 })
    }

    const existing = await db.query.shifts.findFirst({
      where: and(eq(schema.shifts.id, id), eq(schema.shifts.userId, session.appUserId)),
    })
    if (!existing) return NextResponse.json({ error: 'shift not found' }, { status: 404 })
    if (!existing.punchedOutAt) {
      return NextResponse.json({ error: 'shift is still open — punch out first' }, { status: 409 })
    }
    const sevenDaysMs = 7 * 24 * 60 * 60 * 1000
    if (Date.now() - existing.punchedOutAt.getTime() > sevenDaysMs) {
      return NextResponse.json({ error: 'edit window expired (7 days)' }, { status: 409 })
    }

    const [row] = await db
      .update(schema.shifts)
      .set({
        workSummary: summary,
        // Force re-verification — the new summary needs to be re-scored.
        verificationStatus: 'unverified',
        verificationScore: null,
        verificationNotes: null,
        verifiedAt: null,
      })
      .where(eq(schema.shifts.id, id))
      .returning()

    audit({
      action: 'shift.punch_out',
      orgId: row.orgId,
      actorUserId: session.appUserId,
      targetType: 'shift',
      targetId: row.id,
      payload: { edited_summary: true, prev_summary_length: existing.workSummary?.length ?? 0 },
      ...requestMeta(req),
    })

    return NextResponse.json({
      ok: true,
      shift: {
        id: row.id,
        workSummary: row.workSummary,
        verificationStatus: row.verificationStatus,
      },
    })
  } catch (err) {
    if (err instanceof HttpError) {
      return NextResponse.json({ error: err.message }, { status: err.status })
    }
    console.error('shift edit failed', err)
    return NextResponse.json({ error: 'internal' }, { status: 500 })
  }
}
