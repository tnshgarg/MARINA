import { and, desc, eq, gte, inArray, like, not } from 'drizzle-orm'
import { db, schema } from '@/lib/db/client'

/**
 * Manager 1-on-1 prep brief. Pulls the last 14 days of evidence for a single
 * teammate and proposes:
 *   - 3 wins to acknowledge (positive reinforcement)
 *   - 2 risks to discuss (blockers, dips, suspect shifts)
 *   - 3 questions to ask (open-ended, grounded in real artifacts)
 *
 * Heuristic-only — no LLM call required. Sourced from githubEvents,
 * dailyStates, breaks, narratives, shifts. Fast (~200ms).
 *
 * Designed so the manager opens it 5 minutes before their 1:1 and has
 * something to say. The questions reference specific PRs / scenes so the
 * 1:1 feels prepared, not generic.
 */

const FOURTEEN_DAYS_MS = 14 * 24 * 60 * 60 * 1000

export type OneOnOneBrief = {
  user: { id: number; login: string; name: string | null }
  period: { start: string; end: string }
  wins: Array<{ title: string; detail: string; sourceUrl?: string }>
  risks: Array<{ title: string; detail: string; severity: 'low' | 'medium' | 'high' }>
  questions: string[]
  // For the "last 1:1" callback. Pulled from prior narratives blockers array.
  pastCommitments: string[]
  hasGithub: boolean
}

export async function buildOneOnOneBrief(userId: number): Promise<OneOnOneBrief | null> {
  const user = await db.query.users.findFirst({ where: eq(schema.users.id, userId) })
  if (!user) return null

  const now = new Date()
  const since = new Date(now.getTime() - FOURTEEN_DAYS_MS)

  const NOT_SEED = not(like(schema.githubEvents.externalId, 'seed-%'))

  const [events, narratives, blockerBreaks, recentShifts] = await Promise.all([
    db
      .select()
      .from(schema.githubEvents)
      .where(
        and(
          eq(schema.githubEvents.userId, userId),
          gte(schema.githubEvents.occurredAt, since),
          NOT_SEED,
        ),
      )
      .orderBy(desc(schema.githubEvents.occurredAt)),
    db
      .select()
      .from(schema.narratives)
      .where(
        and(
          eq(schema.narratives.userId, userId),
          gte(schema.narratives.createdAt, since),
        ),
      )
      .orderBy(desc(schema.narratives.createdAt)),
    db
      .select()
      .from(schema.breaks)
      .where(
        and(
          eq(schema.breaks.userId, userId),
          gte(schema.breaks.startedAt, since),
          eq(schema.breaks.category, 'blocked'),
        ),
      )
      .orderBy(desc(schema.breaks.startedAt)),
    db
      .select()
      .from(schema.shifts)
      .where(
        and(
          eq(schema.shifts.userId, userId),
          gte(schema.shifts.punchedInAt, since),
        ),
      )
      .orderBy(desc(schema.shifts.punchedInAt))
      .limit(15),
  ])

  const commits = events.filter((e) => e.type === 'commit')
  const prs = events.filter((e) => e.type === 'pr_opened')
  const reviews = events.filter((e) => e.type === 'pr_reviewed')
  const issues = events.filter((e) => e.type === 'issue_closed')

  const wins: OneOnOneBrief['wins'] = []
  const risks: OneOnOneBrief['risks'] = []
  const questions: string[] = []
  const pastCommitments: string[] = []

  /* -------- Wins -------- */
  if (prs.length > 0) {
    const top = prs[0]!
    wins.push({
      title: `Shipped ${prs.length} PR${prs.length === 1 ? '' : 's'} this fortnight`,
      detail: `Most recent: "${top.title}" (${top.repo})`,
      sourceUrl: top.url,
    })
  }
  if (reviews.length >= 3) {
    wins.push({
      title: `Gave ${reviews.length} reviews`,
      detail: `Strong teammate signal — they're unblocking others.`,
    })
  }
  if (commits.length >= 10) {
    const repos = uniq(commits.map((c) => c.repo))
    wins.push({
      title: `${commits.length} commits across ${repos.length} ${repos.length === 1 ? 'repo' : 'repos'}`,
      detail: repos.slice(0, 3).join(' · '),
    })
  }
  if (issues.length > 0) {
    wins.push({
      title: `Closed ${issues.length} issue${issues.length === 1 ? '' : 's'}`,
      detail: `Most recent: "${issues[0]!.title}"`,
      sourceUrl: issues[0]!.url,
    })
  }
  if (wins.length === 0 && user.accessToken) {
    wins.push({
      title: 'Quietly steady',
      detail: 'No standout artifacts in the last 14 days. Ask about non-GitHub work — design, planning, mentoring.',
    })
  }

  /* -------- Risks -------- */

  // Active blocker
  const activeBlock = blockerBreaks.find((b) => !b.endedAt)
  if (activeBlock) {
    risks.push({
      title: 'Blocked right now',
      detail: `Has been waiting since ${activeBlock.startedAt.toLocaleTimeString()}: ${activeBlock.reason ?? 'no reason given'}`,
      severity: 'high',
    })
    questions.push(`You've been blocked on "${truncate(activeBlock.reason ?? 'something', 80)}" — what would help you move forward today?`)
  }

  // Recurring blockers
  if (blockerBreaks.length >= 3) {
    risks.push({
      title: `${blockerBreaks.length} blocked breaks in 14 days`,
      detail: 'A pattern worth understanding — which dependency keeps surfacing?',
      severity: 'medium',
    })
  }

  // Suspect shifts
  const suspect = recentShifts.find((s) => s.verificationStatus === 'suspect')
  if (suspect) {
    risks.push({
      title: 'Suspect shift verification',
      detail: `AI verification scored ${suspect.verificationScore ?? '?'}/100 on ${suspect.punchedInAt.toLocaleDateString()}. Worth gentle clarification.`,
      severity: 'medium',
    })
  }

  // Stale PR — opened >5d ago with no reviewedBy event matching
  const reviewedUrls = new Set(reviews.map((r) => r.url))
  const stale = prs.filter(
    (p) =>
      now.getTime() - new Date(p.occurredAt).getTime() > 5 * 24 * 60 * 60 * 1000 &&
      !reviewedUrls.has(p.url),
  )
  if (stale[0]) {
    risks.push({
      title: 'PR sitting without review',
      detail: `"${stale[0].title}" (${stale[0].repo}) has been open ${Math.floor(
        (now.getTime() - new Date(stale[0].occurredAt).getTime()) / 86400000,
      )} days.`,
      severity: 'medium',
    })
    questions.push(`Your PR "${truncate(stale[0].title, 60)}" has been open a while — is it stuck on review, or are you intentionally holding it?`)
  }

  // Narrative trend — last narrative signal was Low or Blocked
  const lastNarrative = narratives[0]
  if (lastNarrative?.signal === 'Low') {
    risks.push({
      title: 'Recent brief reads "Low"',
      detail: 'Output dipped — could be context-switching, holiday, or stuck.',
      severity: 'low',
    })
  }
  if (lastNarrative?.blockers && Array.isArray(lastNarrative.blockers)) {
    for (const b of lastNarrative.blockers.slice(0, 2)) {
      pastCommitments.push(b)
    }
  }

  /* -------- Questions (always end with 3) -------- */
  if (questions.length < 3 && prs[0]) {
    questions.push(`How did "${truncate(prs[0].title, 60)}" land — anything you'd refactor in hindsight?`)
  }
  if (questions.length < 3 && commits.length > 0) {
    const topRepo = mode(commits.map((c) => c.repo))
    questions.push(`You've been deep in ${topRepo} — what's the next thing you want to ship there?`)
  }
  if (questions.length < 3) {
    questions.push("What's one thing slowing you down right now that I could help with?")
  }
  if (questions.length < 3) {
    questions.push('Is there a project or skill area you wish you had more space to learn?')
  }

  return {
    user: { id: user.id, login: user.login, name: user.name },
    period: {
      start: since.toISOString().slice(0, 10),
      end: now.toISOString().slice(0, 10),
    },
    wins: wins.slice(0, 3),
    risks: risks.slice(0, 3),
    questions: questions.slice(0, 3),
    pastCommitments: pastCommitments.slice(0, 3),
    hasGithub: !!user.accessToken,
  }
}

/* ---------------- helpers ---------------- */

function uniq<T>(arr: T[]): T[] {
  return Array.from(new Set(arr))
}
function mode(arr: string[]): string {
  const counts = new Map<string, number>()
  for (const v of arr) counts.set(v, (counts.get(v) ?? 0) + 1)
  let best = ''
  let bestN = -1
  for (const [k, n] of counts) {
    if (n > bestN) {
      best = k
      bestN = n
    }
  }
  return best
}
function truncate(s: string, n: number): string {
  return s.length > n ? s.slice(0, n - 1).trimEnd() + '…' : s
}
