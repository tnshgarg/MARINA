import { NextResponse } from 'next/server'
import { and, eq, isNull, isNotNull, lt, ne } from 'drizzle-orm'
import { db, schema } from '@/lib/db/client'
import { getBlobStore } from '@/lib/storage/blob'
import { authorizeCron } from '@/lib/cron/auth'
import { PLANS } from '@/lib/billing/plans'
import { log } from '@/lib/log/log'
import { closeStaleShifts } from '@/lib/shifts/close-stale'

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

  // Purge other stale rows that would otherwise accumulate forever.
  const magicCutoff = new Date(now.getTime() - 24 * 60 * 60 * 1000)
  const expiredMagic = await db
    .delete(schema.magicLinks)
    .where(lt(schema.magicLinks.expiresAt, magicCutoff))
    .returning({ id: schema.magicLinks.id })

  const pairCutoff = new Date(now.getTime() - 24 * 60 * 60 * 1000)
  const expiredPair = await db
    .delete(schema.pairingCodes)
    .where(lt(schema.pairingCodes.expiresAt, pairCutoff))
    .returning({ id: schema.pairingCodes.id })

  // Rate-limit events older than 24h
  const rlCutoff = new Date(now.getTime() - 24 * 60 * 60 * 1000)
  const expiredRl = await db
    .delete(schema.rateLimitEvents)
    .where(lt(schema.rateLimitEvents.occurredAt, rlCutoff))
    .returning({ id: schema.rateLimitEvents.id })

  // Notifications older than 30 days — manager already saw them or didn't.
  const notifCutoff = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
  const expiredNotif = await db
    .delete(schema.notifications)
    .where(lt(schema.notifications.createdAt, notifCutoff))
    .returning({ id: schema.notifications.id })

  // Analytics events older than 90 days — keeps the table from accumulating
  // forever. 90 days gives quarter-over-quarter comparisons without bloat.
  const analyticsCutoff = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000)
  const expiredAnalytics = await db
    .delete(schema.analyticsEvents)
    .where(lt(schema.analyticsEvents.createdAt, analyticsCutoff))
    .returning({ id: schema.analyticsEvents.id })
    .catch(() => [])

  // Downgrade expired NON-billed grants (e.g. early-bird codes) back to free.
  // Razorpay-billed orgs (billingProvider set) are governed by the webhook, so
  // we only touch manual grants whose trialEndsAt has lapsed. Without this an
  // early-bird plan grant was effectively permanent. Also reset the AI budget.
  const downgraded = await db
    .update(schema.orgs)
    .set({ plan: 'free', monthlyAiBudgetCents: PLANS.free.monthlyAiBudgetCents })
    .where(
      and(
        isNull(schema.orgs.billingProvider),
        isNotNull(schema.orgs.trialEndsAt),
        lt(schema.orgs.trialEndsAt, now),
        ne(schema.orgs.plan, 'free'),
      ),
    )
    .returning({ id: schema.orgs.id })
    .catch(() => [])

  // Close shifts left open too long so attendance/dashboards stay honest
  // (a forgotten punch-in shouldn't read as a 30-hour "working" day).
  const staleShiftsClosed = await closeStaleShifts(now).catch(() => 0)

  log.info('cron.sweep.done', {
    examined: expired.length,
    deleted,
    failed,
    magic: expiredMagic.length,
    pair: expiredPair.length,
    rl: expiredRl.length,
    notif: expiredNotif.length,
    analytics: expiredAnalytics.length,
    downgraded: downgraded.length,
    staleShiftsClosed,
  })
  return NextResponse.json({
    ok: true,
    examined: expired.length,
    deleted,
    failed,
    magicLinks: expiredMagic.length,
    pairingCodes: expiredPair.length,
    rateLimitEvents: expiredRl.length,
    notifications: expiredNotif.length,
    analyticsEvents: expiredAnalytics.length,
    downgraded: downgraded.length,
    staleShiftsClosed,
  })
}

function eqId(id: number) {
  return eq(schema.screenshots.id, id)
}
