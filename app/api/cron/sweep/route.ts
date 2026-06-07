import { NextResponse } from 'next/server'
import { and, eq, isNull, lt } from 'drizzle-orm'
import { db, schema } from '@/lib/db/client'
import { getBlobStore } from '@/lib/storage/blob'
import { authorizeCron } from '@/lib/cron/auth'
import { log } from '@/lib/log/log'

export const runtime = 'nodejs'

export async function GET(req: Request) {
  if (!authorizeCron(req)) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  }
  return await sweep()
}

export async function POST(req: Request) {
  // Allow POST too so it can be triggered from a webhook / queue.
  if (!authorizeCron(req)) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  }
  return await sweep()
}

async function sweep() {
  const now = new Date()
  const expired = await db
    .select()
    .from(schema.screenshots)
    .where(
      and(
        lt(schema.screenshots.expiresAt, now),
        isNull(schema.screenshots.deletedAt)
      )
    )
    .limit(500)

  const blob = getBlobStore()
  let deleted = 0
  let failed = 0
  for (const shot of expired) {
    if (!shot.storageKey) {
      // Nothing to delete in storage; just mark.
      await db
        .update(schema.screenshots)
        .set({ deletedAt: new Date() })
        .where(eqId(shot.id))
      deleted++
      continue
    }
    try {
      await blob.delete(shot.storageKey)
      await db
        .update(schema.screenshots)
        .set({ deletedAt: new Date(), storageKey: null })
        .where(eqId(shot.id))
      deleted++
    } catch (err) {
      failed++
      log.error('cron.sweep.delete_failed', { id: shot.id, err: String(err) })
    }
  }
  log.info('cron.sweep.done', { examined: expired.length, deleted, failed })
  return NextResponse.json({ ok: true, examined: expired.length, deleted, failed })
}

function eqId(id: number) {
  return eq(schema.screenshots.id, id)
}
