import { and, desc, eq, gte, isNull } from 'drizzle-orm'
import { db, schema } from '@/lib/db/client'
import { buildMemberWork } from '@/lib/people/work'

/**
 * Pre-fill text for `/marina standup` — Marina drafts "yesterday" and "blockers"
 * from real data so the user just adds "today" and edits. Reuses buildMemberWork
 * (deterministic GitHub read) + the user's recent deliverables + their active
 * blocker. Pure data → text; the modal/posting lives in the Slack adapter.
 */
export async function buildStandupPrefill(
  orgId: number,
  userId: number,
): Promise<{ yesterday: string; blockers: string }> {
  const work = await buildMemberWork(orgId, userId, 1)

  const since = new Date(Date.now() - 24 * 60 * 60 * 1000)
  const delivs = await db
    .select({ title: schema.deliverables.title })
    .from(schema.deliverables)
    .where(and(eq(schema.deliverables.userId, userId), gte(schema.deliverables.completedAt, since)))
    .orderBy(desc(schema.deliverables.completedAt))

  const lines: string[] = []
  if (work.commitCount > 0) {
    const titles = work.recentCommitTitles.slice(0, 3).join('; ')
    lines.push(`• ${work.commitCount} commit${work.commitCount > 1 ? 's' : ''}${titles ? ` — ${titles}` : ''}`)
  }
  for (const pr of work.prs.slice(0, 3)) lines.push(`• PR (${pr.status}): ${pr.title}`)
  if (work.reviewsGiven.length > 0) lines.push(`• ${work.reviewsGiven.length} review${work.reviewsGiven.length > 1 ? 's' : ''} given`)
  for (const d of delivs.slice(0, 3)) lines.push(`• ${d.title}`)

  const blk = await db.query.breaks.findFirst({
    where: and(
      eq(schema.breaks.userId, userId),
      eq(schema.breaks.category, 'blocked'),
      isNull(schema.breaks.endedAt),
    ),
  })

  return { yesterday: lines.join('\n'), blockers: blk?.reason ?? '' }
}
