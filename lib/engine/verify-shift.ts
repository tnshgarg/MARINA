import { and, eq, gte, lte, sum } from 'drizzle-orm'
import { db, schema } from '@/lib/db/client'
import { generateWithFallback } from '@/lib/ai/registry'
import type { ShiftVerificationStatus, Shift } from '@/lib/db/schema'

export type VerifyResult = {
  status: ShiftVerificationStatus
  score: number // 0..100
  notes: string
  provider: string
  model: string
}

export type VerifyEvidence = {
  windowStartIso: string
  windowEndIso: string
  durationMinutes: number
  github: {
    commits: Array<{ repo: string; title: string }>
    prsOpened: Array<{ repo: string; title: string }>
    reviews: Array<{ repo: string; title: string }>
    issuesClosed: Array<{ repo: string; title: string }>
  }
  agent: {
    activeSeconds: number
    idleSeconds: number
    activeApps: Array<{ app: string; seconds: number }>
  }
  breaksMinutes: number
}

export async function buildEvidence(shift: Shift): Promise<VerifyEvidence> {
  const start = shift.punchedInAt
  const end = shift.punchedOutAt ?? new Date()

  const [events, activityTotals, topApps, breakRows] = await Promise.all([
    db
      .select()
      .from(schema.githubEvents)
      .where(
        and(
          eq(schema.githubEvents.userId, shift.userId),
          gte(schema.githubEvents.occurredAt, start),
          lte(schema.githubEvents.occurredAt, end)
        )
      ),
    db
      .select({
        activeSeconds: sum(schema.localActivity.activeSeconds).mapWith(Number),
        idleSeconds: sum(schema.localActivity.idleSeconds).mapWith(Number),
      })
      .from(schema.localActivity)
      .where(
        and(
          eq(schema.localActivity.userId, shift.userId),
          gte(schema.localActivity.windowStart, start),
          lte(schema.localActivity.windowStart, end)
        )
      ),
    db
      .select({
        app: schema.localActivity.activeApp,
        seconds: sum(schema.localActivity.activeSeconds).mapWith(Number),
      })
      .from(schema.localActivity)
      .where(
        and(
          eq(schema.localActivity.userId, shift.userId),
          gte(schema.localActivity.windowStart, start),
          lte(schema.localActivity.windowStart, end)
        )
      )
      .groupBy(schema.localActivity.activeApp),
    db
      .select()
      .from(schema.breaks)
      .where(
        and(
          eq(schema.breaks.userId, shift.userId),
          gte(schema.breaks.startedAt, start),
          lte(schema.breaks.startedAt, end)
        )
      ),
  ])

  const breakMs = breakRows.reduce((acc, b) => {
    const e = b.endedAt ?? end
    return acc + Math.max(0, e.getTime() - b.startedAt.getTime())
  }, 0)

  return {
    windowStartIso: start.toISOString(),
    windowEndIso: end.toISOString(),
    durationMinutes: Math.max(0, Math.round((end.getTime() - start.getTime()) / 60000)),
    github: {
      commits: events.filter((e) => e.type === 'commit').map((e) => ({ repo: e.repo, title: e.title })),
      prsOpened: events.filter((e) => e.type === 'pr_opened').map((e) => ({ repo: e.repo, title: e.title })),
      reviews: events.filter((e) => e.type === 'pr_reviewed').map((e) => ({ repo: e.repo, title: e.title })),
      issuesClosed: events.filter((e) => e.type === 'issue_closed').map((e) => ({ repo: e.repo, title: e.title })),
    },
    agent: {
      activeSeconds: Number(activityTotals[0]?.activeSeconds ?? 0),
      idleSeconds: Number(activityTotals[0]?.idleSeconds ?? 0),
      activeApps: topApps
        .map((a) => ({ app: a.app, seconds: Number(a.seconds ?? 0) }))
        .sort((a, b) => b.seconds - a.seconds)
        .slice(0, 8),
    },
    breaksMinutes: Math.round(breakMs / 60000),
  }
}

export async function verifyShiftSummary(
  shift: Shift,
  summary: string
): Promise<VerifyResult> {
  const evidence = await buildEvidence(shift)
  const messages = buildVerifierMessages(summary, evidence)

  try {
    const result = await generateWithFallback(
      messages,
      { responseFormat: 'json', temperature: 0.2 },
      undefined
    )
    const parsed = parseVerifierResponse(result.text)
    const status: ShiftVerificationStatus =
      parsed.score >= 70 ? 'verified' : parsed.score >= 40 ? 'unverified' : 'suspect'
    return {
      status,
      score: parsed.score,
      notes: parsed.notes,
      provider: result.provider,
      model: result.model,
    }
  } catch (err) {
    console.error('[verify-shift] AI verification failed', err)
    return {
      status: 'skipped',
      score: 0,
      notes: `AI verification unavailable: ${(err as Error).message ?? err}`,
      provider: 'none',
      model: 'none',
    }
  }
}

function buildVerifierMessages(summary: string, evidence: VerifyEvidence) {
  const system = {
    role: 'system' as const,
    content:
      'You are a workforce-intelligence verifier. Given an employee\'s end-of-shift work summary and the actual telemetry from their workstation + GitHub during the shift, score how truthful the summary is from 0 to 100.\n\n' +
      'Reasoning:\n' +
      '- Did the summary mention work types that match the telemetry? (code → IDE active + commits; design → design app active; meetings → comms apps)\n' +
      '- Are claimed deliverables actually present (e.g., "shipped PR X" appears in PRs opened)?\n' +
      '- Is the time accounted for? (durationMinutes - breaksMinutes ≈ activeSeconds + idleSeconds)\n' +
      '- Penalise vague summaries that don\'t match the telemetry.\n' +
      '- Reward summaries that explicitly cite work the telemetry confirms.\n\n' +
      'You always return strict JSON: { "score": int 0..100, "notes": "1-2 sentences explaining the score" }.\n' +
      'Be calibrated, not nice. A vague summary with no matching activity = score below 40.',
  }

  const user = {
    role: 'user' as const,
    content: [
      'EMPLOYEE WORK SUMMARY:',
      '```',
      summary.trim(),
      '```',
      '',
      'TELEMETRY:',
      '```json',
      JSON.stringify(evidence, null, 2),
      '```',
      '',
      'Return JSON only.',
    ].join('\n'),
  }

  return [system, user]
}

function parseVerifierResponse(text: string): { score: number; notes: string } {
  const cleaned = text.replace(/^```(?:json)?/i, '').replace(/```$/i, '').trim()
  try {
    const parsed = JSON.parse(cleaned) as { score?: unknown; notes?: unknown }
    let score = typeof parsed.score === 'number' ? Math.round(parsed.score) : 50
    if (!Number.isFinite(score)) score = 50
    score = Math.max(0, Math.min(100, score))
    const notes =
      typeof parsed.notes === 'string' ? parsed.notes.slice(0, 600) : 'No notes returned by AI.'
    return { score, notes }
  } catch {
    return { score: 50, notes: 'Could not parse AI response. Defaulted to 50.' }
  }
}
