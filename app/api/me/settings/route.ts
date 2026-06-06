import { NextResponse } from 'next/server'
import { eq } from 'drizzle-orm'
import { db, schema } from '@/lib/db/client'
import { HttpError, requireSession } from '@/lib/auth/guards'

export const runtime = 'nodejs'

async function ensureSettings(userId: number) {
  const existing = await db.query.userSettings.findFirst({
    where: eq(schema.userSettings.userId, userId),
  })
  if (existing) return existing
  const [row] = await db
    .insert(schema.userSettings)
    .values({ userId })
    .returning()
  return row
}

export async function GET() {
  try {
    const session = await requireSession()
    const s = await ensureSettings(session.appUserId)
    return NextResponse.json({
      ok: true,
      settings: {
        trackingPausedAt: s.trackingPausedAt?.toISOString() ?? null,
        windowTitlesEnabled: s.windowTitlesEnabled,
        consentAt: s.consentAt?.toISOString() ?? null,
        sampleIntervalSeconds: s.sampleIntervalSeconds,
        flushIntervalSeconds: s.flushIntervalSeconds,
      },
    })
  } catch (err) {
    return errResponse(err)
  }
}

type PatchBody = {
  paused?: boolean
  windowTitlesEnabled?: boolean
}

export async function PATCH(req: Request) {
  try {
    const session = await requireSession()
    const body = (await req.json().catch(() => ({}))) as PatchBody
    await ensureSettings(session.appUserId)

    const patch: Partial<typeof schema.userSettings.$inferInsert> = {
      updatedAt: new Date(),
    }
    if (typeof body.paused === 'boolean') {
      patch.trackingPausedAt = body.paused ? new Date() : null
    }
    if (typeof body.windowTitlesEnabled === 'boolean') {
      patch.windowTitlesEnabled = body.windowTitlesEnabled
    }

    const [updated] = await db
      .update(schema.userSettings)
      .set(patch)
      .where(eq(schema.userSettings.userId, session.appUserId))
      .returning()

    return NextResponse.json({
      ok: true,
      settings: {
        trackingPausedAt: updated.trackingPausedAt?.toISOString() ?? null,
        windowTitlesEnabled: updated.windowTitlesEnabled,
        consentAt: updated.consentAt?.toISOString() ?? null,
        sampleIntervalSeconds: updated.sampleIntervalSeconds,
        flushIntervalSeconds: updated.flushIntervalSeconds,
      },
    })
  } catch (err) {
    return errResponse(err)
  }
}

function errResponse(err: unknown) {
  if (err instanceof HttpError) {
    return NextResponse.json({ error: err.message }, { status: err.status })
  }
  console.error('settings route failed', err)
  return NextResponse.json({ error: 'internal' }, { status: 500 })
}
