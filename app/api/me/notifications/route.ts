import { NextResponse } from 'next/server'
import { and, desc, eq, isNull } from 'drizzle-orm'
import { db, schema } from '@/lib/db/client'
import { HttpError, requireSession } from '@/lib/auth/guards'

export const runtime = 'nodejs'

/** Inbox feed for the bell icon. */
export async function GET(req: Request) {
  try {
    const session = await requireSession()
    const url = new URL(req.url)
    const onlyUnread = url.searchParams.get('unread') === '1'

    const where = onlyUnread
      ? and(
          eq(schema.notifications.userId, session.appUserId),
          isNull(schema.notifications.readAt),
        )
      : eq(schema.notifications.userId, session.appUserId)

    const rows = await db
      .select()
      .from(schema.notifications)
      .where(where)
      .orderBy(desc(schema.notifications.createdAt))
      .limit(50)

    const [unreadCount] = await db
      .select({ n: schema.notifications.id })
      .from(schema.notifications)
      .where(
        and(
          eq(schema.notifications.userId, session.appUserId),
          isNull(schema.notifications.readAt),
        ),
      )

    return NextResponse.json({
      unreadCount: rows.filter((r) => !r.readAt).length,
      notifications: rows.map((r) => ({
        id: r.id,
        kind: r.kind,
        title: r.title,
        body: r.body,
        href: r.href,
        readAt: r.readAt?.toISOString() ?? null,
        createdAt: r.createdAt.toISOString(),
      })),
    })
    void unreadCount
  } catch (err) {
    if (err instanceof HttpError) {
      return NextResponse.json({ error: err.message }, { status: err.status })
    }
    return NextResponse.json({ error: 'internal' }, { status: 500 })
  }
}

/** Mark notifications read. Body: { ids: number[] } or { all: true }. */
export async function POST(req: Request) {
  try {
    const session = await requireSession()
    const body = (await req.json().catch(() => ({}))) as {
      ids?: number[]
      all?: boolean
    }

    if (body.all) {
      await db
        .update(schema.notifications)
        .set({ readAt: new Date() })
        .where(
          and(
            eq(schema.notifications.userId, session.appUserId),
            isNull(schema.notifications.readAt),
          ),
        )
      return NextResponse.json({ ok: true, all: true })
    }

    const ids = Array.isArray(body.ids) ? body.ids.filter((n) => Number.isInteger(n)) : []
    if (ids.length === 0) return NextResponse.json({ ok: true, marked: 0 })

    // Cheap loop — bell never holds enough to worry about.
    for (const id of ids) {
      await db
        .update(schema.notifications)
        .set({ readAt: new Date() })
        .where(
          and(
            eq(schema.notifications.id, id),
            eq(schema.notifications.userId, session.appUserId),
            isNull(schema.notifications.readAt),
          ),
        )
    }
    return NextResponse.json({ ok: true, marked: ids.length })
  } catch (err) {
    if (err instanceof HttpError) {
      return NextResponse.json({ error: err.message }, { status: err.status })
    }
    return NextResponse.json({ error: 'internal' }, { status: 500 })
  }
}
