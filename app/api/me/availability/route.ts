import { NextResponse } from 'next/server'
import { auth } from '@/auth'
import { db, schema } from '@/lib/db/client'
import { getAvailability } from '@/lib/booking/availability'

export const runtime = 'nodejs'

/** The signed-in user's booking availability (Calendly-style work window). */
export async function GET() {
  const session = await auth()
  if (!session?.appUserId) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const availability = await getAvailability(session.appUserId)
  return NextResponse.json({ ok: true, availability })
}

export async function PATCH(req: Request) {
  const session = await auth()
  if (!session?.appUserId) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  let body: {
    workDays?: unknown
    startMin?: unknown
    endMin?: unknown
    slotMin?: unknown
    timezone?: unknown
  } = {}
  try {
    body = (await req.json()) as typeof body
  } catch {
    /* defaults */
  }

  const patch: Partial<typeof schema.userSettings.$inferInsert> = { updatedAt: new Date() }

  if (Array.isArray(body.workDays)) {
    patch.bookingWorkDays = [
      ...new Set(
        body.workDays.map((d) => Number(d)).filter((d) => Number.isInteger(d) && d >= 0 && d <= 6),
      ),
    ].sort((a, b) => a - b)
  }

  const clampMin = (v: unknown): number | undefined => {
    const n = Number(v)
    return Number.isFinite(n) ? Math.max(0, Math.min(1440, Math.round(n))) : undefined
  }
  const start = clampMin(body.startMin)
  const end = clampMin(body.endMin)
  if (start !== undefined && end !== undefined && start >= end) {
    return NextResponse.json({ error: 'start_must_be_before_end' }, { status: 400 })
  }
  if (start !== undefined) patch.bookingStartMin = start
  if (end !== undefined) patch.bookingEndMin = end

  if (typeof body.slotMin !== 'undefined') {
    const n = Number(body.slotMin)
    if ([15, 30, 45, 60].includes(n)) patch.bookingSlotMin = n
  }
  if (typeof body.timezone === 'string' && body.timezone.length > 0 && body.timezone.length <= 64) {
    patch.bookingTimezone = body.timezone
  }

  await db
    .insert(schema.userSettings)
    .values({ userId: session.appUserId, ...patch })
    .onConflictDoUpdate({ target: schema.userSettings.userId, set: patch })

  const availability = await getAvailability(session.appUserId)
  return NextResponse.json({ ok: true, availability })
}
