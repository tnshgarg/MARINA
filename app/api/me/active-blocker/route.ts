import { NextResponse } from 'next/server'
import { and, asc, eq, isNull } from 'drizzle-orm'
import { db, schema } from '@/lib/db/client'
import { HttpError, requireSession } from '@/lib/auth/guards'

export const runtime = 'nodejs'

/**
 * Live view of the signed-in user's active blocker, with the full thread.
 *
 * Used by the dashboard's "Manager coaching" card so the employee can SEE
 * what their manager suggested without first opening the notification bell.
 * Returns `{ blocker: null }` when nothing's stuck — the card vanishes.
 */
export async function GET() {
  try {
    const session = await requireSession()

    // Latest non-ended `blocked` break — there can only be one at a time
    // for a given user, but we sort just in case.
    const blocker = await db.query.breaks.findFirst({
      where: and(
        eq(schema.breaks.userId, session.appUserId),
        eq(schema.breaks.category, 'blocked'),
        isNull(schema.breaks.endedAt),
      ),
    })
    if (!blocker) return NextResponse.json({ blocker: null })

    const threadRows = await db
      .select({
        t: schema.blockerThread,
        u: schema.users,
      })
      .from(schema.blockerThread)
      .leftJoin(schema.users, eq(schema.blockerThread.authorUserId, schema.users.id))
      .where(eq(schema.blockerThread.breakId, blocker.id))
      .orderBy(asc(schema.blockerThread.createdAt))
      .catch(() => [])

    return NextResponse.json({
      blocker: {
        id: blocker.id,
        startedAt: blocker.startedAt.toISOString(),
        reason: blocker.reason,
        waitingOnExternal: blocker.waitingOnExternal,
        thread: threadRows.map((row) => ({
          id: row.t.id,
          kind: row.t.kind,
          body: row.t.body,
          createdAt: row.t.createdAt.toISOString(),
          author: row.u
            ? {
                id: row.u.id,
                login: row.u.login,
                name: row.u.name,
                characterKey: row.u.characterKey,
                avatarUrl: row.u.avatarUrl,
              }
            : null,
        })),
      },
    })
  } catch (e) {
    if (e instanceof HttpError) {
      return NextResponse.json({ error: e.message }, { status: e.status })
    }
    return NextResponse.json({ error: 'internal' }, { status: 500 })
  }
}
