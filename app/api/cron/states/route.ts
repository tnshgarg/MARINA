import { NextResponse } from 'next/server'
import { db, schema } from '@/lib/db/client'
import { authorizeCron } from '@/lib/cron/auth'
import { upsertDailyState } from '@/lib/engine/state'
import { log } from '@/lib/log/log'

export const runtime = 'nodejs'
export const maxDuration = 60

export async function GET(req: Request) {
  if (!authorizeCron(req)) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  }
  return await run()
}

export async function POST(req: Request) {
  if (!authorizeCron(req)) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  }
  return await run()
}

async function run() {
  // Compute "yesterday in UTC" (cron runs early in the morning to summarise the
  // day that just finished). We also recompute "today" so partial-day reads
  // reflect the latest data.
  const today = new Date()
  const yesterday = new Date(today)
  yesterday.setUTCDate(yesterday.getUTCDate() - 1)

  const users = await db.select({ id: schema.users.id }).from(schema.users)
  let processed = 0
  const errors: Array<{ userId: number; error: string }> = []

  for (const u of users) {
    for (const day of [yesterday, today]) {
      try {
        await upsertDailyState(u.id, day)
        processed++
      } catch (err) {
        errors.push({ userId: u.id, error: String(err) })
        log.error('cron.states.user_failed', { userId: u.id, err: String(err) })
      }
    }
  }
  log.info('cron.states.done', { processed, errors: errors.length })
  return NextResponse.json({ ok: true, processed, errors })
}
