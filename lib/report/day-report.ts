import { and, desc, eq, gte, lt } from 'drizzle-orm'
import { db, schema } from '@/lib/db/client'

/**
 * "Prove your day" — the report that's always already written.
 *
 * Deterministically assembles ONE person's real workday over a window from the
 * three things we already capture: GitHub activity, calendar meetings, and the
 * deliverables they logged (incl. non-code work). No LLM, no invention — it's
 * their actual day, formatted for a standup / 1:1 / status update and ready to
 * paste into Slack, copy as markdown, or print to PDF. Org-free.
 */

export type ReportFormat = 'standup' | 'oneonone' | 'status'

export type DayReport = {
  fromIso: string
  toIso: string
  label: string
  format: ReportFormat
  shipped: Array<{ title: string; repo: string; status?: string; url: string }>
  commitTitles: string[]
  reviews: Array<{ title: string; repo: string; url: string }>
  meetings: Array<{ title: string; minutes: number; when: string; with: string[]; url: string | null }>
  deliverables: Array<{ title: string; detail: string | null; kind: string | null }>
  counts: { commits: number; prs: number; reviews: number; meetings: number; deliverables: number }
  empty: boolean
  markdown: string
  slack: string
}

const FORMAT_TITLE: Record<ReportFormat, string> = {
  standup: 'Standup',
  oneonone: '1:1 update',
  status: 'Status update',
}

function fmtMins(start: Date, end: Date): number {
  return Math.max(0, Math.round((end.getTime() - start.getTime()) / 60000))
}

/** "priya.nair@acme.com" → "Priya Nair" for the "who you met with" line. */
function emailToName(email: string): string {
  const local = (String(email).split('@')[0] ?? email).trim()
  if (!local) return ''
  return local.replace(/[._-]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
}

export async function buildDayReport(
  userId: number,
  from: Date,
  to: Date,
  format: ReportFormat,
  label: string,
): Promise<DayReport> {
  const [events, meetingRows, delivRows] = await Promise.all([
    db
      .select()
      .from(schema.githubEvents)
      .where(and(eq(schema.githubEvents.userId, userId), gte(schema.githubEvents.occurredAt, from), lt(schema.githubEvents.occurredAt, to)))
      .orderBy(desc(schema.githubEvents.occurredAt)),
    db
      .select()
      .from(schema.meetings)
      .where(and(eq(schema.meetings.userId, userId), gte(schema.meetings.startAt, from), lt(schema.meetings.startAt, to)))
      .orderBy(schema.meetings.startAt),
    db
      .select()
      .from(schema.deliverables)
      .where(and(eq(schema.deliverables.userId, userId), gte(schema.deliverables.completedAt, from), lt(schema.deliverables.completedAt, to)))
      .orderBy(desc(schema.deliverables.completedAt)),
  ])

  // Respect the user's tracked-repos allowlist (empty = include everything), so
  // personal projects can be kept out of a work report.
  const settings = await db.query.userSettings.findFirst({ where: eq(schema.userSettings.userId, userId) })
  const tracked = (settings?.trackedRepos ?? []).map((r) => r.toLowerCase().trim()).filter(Boolean)
  const repoAllowed = (repo: string) => tracked.length === 0 || tracked.some((t) => repo.toLowerCase().includes(t))
  const ghEvents = events.filter((e) => repoAllowed(e.repo))

  const commits = ghEvents.filter((e) => e.type === 'commit')
  const prEvents = ghEvents.filter((e) => e.type === 'pr_opened')
  const reviewEvents = ghEvents.filter((e) => e.type === 'pr_reviewed')

  const shipped = prEvents.map((e) => ({
    title: e.title,
    repo: e.repo,
    status: (e.raw as { status?: string } | null)?.status,
    url: e.url,
  }))
  // Distinct commit subjects — the detail behind the count, not just a number.
  const commitTitles = [...new Set(commits.map((c) => c.title.trim()).filter((t) => t.length > 2))].slice(0, 8)
  const reviews = reviewEvents.map((e) => ({ title: e.title.replace(/^Reviewed:\s*/i, ''), repo: e.repo, url: e.url }))
  const meetings = meetingRows.map((m) => ({
    title: m.title,
    minutes: fmtMins(m.startAt, m.endAt),
    when: m.startAt.toISOString(),
    with: (m.attendees ?? []).map(emailToName).filter(Boolean).slice(0, 5),
    url: m.conferenceUrl ?? null,
  }))
  const deliverables = delivRows.map((d) => ({ title: d.title, detail: d.detail, kind: d.kind }))

  const counts = {
    commits: commits.length,
    prs: prEvents.length,
    reviews: reviews.length,
    meetings: meetings.length,
    deliverables: deliverables.length,
  }
  const empty = commits.length + counts.prs + counts.reviews + counts.meetings + counts.deliverables === 0

  // ── Markdown ──
  const md: string[] = [`# ${FORMAT_TITLE[format]} — ${label}`, '']
  if (shipped.length) {
    md.push('## Pull requests')
    for (const s of shipped) md.push(`- [${s.status ?? 'open'}] ${s.title} (${s.repo})`)
    md.push('')
  }
  if (commitTitles.length) {
    md.push('## Commits', ...commitTitles.map((t) => `- ${t}`))
    if (commits.length > commitTitles.length) md.push(`- …and ${commits.length - commitTitles.length} more`)
    md.push('')
  } else if (commits.length) {
    md.push('## Commits', `- ${commits.length} commit${commits.length === 1 ? '' : 's'}`, '')
  }
  if (reviews.length) {
    md.push('## Reviews given', ...reviews.map((r) => `- ${r.title} (${r.repo})`), '')
  }
  if (deliverables.length) {
    md.push('## Other deliverables', ...deliverables.map((d) => `- ${d.title}${d.detail ? ` — ${d.detail}` : ''}`), '')
  }
  if (meetings.length) {
    md.push('## Meetings', ...meetings.map((m) => `- ${m.minutes}m · ${m.title}${m.with.length ? ` (with ${m.with.join(', ')})` : ''}`), '')
  }
  if (format === 'oneonone') md.push('## To raise', '- (add anything you want to discuss)', '')
  md.push(`_${counts.commits} commits · ${counts.prs} PRs · ${counts.reviews} reviews · ${counts.meetings} meetings · ${counts.deliverables} other_`)
  md.push('', '_Generated with Marina_')

  // ── Slack — clean plain text. Slack's editor does NOT convert pasted
  // markdown, so `*bold*` would show as literal asterisks. We use plain section
  // headers + bullets + blank lines so it reads tidy the moment it's pasted.
  const sl: string[] = [`${FORMAT_TITLE[format]} — ${label}`, '']
  const slSection = (heading: string, items: string[]) => {
    if (!items.length) return
    sl.push(`${heading}:`)
    for (const it of items) sl.push(`• ${it}`)
    sl.push('')
  }
  slSection('Pull requests', shipped.map((s) => `[${s.status ?? 'open'}] ${s.title} (${s.repo})`))
  slSection('Commits', commitTitles.length ? commitTitles : commits.length ? [`${commits.length} commits`] : [])
  slSection('Reviews given', reviews.map((r) => `${r.title} (${r.repo})`))
  slSection('Other', deliverables.map((d) => d.title))
  slSection('Meetings', meetings.map((m) => `${m.minutes}m · ${m.title}${m.with.length ? ` with ${m.with.join(', ')}` : ''}`))
  while (sl.length && sl[sl.length - 1] === '') sl.pop()

  return {
    fromIso: from.toISOString(),
    toIso: to.toISOString(),
    label,
    format,
    shipped,
    commitTitles,
    reviews,
    meetings,
    deliverables,
    counts,
    empty,
    markdown: md.join('\n'),
    slack: sl.join('\n'),
  }
}

/** Resolve a named range to [from, to) + a human label, in the server's tz. */
export function resolveRange(range: string): { from: Date; to: Date; label: string } {
  const now = new Date()
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const DAY = 24 * 60 * 60 * 1000
  switch (range) {
    case 'yesterday':
      return { from: new Date(startOfToday.getTime() - DAY), to: startOfToday, label: 'Yesterday' }
    case 'week': {
      // Monday → now.
      const dow = (now.getDay() + 6) % 7
      return { from: new Date(startOfToday.getTime() - dow * DAY), to: now, label: 'This week' }
    }
    case 'last7':
      return { from: new Date(now.getTime() - 7 * DAY), to: now, label: 'Last 7 days' }
    case 'today':
    default:
      return { from: startOfToday, to: now, label: 'Today' }
  }
}
