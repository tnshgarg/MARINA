import { NextResponse } from 'next/server'
import { and, eq } from 'drizzle-orm'
import { db, schema } from '@/lib/db/client'
import { HttpError, requireSession } from '@/lib/auth/guards'
import { buildStory } from '@/lib/engine/story'

export const runtime = 'nodejs'
export const maxDuration = 60

export async function POST(req: Request) {
  try {
    const session = await requireSession()
    const url = new URL(req.url)
    const dayParam = url.searchParams.get('day')
    const date = dayParam ? new Date(dayParam) : new Date()
    if (Number.isNaN(date.getTime())) {
      return NextResponse.json({ error: 'invalid day' }, { status: 400 })
    }

    const story = await buildStory(session.appUserId, date)

    // Upsert into cache table
    const isoDay = story.day
    const existing = await db.query.dailyStories.findFirst({
      where: and(eq(schema.dailyStories.userId, session.appUserId), eq(schema.dailyStories.day, isoDay)),
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
        userId: session.appUserId,
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
    console.error('story gen failed', err)
    return NextResponse.json({ error: 'internal', message: String(err) }, { status: 500 })
  }
}

export async function GET(req: Request) {
  try {
    const session = await requireSession()
    const url = new URL(req.url)
    const dayParam = url.searchParams.get('day')
    const date = dayParam ? new Date(dayParam) : new Date()
    if (Number.isNaN(date.getTime())) {
      return NextResponse.json({ error: 'invalid day' }, { status: 400 })
    }
    const isoDay = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`

    const cached = await db.query.dailyStories.findFirst({
      where: and(eq(schema.dailyStories.userId, session.appUserId), eq(schema.dailyStories.day, isoDay)),
    })

    if (cached) {
      return NextResponse.json({
        ok: true,
        story: {
          day: cached.day,
          narrative: cached.narrative,
          scenes: cached.scenes,
          provider: cached.provider,
          model: cached.model,
          generatedAt: cached.generatedAt.toISOString(),
        },
        cached: true,
      })
    }

    return NextResponse.json({ ok: true, story: null, cached: false })
  } catch (err) {
    if (err instanceof HttpError) {
      return NextResponse.json({ error: err.message }, { status: err.status })
    }
    console.error('story get failed', err)
    return NextResponse.json({ error: 'internal' }, { status: 500 })
  }
}
