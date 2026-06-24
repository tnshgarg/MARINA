import type { ChatMessage } from '@/lib/ai/provider'
import { generateWithFallback } from '@/lib/ai/registry'
import { buildUserWork, workContextForLlm } from '@/lib/people/work'
import { deriveWins, type Win } from '@/lib/wins/detect'

/**
 * The career coach — "how do I get to the next level?", grounded in the user's
 * OWN longitudinal activity + a leveling rubric. This is the deliberately
 * un-ChatGPT-able part: a stateless model can give generic advice, but it can't
 * see six months of your real shipped work, your review load, and the areas you
 * drive. We feed all of that in and ask for an honest, evidence-anchored read of
 * where you stand and exactly what would move you up — never invented.
 */

export type CoachDimension = {
  name: string
  status: 'at' | 'approaching' | 'below'
  note: string
}

export type CoachGap = { title: string; how: string }

export type CareerAssessment = {
  empty: boolean
  currentLevel: string
  nextLevel: string
  standing: string
  dimensions: CoachDimension[]
  gaps: CoachGap[]
  thisMonth: string[]
}

export type CoachResult = {
  wins: Win[]
  assessment: CareerAssessment
  provider?: string
}

// A compact, generic software-engineering ladder. Kept simple and honest — it's
// a lens, not a verdict. (A future version can swap in the company's own rubric.)
const RUBRIC = `Leveling ladder (software engineering), with the dimensions that move someone up:
- SCOPE: Junior = single tasks; Mid = whole features; Senior = whole systems/projects; Staff = cross-team initiatives.
- IMPACT: Junior = completes assigned work; Mid = ships reliably; Senior = measurable outcomes; Staff = org-level leverage.
- CRAFT: code quality, tests, reliability, sound technical decisions.
- COLLABORATION: code review, unblocking others, mentoring, clear communication.
- LEADERSHIP: driving direction, owning ambiguous areas, influencing without authority.`

function stripFence(s: string): string {
  return s.trim().replace(/^```(?:json)?/i, '').replace(/```$/i, '').trim()
}

const EMPTY: CareerAssessment = {
  empty: true,
  currentLevel: '',
  nextLevel: '',
  standing: '',
  dimensions: [],
  gaps: [],
  thisMonth: [],
}

export async function buildCareerAssessment(userId: number, name: string): Promise<CoachResult> {
  // A wide window — the coach reasons over months, not a week.
  const work = await buildUserWork(userId, 180)
  const wins = deriveWins(work)
  const activity = work.prs.length + work.reviewsGiven.length + work.commitCount

  if (activity === 0) {
    return { wins, assessment: EMPTY }
  }

  const context = workContextForLlm(name, work)
  const system: ChatMessage = {
    role: 'system',
    content:
      'You are a candid, supportive engineering career coach. You help an individual contributor understand where they ' +
      'stand against a leveling ladder and exactly what would move them to the next level. ' +
      'CRITICAL RULES: (1) Reason ONLY from the activity provided — never invent work, scope, or impact. ' +
      '(2) You can only see GitHub signals (commits, PRs, reviews) — acknowledge that this is a partial view and do not ' +
      'overclaim. (3) Be specific and honest, not flattering: if the visible evidence is thin, say so and aim lower. ' +
      '(4) Every dimension note and gap must reference real evidence from the data. ' +
      'Return STRICT JSON: {"currentLevel": string, "nextLevel": string, "standing": string, ' +
      '"dimensions": [{"name": string, "status": "at"|"approaching"|"below", "note": string}], ' +
      '"gaps": [{"title": string, "how": string}], "thisMonth": [string]}. ' +
      'currentLevel/nextLevel use the ladder labels (Junior, Mid, Senior, Staff). status is relative to the NEXT level. ' +
      'Provide one dimension entry for each of: Scope, Impact, Craft, Collaboration, Leadership.',
  }
  const user: ChatMessage = {
    role: 'user',
    content: [
      RUBRIC,
      '',
      `Here is ${name}'s real engineering activity over the last 180 days (the only evidence available):`,
      '',
      context,
      '',
      wins.length ? `Notable wins detected: ${wins.map((w) => `"${w.title}"`).join(', ')}` : 'No standout wins detected.',
      '',
      'Assess honestly:',
      '- "standing": one frank sentence on where they stand relative to the next level, in the second person ("You\'re…").',
      '- "dimensions": Scope, Impact, Craft, Collaboration, Leadership — status vs the NEXT level + a one-line evidence-based note each.',
      '- "gaps": the 2-3 things most holding them back from the next level, each with a concrete "how" to close it.',
      '- "thisMonth": 2-3 specific, doable actions this month that would build next-level evidence.',
      'Second person, honest, grounded in the evidence above. No invented accomplishments.',
    ].join('\n'),
  }

  try {
    const result = await generateWithFallback([system, user], { responseFormat: 'json', temperature: 0.4 })
    const p = JSON.parse(stripFence(result.text)) as Partial<CareerAssessment>
    return {
      wins,
      provider: result.provider,
      assessment: {
        empty: false,
        currentLevel: (p.currentLevel ?? '').trim(),
        nextLevel: (p.nextLevel ?? '').trim(),
        standing: (p.standing ?? '').trim(),
        dimensions: (p.dimensions ?? [])
          .filter((d) => d && d.name)
          .slice(0, 5)
          .map((d) => ({
            name: String(d.name).trim(),
            status: (['at', 'approaching', 'below'] as const).includes(d.status as 'at') ? (d.status as CoachDimension['status']) : 'below',
            note: String(d.note ?? '').trim(),
          })),
        gaps: (p.gaps ?? []).filter((g) => g && g.title).slice(0, 3).map((g) => ({ title: String(g.title).trim(), how: String(g.how ?? '').trim() })),
        thisMonth: (p.thisMonth ?? []).map((s) => String(s).trim()).filter(Boolean).slice(0, 3),
      },
    }
  } catch (err) {
    console.error('[coach] assessment failed', err)
    // Deterministic, honest fallback so the feature never hard-fails.
    return {
      wins,
      assessment: {
        empty: false,
        currentLevel: '',
        nextLevel: '',
        standing: `Based on your visible GitHub work: ${work.prs.length} PRs (${work.prCounts.merged} merged), ${work.reviewsGiven.length} reviews and ${work.commitCount} commits across ${work.commitRepos.length} repos.`,
        dimensions: [],
        gaps: [],
        thisMonth: ['Connect more of your work so the coach can give you a fuller read.'],
      },
    }
  }
}
