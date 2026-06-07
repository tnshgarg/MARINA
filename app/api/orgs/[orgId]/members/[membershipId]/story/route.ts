import { NextResponse } from 'next/server'
import { and, eq } from 'drizzle-orm'
import { db, schema } from '@/lib/db/client'
import { HttpError, requireMembership } from '@/lib/auth/guards'
import { buildStory } from '@/lib/engine/story'

export const runtime = 'nodejs'
export const maxDuration = 60

export async function POST(
  req: Request,
  ctx: { params: Promise<{ orgId: string; membershipId: string }> }
) {
  const { orgId: orgRaw, membershipId: midRaw } = await ctx.params
  const orgId = Number(orgRaw)
  const membershipId = Number(midRaw)
  if (!Number.isInteger(orgId) || !Number.isInteger(membershipId)) {
    return NextResponse.json({ error: 'invalid ids' }, { status: 400 })
  }

  try {
    await requireMembership(orgId, 'manager')

    const target = await db.query.memberships.findFirst({
      where: and(
        eq(schema.memberships.id, membershipId),
        eq(schema.memberships.orgId, orgId)
      ),
    })
    if (!target) return NextResponse.json({ error: 'member not found' }, { status: 404 })

    const url = new URL(req.url)
    const dayParam = url.searchParams.get('day')
    const date = dayParam ? new Date(dayParam) : new Date()
    if (Number.isNaN(date.getTime())) {
      return NextResponse.json({ error: 'invalid day' }, { status: 400 })
    }

    const story = await buildStory(target.userId, date)
    const isoDay = story.day

    const existing = await db.query.dailyStories.findFirst({
      where: and(eq(schema.dailyStories.userId, target.userId), eq(schema.dailyStories.day, isoDay)),
    })
    if (existing) {
      await db
        .update(schema.dailyStories)
        .set({
          narrative: story.narrative,
          scenes: story.scenes,
          provider: story.provider,
          model: story.model,
          generatedAt: new Date(),
        })
        .where(eq(schema.dailyStories.id, existing.id))
    } else {
      await db.insert(schema.dailyStories).values({
        userId: target.userId,
        day: isoDay,
        narrative: story.narrative,
        scenes: story.scenes,
        provider: story.provider,
        model: story.model,
      })
    }

    return NextResponse.json({ ok: true, story })
  } catch (err) {
    if (err instanceof HttpError) {
      return NextResponse.json({ error: err.message }, { status: err.status })
    }
    console.error('member story failed', err)
    return NextResponse.json({ error: 'internal', message: String(err) }, { status: 500 })
  }
}
