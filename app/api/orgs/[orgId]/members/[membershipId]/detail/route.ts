import { NextResponse } from 'next/server'
import { and, desc, eq, gte, like, not } from 'drizzle-orm'
import { db, schema } from '@/lib/db/client'
import { HttpError, requireMembership } from '@/lib/auth/guards'

export const runtime = 'nodejs'

const DAY_MS = 24 * 60 * 60 * 1000

/**
 * Full drill-down payload for a single member: today's scenes, GitHub events
 * for the last 7 days, recent breaks (7d), recent leaves (60d), latest shift,
 * latest narrative + story. Fed to the in-app member-detail modal so the
 * dashboard payload stays small.
 */
export async function GET(
  _req: Request,
  ctx: { params: Promise<{ orgId: string; membershipId: string }> },
) {
  const { orgId: rawO, membershipId: rawM } = await ctx.params
  const orgId = Number(rawO)
  const membershipId = Number(rawM)
  if (!Number.isInteger(orgId) || !Number.isInteger(membershipId)) {
    return NextResponse.json({ error: 'invalid ids' }, { status: 400 })
  }

  try {
    await requireMembership(orgId, 'manager')

    const membership = await db.query.memberships.findFirst({
      where: and(
        eq(schema.memberships.id, membershipId),
        eq(schema.memberships.orgId, orgId),
      ),
    })
    if (!membership) return NextResponse.json({ error: 'member not found' }, { status: 404 })

    const user = await db.query.users.findFirst({
      where: eq(schema.users.id, membership.userId),
    })
    if (!user) return NextResponse.json({ error: 'user not found' }, { status: 404 })

    const since7 = new Date(Date.now() - 7 * DAY_MS)
    const since60 = new Date(Date.now() - 60 * DAY_MS)
    const today = new Date()
    const todayIso = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`

    const [latestNarrative, todayStory, ghEvents, recentBreaks, recentLeaves, latestShift] = await Promise.all([
      db.query.narratives.findFirst({
        where: eq(schema.narratives.userId, user.id),
        orderBy: [desc(schema.narratives.createdAt)],
      }),
      db.query.dailyStories.findFirst({
        where: and(
          eq(schema.dailyStories.userId, user.id),
          eq(schema.dailyStories.day, todayIso),
        ),
      }),
      db
        .select()
        .from(schema.githubEvents)
        .where(
          and(
            eq(schema.githubEvents.userId, user.id),
            gte(schema.githubEvents.occurredAt, since7),
            not(like(schema.githubEvents.externalId, 'seed-%')),
          ),
        )
        .orderBy(desc(schema.githubEvents.occurredAt))
        .limit(30),
      db
        .select()
        .from(schema.breaks)
        .where(
          and(
            eq(schema.breaks.userId, user.id),
            gte(schema.breaks.startedAt, since7),
          ),
        )
        .orderBy(desc(schema.breaks.startedAt))
        .limit(20),
      db
        .select()
        .from(schema.leaveRequests)
        .where(
          and(
            eq(schema.leaveRequests.userId, user.id),
            gte(schema.leaveRequests.createdAt, since60),
          ),
        )
        .orderBy(desc(schema.leaveRequests.createdAt))
        .limit(10),
      db.query.shifts.findFirst({
        where: eq(schema.shifts.userId, user.id),
        orderBy: [desc(schema.shifts.punchedInAt)],
      }),
    ])

    return NextResponse.json({
      user: {
        id: user.id,
        login: user.login,
        name: user.name,
        email: user.email,
        avatarUrl: user.avatarUrl,
        characterKey: user.characterKey,
        hasGithub: !!user.accessToken,
        lastSyncedAt: user.lastSyncedAt?.toISOString() ?? null,
        lastSyncError: user.lastSyncError,
      },
      role: membership.role,
      narrative: latestNarrative
        ? {
            body: latestNarrative.body,
            signal: latestNarrative.signal,
            createdAt: latestNarrative.createdAt.toISOString(),
            provider: latestNarrative.provider,
            model: latestNarrative.model,
          }
        : null,
      story: todayStory
        ? {
            narrative: todayStory.narrative,
            scenes: todayStory.scenes,
            generatedAt: todayStory.generatedAt.toISOString(),
          }
        : null,
      githubEvents: ghEvents.map((e) => ({
        id: e.id,
        type: e.type,
        repo: e.repo,
        title: e.title,
        url: e.url,
        occurredAt: e.occurredAt.toISOString(),
      })),
      recentBreaks: recentBreaks.map((b) => ({
        id: b.id,
        category: b.category,
        reason: b.reason,
        startedAt: b.startedAt.toISOString(),
        endedAt: b.endedAt?.toISOString() ?? null,
        waitingOnUserId: b.waitingOnUserId,
        waitingOnExternal: b.waitingOnExternal,
      })),
      recentLeaves: recentLeaves.map((l) => ({
        id: l.id,
        startDate: l.startDate,
        endDate: l.endDate,
        leaveType: l.leaveType,
        reason: l.reason,
        status: l.status,
        decidedNote: l.decidedNote,
      })),
      latestShift: latestShift
        ? {
            id: latestShift.id,
            punchedInAt: latestShift.punchedInAt.toISOString(),
            punchedOutAt: latestShift.punchedOutAt?.toISOString() ?? null,
            workSummary: latestShift.workSummary,
            verificationStatus: latestShift.verificationStatus,
            verificationScore: latestShift.verificationScore,
          }
        : null,
    })
  } catch (err) {
    if (err instanceof HttpError) {
      return NextResponse.json({ error: err.message }, { status: err.status })
    }
    console.error('member detail failed', err)
    return NextResponse.json({ error: 'internal' }, { status: 500 })
  }
}
