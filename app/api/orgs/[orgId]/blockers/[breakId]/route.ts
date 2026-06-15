import { NextResponse } from 'next/server'
import { and, asc, eq } from 'drizzle-orm'
import { db, schema } from '@/lib/db/client'
import { HttpError, ensureScopeUser, requireScope } from '@/lib/auth/guards'
import { afterResponse } from '@/lib/after'

export const runtime = 'nodejs'

/**
 * Fetch the full blocker context: the break row, the blocked user, who they
 * wait on, the discussion thread (every nudge / suggestion / note ever
 * recorded), plus a quick "team average time to unblock" for context.
 */
export async function GET(
  _req: Request,
  ctx: { params: Promise<{ orgId: string; breakId: string }> },
) {
  const { orgId: rawOrg, breakId: rawBreak } = await ctx.params
  const orgId = Number(rawOrg)
  const breakId = Number(rawBreak)
  if (!Number.isInteger(orgId) || !Number.isInteger(breakId)) {
    return NextResponse.json({ error: 'invalid ids' }, { status: 400 })
  }

  try {
    const { scope } = await requireScope(orgId, 'manager')

    // Fetch only the columns that exist in every version of the schema. The
    // resolution_* + resolved_by_user_id columns are read separately and
    // tolerated as missing so the API doesn't 500 on a not-yet-migrated DB.
    const row = await db
      .select({
        id: schema.breaks.id,
        userId: schema.breaks.userId,
        startedAt: schema.breaks.startedAt,
        endedAt: schema.breaks.endedAt,
        reason: schema.breaks.reason,
        category: schema.breaks.category,
        waitingOnUserId: schema.breaks.waitingOnUserId,
        waitingOnExternal: schema.breaks.waitingOnExternal,
      })
      .from(schema.breaks)
      .where(and(eq(schema.breaks.id, breakId), eq(schema.breaks.orgId, orgId)))
      .limit(1)
      .then((rows) => rows[0])

    if (!row) return NextResponse.json({ error: 'not found' }, { status: 404 })
    ensureScopeUser(scope, row.userId)
    if (row.category !== 'blocked') {
      return NextResponse.json(
        { error: "This isn't a blocker — it's a regular break.", category: row.category },
        { status: 409 },
      )
    }

    // Try to fetch the resolution metadata + thread, but degrade gracefully
    // if either of the new columns/tables hasn't been migrated yet (returns
    // empty thread + null resolution rather than 500).
    const [blockedUser, waitingOnUser, threadResult, resolutionResult] = await Promise.all([
      db.query.users.findFirst({ where: eq(schema.users.id, row.userId) }),
      row.waitingOnUserId
        ? db.query.users.findFirst({ where: eq(schema.users.id, row.waitingOnUserId) })
        : Promise.resolve(null),
      db
        .select({
          t: schema.blockerThread,
          u: schema.users,
        })
        .from(schema.blockerThread)
        .leftJoin(schema.users, eq(schema.blockerThread.authorUserId, schema.users.id))
        .where(eq(schema.blockerThread.breakId, breakId))
        .orderBy(asc(schema.blockerThread.createdAt))
        .catch((e) => {
          console.warn('blocker thread missing (run db:push):', e instanceof Error ? e.message : e)
          return [] as Array<{ t: typeof schema.blockerThread.$inferSelect; u: typeof schema.users.$inferSelect | null }>
        }),
      db
        .select({
          resolvedByUserId: schema.breaks.resolvedByUserId,
          resolutionNote: schema.breaks.resolutionNote,
          resolutionType: schema.breaks.resolutionType,
        })
        .from(schema.breaks)
        .where(eq(schema.breaks.id, breakId))
        .limit(1)
        .then((rows) => rows[0] ?? null)
        .catch((e) => {
          console.warn('blocker resolution cols missing (run db:push):', e instanceof Error ? e.message : e)
          return null
        }),
    ])
    const thread = threadResult ?? []

    return NextResponse.json({
      blocker: {
        id: row.id,
        startedAt: row.startedAt.toISOString(),
        endedAt: row.endedAt?.toISOString() ?? null,
        reason: row.reason,
        waitingOnExternal: row.waitingOnExternal,
        resolvedByUserId: resolutionResult?.resolvedByUserId ?? null,
        resolutionNote: resolutionResult?.resolutionNote ?? null,
        resolutionType: resolutionResult?.resolutionType ?? null,
      },
      blockedUser: blockedUser
        ? {
            id: blockedUser.id,
            login: blockedUser.login,
            name: blockedUser.name,
            characterKey: blockedUser.characterKey,
            email: blockedUser.email,
          }
        : null,
      waitingOnUser: waitingOnUser
        ? {
            id: waitingOnUser.id,
            login: waitingOnUser.login,
            name: waitingOnUser.name,
            characterKey: waitingOnUser.characterKey,
          }
        : null,
      thread: thread.map(({ t, u }) => ({
        id: t.id,
        kind: t.kind,
        body: t.body,
        createdAt: t.createdAt.toISOString(),
        author: u ? { id: u.id, login: u.login, name: u.name, characterKey: u.characterKey } : null,
      })),
    })
  } catch (err) {
    if (err instanceof HttpError) {
      return NextResponse.json({ error: err.message }, { status: err.status })
    }
    console.error('blocker fetch failed', err)
    return NextResponse.json({ error: 'internal' }, { status: 500 })
  }
}

/**
 * Append a manager note / suggestion to the blocker thread. Optionally
 * notifies the blocked employee in-app so they pick up the alternative
 * path the manager suggested.
 */
export async function POST(
  req: Request,
  ctx: { params: Promise<{ orgId: string; breakId: string }> },
) {
  const { orgId: rawOrg, breakId: rawBreak } = await ctx.params
  const orgId = Number(rawOrg)
  const breakId = Number(rawBreak)
  if (!Number.isInteger(orgId) || !Number.isInteger(breakId)) {
    return NextResponse.json({ error: 'invalid ids' }, { status: 400 })
  }

  try {
    const { session, scope } = await requireScope(orgId, 'manager')
    const body = (await req.json().catch(() => ({}))) as {
      kind?: 'note' | 'suggestion'
      body?: string
      notifyEmployee?: boolean
    }

    const kind: 'note' | 'suggestion' = body.kind === 'suggestion' ? 'suggestion' : 'note'
    const text = (body.body ?? '').trim().slice(0, 2000)
    if (text.length === 0) {
      return NextResponse.json({ error: 'body required' }, { status: 400 })
    }

    const row = await db.query.breaks.findFirst({
      where: and(eq(schema.breaks.id, breakId), eq(schema.breaks.orgId, orgId)),
    })
    if (!row) return NextResponse.json({ error: 'not found' }, { status: 404 })
    ensureScopeUser(scope, row.userId)

    try {
      await db.insert(schema.blockerThread).values({
        breakId,
        authorUserId: session.appUserId,
        kind,
        body: text,
      })
    } catch (e) {
      console.warn('blocker_thread missing (run db:push):', e instanceof Error ? e.message : e)
      return NextResponse.json(
        { error: 'blocker thread not available — run db:push to enable' },
        { status: 500 },
      )
    }

    if (body.notifyEmployee) {
      afterResponse(
        async () => {
          const author = await db.query.users.findFirst({
            where: eq(schema.users.id, session.appUserId),
          })
          await db.insert(schema.notifications).values({
            userId: row.userId,
            orgId,
            kind: kind === 'suggestion' ? 'blocker.suggestion' : 'blocker.note',
            title:
              kind === 'suggestion'
                ? `${author?.name ?? author?.login ?? 'Your manager'} suggested an alternative`
                : `${author?.name ?? author?.login ?? 'Your manager'} added a note`,
            body: text.slice(0, 200),
            href: null,
          })
        },
        'notify suggestion',
      )
    }

    return NextResponse.json({ ok: true })
  } catch (err) {
    if (err instanceof HttpError) {
      return NextResponse.json({ error: err.message }, { status: err.status })
    }
    console.error('blocker note failed', err)
    return NextResponse.json({ error: 'internal' }, { status: 500 })
  }
}
