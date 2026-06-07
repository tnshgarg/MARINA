import { and, desc, eq, gte, inArray } from 'drizzle-orm'
import { db, schema } from '@/lib/db/client'

/**
 * "Slacking" detection — surfaces employees whose recent screen activity
 * shows sustained non-work content (social media, streaming, etc.) during
 * a punched-in shift.
 *
 * Heuristic (deliberately conservative — we want low false positives):
 *   - Look at the last `windowMinutes` of screenshots that have an AI analysis
 *   - Member must be currently on-shift (we don't accuse off-clock employees)
 *   - Need at least `MIN_SCREENSHOTS` analysed shots in the window
 *   - "Unproductive" hint = appCategory in {media, browser_personal} OR
 *     visibleContentHint in {social_media, video_streaming}
 *   - Trigger if `unproductive / analysed >= UNPRODUCTIVE_RATIO`
 *
 * Returns a flat list of slack alerts the dashboard can render.
 */

export type SlackAlert = {
  userId: number
  minutes: number          // window we looked at
  unproductiveCount: number
  totalCount: number
  topHint: string          // dominant visibleContentHint
  topCategory: string      // dominant appCategory
}

const MIN_SCREENSHOTS = 3
const UNPRODUCTIVE_RATIO = 0.6

export async function detectSlackers(
  userIds: number[],
  onShiftUserIds: Set<number>,
  windowMinutes = 30,
): Promise<SlackAlert[]> {
  if (userIds.length === 0 || onShiftUserIds.size === 0) return []

  const onShiftIds = userIds.filter((id) => onShiftUserIds.has(id))
  if (onShiftIds.length === 0) return []

  const since = new Date(Date.now() - windowMinutes * 60_000)

  const rows = await db
    .select({
      userId: schema.shotAnalyses.userId,
      workAppLabel: schema.shotAnalyses.workAppLabel,
      appCategory: schema.shotAnalyses.appCategory,
      visibleContentHint: schema.shotAnalyses.visibleContentHint,
      analyzedAt: schema.shotAnalyses.analyzedAt,
    })
    .from(schema.shotAnalyses)
    .where(
      and(
        inArray(schema.shotAnalyses.userId, onShiftIds),
        gte(schema.shotAnalyses.analyzedAt, since),
      ),
    )
    .orderBy(desc(schema.shotAnalyses.analyzedAt))

  const byUser = new Map<
    number,
    {
      total: number
      unprod: number
      hintCounts: Map<string, number>
      categoryCounts: Map<string, number>
    }
  >()

  for (const r of rows) {
    let agg = byUser.get(r.userId)
    if (!agg) {
      agg = {
        total: 0,
        unprod: 0,
        hintCounts: new Map(),
        categoryCounts: new Map(),
      }
      byUser.set(r.userId, agg)
    }
    agg.total++

    const unproductive =
      r.appCategory === 'media' ||
      r.appCategory === 'browser_personal' ||
      r.visibleContentHint === 'social_media' ||
      r.visibleContentHint === 'video_streaming'
    if (unproductive) agg.unprod++

    agg.hintCounts.set(r.visibleContentHint, (agg.hintCounts.get(r.visibleContentHint) ?? 0) + 1)
    agg.categoryCounts.set(r.appCategory, (agg.categoryCounts.get(r.appCategory) ?? 0) + 1)
  }

  const alerts: SlackAlert[] = []
  for (const [userId, agg] of byUser) {
    if (agg.total < MIN_SCREENSHOTS) continue
    const ratio = agg.unprod / agg.total
    if (ratio < UNPRODUCTIVE_RATIO) continue

    alerts.push({
      userId,
      minutes: windowMinutes,
      unproductiveCount: agg.unprod,
      totalCount: agg.total,
      topHint: topOf(agg.hintCounts),
      topCategory: topOf(agg.categoryCounts),
    })
  }
  return alerts
}

function topOf(counts: Map<string, number>): string {
  let best = ''
  let bestN = 0
  for (const [k, n] of counts) {
    if (n > bestN) {
      best = k
      bestN = n
    }
  }
  return best
}
