import { NextResponse } from 'next/server'
import { eq } from 'drizzle-orm'
import { db, schema } from '@/lib/db/client'
import { authorizeCron } from '@/lib/cron/auth'
import { reconcileAttendance, syncCalendar } from '@/lib/google/calendar'
import { log } from '@/lib/log/log'

export const runtime = 'nodejs'
export const maxDuration = 300

/**
 * Refresh calendar data for everyone who has connected Google Calendar.
 * Runs hourly during work hours in production. Idempotent.
 */
export async function GET(req: Request) {
  if (!authorizeCron(req)) return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  return run()
}
export async function POST(req: Request) {
  if (!authorizeCron(req)) return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  return run()
}

async function run() {
  const accts = await db
    .select({ userId: schema.accounts.userId })
    .from(schema.accounts)
    .where(eq(schema.accounts.provider, 'google'))

  let synced = 0
  let attended = 0
  const errors: Array<{ userId: number; error: string }> = []

  for (const a of accts) {
    try {
      const res = await syncCalendar(a.userId)
      if (res.error) {
        errors.push({ userId: a.userId, error: res.error })
      } else {
        synced++
      }
      const marked = await reconcileAttendance(a.userId).catch(() => 0)
      attended += marked
    } catch (err) {
      errors.push({ userId: a.userId, error: String(err) })
      log.error('cron.calendar.user_failed', { userId: a.userId, err: String(err) })
    }
  }
  log.info('cron.calendar.done', { synced, attended, errors: errors.length })
  return NextResponse.json({ ok: true, synced, attended, errors })
}
