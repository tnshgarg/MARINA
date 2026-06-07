import { NextResponse } from 'next/server'
import { db, schema } from '@/lib/db/client'
import { authorizeCron } from '@/lib/cron/auth'
import { buildStory } from '@/lib/engine/story'
import { log } from '@/lib/log/log'

export const runtime = 'nodejs'
export const maxDuration = 300 // Story gen can take a while across the org

/**
 * Nightly story generator. Runs after `cron/states` and ensures every user has
 * a daily story for yesterday — even if they never punched out cleanly. Idempotent
 * (buildStory upserts on (userId, day)).
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
  const yesterday = new Date()
  yesterday.setUTCDate(yesterday.getUTCDate() - 1)

  const users = await db.select({ id: schema.users.id }).from(schema.users)
  let processed = 0
  const errors: Array<{ userId: number; error: string }> = []

  // Sequential to avoid hammering the LLM provider; budget ~5min for the whole org.
  for (const u of users) {
    try {
      await buildStory(u.id, yesterday)
      processed++
    } catch (err) {
      errors.push({ userId: u.id, error: String(err) })
      log.error('cron.stories.user_failed', { userId: u.id, err: String(err) })
    }
  }
  log.info('cron.stories.done', { processed, errors: errors.length })
  return NextResponse.json({ ok: true, processed, errors })
}
