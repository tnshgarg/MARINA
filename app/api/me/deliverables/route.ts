import { NextResponse } from 'next/server'
import { and, desc, eq, gte } from 'drizzle-orm'
import { db, schema } from '@/lib/db/client'
import { HttpError, requireSession } from '@/lib/auth/guards'

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
    const title = (body.title ?? '').trim()
    if (!title || title.length > 200) {
      return NextResponse.json({ error: 'title required (max 200 chars)' }, { status: 400 })
    }
    const detail =
      typeof body.detail === 'string' && body.detail.trim().length > 0
        ? body.detail.trim().slice(0, 1000)
        : null
    const url =
      typeof body.url === 'string' && body.url.trim().length > 0
        ? body.url.trim().slice(0, 500)
        : null
    if (url && !/^https?:\/\//i.test(url)) {
      return NextResponse.json({ error: 'url must start with http(s)://' }, { status: 400 })
    }
    const kind =
      typeof body.kind === 'string' && body.kind.trim().length > 0
        ? body.kind.trim().slice(0, 40)
        : null
    const completedAt =
      typeof body.completedAt === 'string' && body.completedAt.length > 0
        ? new Date(body.completedAt)
        : new Date()
    if (Number.isNaN(completedAt.getTime())) {
      return NextResponse.json({ error: 'invalid completedAt' }, { status: 400 })
    }
    // Tie the deliverable to the user's primary org so it shows up in the
    // manager's Activity tab. Falls back to nothing for orgless users.
    let orgId: number | null = null
    if (typeof body.orgId === 'number') {
      orgId = body.orgId
    } else {
      const m = await db.query.memberships.findFirst({
        where: eq(schema.memberships.userId, session.appUserId),
      })
      orgId = m?.orgId ?? null
    }

    const [row] = await db
      .insert(schema.deliverables)
      .values({
        userId: session.appUserId,
        orgId,
        title,
        detail,
        url,
        kind,
        completedAt,
        // Pin the screenshot at completion time so the verification job has
        // a precise frame to inspect later.
        pinnedShotAt: completedAt,
      })
      .returning()

    return NextResponse.json({
      ok: true,
      deliverable: {
        id: row.id,
        title: row.title,
        detail: row.detail,
        url: row.url,
        kind: row.kind,
        completedAt: row.completedAt.toISOString(),
        verificationStatus: row.verificationStatus,
      },
    })
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
