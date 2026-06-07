import { NextResponse } from 'next/server'
import { HttpError, requireSession } from '@/lib/auth/guards'
import { reconcileAttendance, syncCalendar } from '@/lib/google/calendar'

export const runtime = 'nodejs'
export const maxDuration = 60

export async function POST() {
  try {
    const session = await requireSession()
    const result = await syncCalendar(session.appUserId)
    const marked = await reconcileAttendance(session.appUserId).catch(() => 0)
    return NextResponse.json({ ok: true, ...result, attendanceMarked: marked })
  } catch (err) {
    if (err instanceof HttpError) {
      return NextResponse.json({ error: err.message }, { status: err.status })
    }
    console.error('calendar/sync failed', err)
    return NextResponse.json({ error: 'internal' }, { status: 500 })
  }
}
