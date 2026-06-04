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
    commitsByRepo: groupByRepo(grouped.commits),
    pullRequests: grouped.prs.map((e) => ({ repo: e.repo, title: e.title })),
    reviewsByRepo: groupByRepo(grouped.reviews),
    issuesClosed: grouped.issues.map((e) => ({ repo: e.repo, title: e.title })),
  }

  const system: ChatMessage = {
    role: 'system',
    content:
      'You are an AI Chief of Staff that writes brief, factual work narratives for engineering managers. ' +
      'You only describe what the data shows. You never speculate about effort, motivation, or personal life. ' +
      'You always return strict JSON matching the schema given by the user.',
  }

  const user: ChatMessage = {
    role: 'user',
    content: [
      'Given the following structured GitHub activity for one engineer over the last 7 days, write a daily-style narrative.',
      '',
      'Return JSON with exactly these fields:',
      '{',
      '  "body": "3 to 5 sentence paragraph summarising the work in plain English",',
      '  "signal": "High" | "Steady" | "Low" | "Blocked",',
      '  "blockers": ["short bullet-style inferred blockers, e.g. \'No commits in 3 days on repo-x despite open PR\'. Empty array if none."]',
      '}',
      '',
      'Signal rules:',
      '- High: significant output across multiple repos, including merged PRs / reviews.',
      '- Steady: regular output, normal week.',
      '- Low: very little measurable activity.',
      '- Blocked: activity suggests they tried (e.g. opened a PR) but downstream signals are missing (no merges, no reviews received).',
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
