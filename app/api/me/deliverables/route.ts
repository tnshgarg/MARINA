import { NextResponse } from 'next/server'
import { and, desc, eq, gte } from 'drizzle-orm'
import { db, schema } from '@/lib/db/client'
import { HttpError, requireSession } from '@/lib/auth/guards'
import { createDeliverable } from '@/lib/deliverables/create'

export const runtime = 'nodejs'

/**
 * Self-reported deliverables for the signed-in user.
 *
 * GET  — last 30 days, newest first.
 * POST — log a new item.
 *
 * Verification will happen async: when a `pinnedShotAt` is set, a cron pass
 * checks whether the screenshot at that timestamp matches the claimed kind
 * (e.g. Figma window for a "design" deliverable). For now we just persist
 * the data; the verification job is its own task.
 */
export async function GET() {
  try {
    const session = await requireSession()
    const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
    const rows = await db
      .select()
      .from(schema.deliverables)
      .where(
        and(
          eq(schema.deliverables.userId, session.appUserId),
          gte(schema.deliverables.completedAt, since),
        ),
      )
      .orderBy(desc(schema.deliverables.completedAt))
      .limit(100)
    return NextResponse.json({
      deliverables: rows.map((d) => ({
        id: d.id,
        title: d.title,
        detail: d.detail,
        url: d.url,
        kind: d.kind,
        completedAt: d.completedAt.toISOString(),
        verificationStatus: d.verificationStatus,
      })),
    })
  } catch (err) {
    return errorResponse(err)
  }
}

export async function POST(req: Request) {
  try {
    const session = await requireSession()
    const body = (await req.json().catch(() => ({}))) as {
      title?: string
      detail?: string | null
      url?: string | null
      kind?: string | null
      completedAt?: string | null
      orgId?: number | null
    }
    const result = await createDeliverable({
      userId: session.appUserId,
      title: body.title ?? '',
      detail: body.detail ?? null,
      url: body.url ?? null,
      kind: body.kind ?? null,
      completedAt:
        typeof body.completedAt === 'string' && body.completedAt.length > 0
          ? new Date(body.completedAt)
          : undefined,
      orgId: body.orgId ?? null,
    })

    if (!result.ok) {
      return NextResponse.json(
        { error: result.error, duplicateOf: result.duplicateOf },
        { status: result.status },
      )
    }
    return NextResponse.json({ ok: true, deliverable: result.deliverable })
  } catch (err) {
    return errorResponse(err)
  }
}

function errorResponse(err: unknown) {
  if (err instanceof HttpError) {
    return NextResponse.json({ error: err.message }, { status: err.status })
  }
  console.error('deliverables route failed', err)
  return NextResponse.json({ error: 'internal' }, { status: 500 })
}
