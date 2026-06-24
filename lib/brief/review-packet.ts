import type { ChatMessage } from '@/lib/ai/provider'
import { generateWithFallback } from '@/lib/ai/registry'
import { buildUserWork, workContextForLlm, type MemberWork } from '@/lib/people/work'

/**
 * "Get credit for your work" — the brag-doc / review packet.
 *
 * Turns ONE person's real GitHub activity over a window into an evidence-backed
 * accomplishments summary they can paste into a performance review, a 1:1, or a
 * weekly update. Org-free (keyed by userId), so it serves both the solo employee
 * and an employee inside an org.
 *
 * The numbers are deterministic (straight from buildUserWork — never invented);
 * the LLM only writes the prose AROUND that evidence. The prompt forbids making
 * up work that isn't in the data.
 */

export type ReviewHighlight = { title: string; detail: string }

export type ReviewPacket = {
  rangeDays: number
  /** One-line, confident summary of the period. */
  headline: string
  /** A short paragraph the person could open a review with. */
  summary: string
  /** 3–6 concrete accomplishments, each grounded in real activity. */
  highlights: ReviewHighlight[]
  /** Areas of focus, e.g. "Payments", "Reliability". */
  themes: string[]
  /** Deterministic counts — the receipts. */
  stats: { commits: number; prs: number; merged: number; reviews: number; repos: number }
  /** Empty when there's no activity in range — the UI shows a connect/sync nudge. */
  empty: boolean
  provider?: string
  model?: string
}

function statsFrom(w: MemberWork): ReviewPacket['stats'] {
  const repos = new Set<string>()
  for (const c of w.commitRepos) repos.add(c.repo)
  for (const p of w.prs) repos.add(p.repo)
  return {
    commits: w.commitCount,
    prs: w.prs.length,
    merged: w.prCounts.merged,
    reviews: w.reviewsGiven.length,
    repos: repos.size,
  }
}

function stripFence(s: string): string {
  return s.trim().replace(/^```(?:json)?/i, '').replace(/```$/i, '').trim()
}

/** Builds the brag-doc for a user over `days`. Never throws on a bad LLM reply
 *  — falls back to a deterministic summary so the feature always returns. */
export async function buildReviewPacket(
  userId: number,
  name: string,
  days = 90,
): Promise<ReviewPacket> {
  const work = await buildUserWork(userId, days)
  const stats = statsFrom(work)
  const totalActivity = stats.commits + stats.prs + stats.reviews

  if (totalActivity === 0) {
    return {
      rangeDays: days,
      headline: '',
      summary: '',
      highlights: [],
      themes: [],
      stats,
      empty: true,
    }
  }

  const context = workContextForLlm(name, work)
  const system: ChatMessage = {
    role: 'system',
    content:
      "You are a writing assistant that helps an individual contributor get credit for the work they actually did. " +
      "You write in the first person, confident but never exaggerated. " +
      "CRITICAL: only describe work that appears in the provided activity data — never invent projects, impact, or numbers. " +
      "If the data is thin, write a shorter, honest summary rather than padding it. " +
      'You always return strict JSON matching this schema: ' +
      '{"headline": string, "summary": string, "highlights": [{"title": string, "detail": string}], "themes": [string]}.',
  }
  const user: ChatMessage = {
    role: 'user',
    content: [
      `Here is my real engineering activity over the last ${days} days:`,
      '',
      context,
      '',
      'Write my review/brag-doc as JSON:',
      '- "headline": one confident line summarising what I delivered this period.',
      '- "summary": one short paragraph (2–4 sentences) I could open a performance review with.',
      '- "highlights": 3–6 concrete accomplishments, each {title, detail}. Prefer shipped/merged work and reviews that unblocked others. Ground every detail in the data above.',
      '- "themes": 2–5 short area labels (e.g. "Payments", "Reliability", "Code review").',
      'First person ("I shipped…", "I reviewed…"). No invented metrics.',
    ].join('\n'),
  }

  try {
    const result = await generateWithFallback([system, user], { responseFormat: 'json', temperature: 0.4 })
    const parsed = JSON.parse(stripFence(result.text)) as {
      headline?: string
      summary?: string
      highlights?: Array<{ title?: string; detail?: string }>
      themes?: string[]
    }
    return {
      rangeDays: days,
      headline: (parsed.headline ?? '').trim(),
      summary: (parsed.summary ?? '').trim(),
      highlights: (parsed.highlights ?? [])
        .filter((h) => h && (h.title || h.detail))
        .slice(0, 6)
        .map((h) => ({ title: (h.title ?? '').trim(), detail: (h.detail ?? '').trim() })),
      themes: (parsed.themes ?? []).map((t) => String(t).trim()).filter(Boolean).slice(0, 5),
      stats,
      empty: false,
      provider: result.provider,
      model: result.model,
    }
  } catch (err) {
    // Deterministic fallback so the feature never hard-fails on a flaky LLM.
    console.error('[review-packet] generation failed, using fallback', err)
    const highlights: ReviewHighlight[] = []
    for (const p of work.prs.slice(0, 4)) {
      highlights.push({ title: p.title, detail: `${p.status} · ${p.repo}` })
    }
    if (work.reviewsGiven.length > 0) {
      highlights.push({
        title: `Reviewed ${work.reviewsGiven.length} pull request${work.reviewsGiven.length > 1 ? 's' : ''}`,
        detail: 'Helped unblock teammates through code review.',
      })
    }
    return {
      rangeDays: days,
      headline: `Shipped ${stats.merged} merged PR${stats.merged === 1 ? '' : 's'} and ${stats.commits} commit${stats.commits === 1 ? '' : 's'} across ${stats.repos} repo${stats.repos === 1 ? '' : 's'}.`,
      summary: `Over the last ${days} days I worked across ${stats.repos} repositories, opened ${stats.prs} pull request${stats.prs === 1 ? '' : 's'} (${stats.merged} merged) and gave ${stats.reviews} review${stats.reviews === 1 ? '' : 's'}.`,
      highlights,
      themes: work.commitRepos.slice(0, 4).map((c) => c.repo.split('/').pop() ?? c.repo),
      stats,
      empty: false,
    }
  }
}

/** Render a ReviewPacket as copy-pasteable markdown (for the "Copy" button). */
export function reviewPacketToMarkdown(p: ReviewPacket, name: string): string {
  const lines: string[] = []
  lines.push(`# ${name} — work summary (last ${p.rangeDays} days)`)
  lines.push('')
  if (p.headline) lines.push(`**${p.headline}**`, '')
  if (p.summary) lines.push(p.summary, '')
  if (p.highlights.length) {
    lines.push('## Highlights')
    for (const h of p.highlights) lines.push(`- **${h.title}** — ${h.detail}`)
    lines.push('')
  }
  if (p.themes.length) {
    lines.push(`**Focus areas:** ${p.themes.join(' · ')}`, '')
  }
  lines.push(
    `**By the numbers:** ${p.stats.commits} commits · ${p.stats.prs} PRs (${p.stats.merged} merged) · ${p.stats.reviews} reviews · ${p.stats.repos} repos`,
  )
  lines.push('', '_Generated with Marina_')
  return lines.join('\n')
}
