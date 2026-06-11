import { NextResponse } from 'next/server'
import { asc, eq, gt } from 'drizzle-orm'
import { db, schema } from '@/lib/db/client'
import { authorizeCron } from '@/lib/cron/auth'
import { upsertDailyState } from '@/lib/engine/state'
import { log } from '@/lib/log/log'

export const runtime = 'nodejs'
export const maxDuration = 300

const BATCH_SIZE = 40
const TIME_BUDGET_MS = 240_000
const JOB = 'states:rolling'

type Cursor = { day: string; lastUserId: number }

export async function GET(req: Request) {
  if (!authorizeCron(req)) return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  return run()
}
export async function POST(req: Request) {
  if (!authorizeCron(req)) return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  return run()
}

async function run() {
  const started = Date.now()
  const today = new Date()
  const yesterday = new Date(today)
  yesterday.setUTCDate(yesterday.getUTCDate() - 1)
  const todayKey = isoDay(today)

  const cursorRow = await db.query.jobCursors.findFirst({
    where: eq(schema.jobCursors.job, JOB),
  })
  let prevCursor: Cursor | null = null
  try {
    if (cursorRow?.cursor) prevCursor = JSON.parse(cursorRow.cursor) as Cursor
  } catch {
    prevCursor = null
  }
  const startAfterId = prevCursor && prevCursor.day === todayKey ? prevCursor.lastUserId : 0

  const users = await db
    .select({ id: schema.users.id })
    .from(schema.users)
    .where(gt(schema.users.id, startAfterId))
    .orderBy(asc(schema.users.id))
    .limit(BATCH_SIZE)

  let processed = 0
  let lastUserId = startAfterId
  const errors: Array<{ userId: number; error: string }> = []

  for (const u of users) {
    if (Date.now() - started > TIME_BUDGET_MS) break
    for (const day of [yesterday, today]) {
      try {
        await upsertDailyState(u.id, day)
        processed++
      } catch (err) {
        errors.push({ userId: u.id, error: String(err) })
        log.error('cron.states.user_failed', { userId: u.id, err: String(err) })
      }
    }
    lastUserId = u.id
  }

  const drained = users.length < BATCH_SIZE
  const nextCursor: Cursor = drained
    ? { day: todayKey, lastUserId: 0 }
    : { day: todayKey, lastUserId }

  await db
    .insert(schema.jobCursors)
    .values({ job: JOB, cursor: JSON.stringify(nextCursor), updatedAt: new Date() })
    .onConflictDoUpdate({
      target: schema.jobCursors.job,
      set: { cursor: JSON.stringify(nextCursor), updatedAt: new Date() },
    })

  log.info('cron.states.done', { processed, errors: errors.length, drained })
  return NextResponse.json({ ok: true, processed, errors, drained, nextCursor })
}

function isoDay(d: Date): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`
}
