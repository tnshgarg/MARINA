import type { GithubEvent } from '@/lib/db/schema'
import type { ChatMessage } from './provider'

export type NarrativeInput = {
  userLogin: string
  periodStart: Date
  periodEnd: Date
  events: GithubEvent[]
}

export type NarrativeOutput = {
  body: string
  signal: 'High' | 'Steady' | 'Low' | 'Blocked'
  blockers: string[]
}

export function buildNarrativeMessages(input: NarrativeInput): ChatMessage[] {
  const grouped = groupEvents(input.events)
  const structured = {
    user: input.userLogin,
    period: {
      start: input.periodStart.toISOString().slice(0, 10),
      end: input.periodEnd.toISOString().slice(0, 10),
    },
    totals: {
      commits: grouped.commits.length,
      pullRequestsOpened: grouped.prs.length,
      reviewsGiven: grouped.reviews.length,
      issuesClosed: grouped.issues.length,
    },
    // Include URLs so the LLM can extract PR numbers from the path (e.g. /pull/482).
    commitsByRepo: groupByRepo(grouped.commits),
    pullRequests: grouped.prs.map((e) => ({
      repo: e.repo,
      title: e.title,
      number: extractIssueNumber(e.url),
      url: e.url,
    })),
    reviewsByRepo: groupByRepo(grouped.reviews),
    issuesClosed: grouped.issues.map((e) => ({
      repo: e.repo,
      title: e.title,
      number: extractIssueNumber(e.url),
      url: e.url,
    })),
  }

  const system: ChatMessage = {
    role: 'system',
    content:
      'You are an AI Chief of Staff that writes factual, concrete work narratives for engineering managers. ' +
      'You only describe what the data shows. You never speculate about effort, motivation, or personal life. ' +
      'Be SPECIFIC — name PR titles, PR numbers, repo names, and commit subjects when surfacing them. ' +
      'Prefer "PR #482 (acme/web) — Fix double-submit on leave form" over "made a PR." ' +
      'You always return strict JSON matching the schema given by the user.',
  }

  const user: ChatMessage = {
    role: 'user',
    content: [
      "Write a brief for this engineer's last 7 days. Be specific — name the work, don't just count it.",
      '',
      'Return JSON with exactly these fields:',
      '{',
      '  "body": "3 to 5 sentence paragraph. Quote 1-3 PR / commit titles by name when relevant. If you reference a PR, include the number like \\"PR #482\\". Name the repos.",',
      '  "signal": "High" | "Steady" | "Low" | "Blocked",',
      '  "blockers": ["short bullet-style inferred blockers, e.g. \'PR #482 has been open 4 days without review\'. Empty array if none."]',
      '}',
      '',
      'Signal rules:',
      '- High: significant output across multiple repos, including merged PRs / reviews.',
      '- Steady: regular output, normal week.',
      '- Low: very little measurable activity.',
      '- Blocked: activity suggests they tried (e.g. opened a PR) but downstream signals are missing (no merges, no reviews received).',
      '',
      'Style:',
      '- Reference specific PRs by number and title — e.g., "shipped PR #482 (acme/web) fixing double-submit on the leave form".',
      '- Reference repos by name — "acme/web", "acme/api".',
      '- Group commits when there are many ("9 commits across acme/web focused on auth refactor").',
      '- Do NOT add filler sentences like "The work was spread across multiple repos" — just describe the work.',
      '- If a PR has no merge or review, surface that as a likely blocker.',
      '',
      'Data:',
      '```json',
      JSON.stringify(structured, null, 2),
      '```',
    ].join('\n'),
  }

  return [system, user]
}

export function parseNarrative(text: string): NarrativeOutput {
  const cleaned = stripJsonFence(text).trim()
  let parsed: unknown
  try {
    parsed = JSON.parse(cleaned)
  } catch {
    return { body: text.trim(), signal: 'Steady', blockers: [] }
  }
  const p = parsed as Partial<NarrativeOutput>
  return {
    body: typeof p.body === 'string' ? p.body : '',
    signal: ['High', 'Steady', 'Low', 'Blocked'].includes(p.signal as string) ? (p.signal as NarrativeOutput['signal']) : 'Steady',
    blockers: Array.isArray(p.blockers) ? p.blockers.filter((b) => typeof b === 'string') : [],
  }
}

function stripJsonFence(s: string): string {
  return s.replace(/^```(?:json)?/i, '').replace(/```$/i, '')
}

function groupEvents(events: GithubEvent[]) {
  return {
    commits: events.filter((e) => e.type === 'commit'),
    prs: events.filter((e) => e.type === 'pr_opened'),
    reviews: events.filter((e) => e.type === 'pr_reviewed'),
    issues: events.filter((e) => e.type === 'issue_closed'),
  }
}

/**
 * Pull the PR / issue number out of a GitHub URL.
 * Handles: /pull/123, /issues/456, /pulls/789
 */
function extractIssueNumber(url: string): number | null {
  const m = url.match(/\/(?:pull|pulls|issues)\/(\d+)/)
  return m ? Number(m[1]) : null
}

function groupByRepo(events: GithubEvent[]): Array<{ repo: string; count: number; sample: string[] }> {
  const map = new Map<string, string[]>()
  for (const e of events) {
    const arr = map.get(e.repo) ?? []
    arr.push(e.title)
    map.set(e.repo, arr)
  }
  return [...map.entries()].map(([repo, titles]) => ({
    repo,
    count: titles.length,
    sample: titles.slice(0, 5),
  }))
}
