import { and, eq, gte, lte } from 'drizzle-orm'
import { db, schema } from '@/lib/db/client'
import { generateWithFallback } from '@/lib/ai/registry'
import type { StoryScene } from '@/lib/db/schema'

const BUCKET_MINUTES = 15
const MEETING_APPS = new Set([
  'zoom', 'zoom.us', 'us.zoom.xos',
  'meet', 'google meet', 'meet.google.com',
  'teams', 'microsoft teams',
  'webex', 'cisco webex',
  'bluejeans',
  'facetime',
  'whereby', 'around',
])
const CODE_APPS = new Set([
  'code', 'visual studio code', 'cursor',
  'xcode', 'android studio', 'intellij idea', 'pycharm', 'webstorm', 'rubymine',
  'sublime text', 'neovim', 'nvim', 'iterm2', 'terminal', 'warp', 'tabby',
])
const DESIGN_APPS = new Set([
  'figma', 'sketch', 'adobe photoshop', 'photoshop', 'adobe illustrator', 'illustrator',
  'adobe xd', 'pixelmator', 'affinity designer',
])
const COMMS_APPS = new Set([
  'slack', 'discord', 'telegram', 'whatsapp', 'signal', 'messages', 'mail', 'outlook', 'gmail',
])
const BROWSING_APPS = new Set([
  'safari', 'google chrome', 'chrome', 'firefox', 'arc', 'edge', 'brave browser', 'brave',
])
const MEDIA_APPS = new Set([
  'youtube', 'netflix', 'spotify', 'apple music', 'music', 'twitch', 'vlc',
])
const READING_APPS = new Set([
  'preview', 'adobe acrobat', 'kindle', 'books', 'notion', 'obsidian', 'bear',
])

/* ------------------ public types ------------------ */

export type StoryResult = {
  day: string
  scenes: StoryScene[]
  narrative: string
  provider: string
  model: string
}

/* ------------------ entry point ------------------ */

export async function buildStory(userId: number, day: Date = new Date()): Promise<StoryResult> {
  const { start, end, iso } = dayBounds(day)
  const evidence = await gatherEvidence(userId, start, end)
  const scenes = synthesiseScenes(evidence, start, end)
  const { narrative, provider, model } = await generateNarrative(scenes, evidence, iso)
  return { day: iso, scenes, narrative, provider, model }
}

/* ------------------ evidence gathering ------------------ */

type Evidence = {
  shifts: (typeof schema.shifts.$inferSelect)[]
  breaks: (typeof schema.breaks.$inferSelect)[]
  leaves: (typeof schema.leaveRequests.$inferSelect)[]
  activity: (typeof schema.localActivity.$inferSelect)[]
  screenshots: Array<{ shot: typeof schema.screenshots.$inferSelect; analysis: typeof schema.shotAnalyses.$inferSelect | null }>
  githubEvents: (typeof schema.githubEvents.$inferSelect)[]
}

async function gatherEvidence(userId: number, start: Date, end: Date): Promise<Evidence> {
  const isoDay = start.toISOString().slice(0, 10)

  const [shiftRows, breakRows, leaveRows, activityRows, shotRows, ghRows] = await Promise.all([
    db
      .select()
      .from(schema.shifts)
      .where(
        and(
          eq(schema.shifts.userId, userId),
          gte(schema.shifts.punchedInAt, start),
          lte(schema.shifts.punchedInAt, end)
        )
      ),
    db
      .select()
      .from(schema.breaks)
      .where(
        and(
          eq(schema.breaks.userId, userId),
          gte(schema.breaks.startedAt, start),
          lte(schema.breaks.startedAt, end)
        )
      ),
    db
      .select()
      .from(schema.leaveRequests)
      .where(
        and(
          eq(schema.leaveRequests.userId, userId),
          eq(schema.leaveRequests.status, 'approved'),
          lte(schema.leaveRequests.startDate, isoDay),
          gte(schema.leaveRequests.endDate, isoDay)
        )
      ),
    db
      .select()
      .from(schema.localActivity)
      .where(
        and(
          eq(schema.localActivity.userId, userId),
          gte(schema.localActivity.windowStart, start),
          lte(schema.localActivity.windowStart, end)
        )
      ),
    db
      .select({ shot: schema.screenshots, analysis: schema.shotAnalyses })
      .from(schema.screenshots)
      .leftJoin(schema.shotAnalyses, eq(schema.shotAnalyses.screenshotId, schema.screenshots.id))
      .where(
        and(
          eq(schema.screenshots.userId, userId),
          gte(schema.screenshots.capturedAt, start),
          lte(schema.screenshots.capturedAt, end)
        )
      ),
    db
      .select()
      .from(schema.githubEvents)
      .where(
        and(
          eq(schema.githubEvents.userId, userId),
          gte(schema.githubEvents.occurredAt, start),
          lte(schema.githubEvents.occurredAt, end)
        )
      ),
  ])

  return {
    shifts: shiftRows,
    breaks: breakRows,
    leaves: leaveRows,
    activity: activityRows,
    screenshots: shotRows,
    githubEvents: ghRows,
  }
}

/* ------------------ scene synthesis ------------------ */

type Bucket = {
  startMs: number
  endMs: number
  appSeconds: Record<string, number>
  idleSeconds: number
  activeSeconds: number
  screenshotHints: Record<string, number>
  screenshotCategories: Record<string, number>
  githubEvents: number
  breakReason: string | null
  onLeave: boolean
  inShift: boolean
}

function synthesiseScenes(evidence: Evidence, dayStart: Date, dayEnd: Date): StoryScene[] {
  // If on leave, just one scene.
  if (evidence.leaves.length > 0) {
    return [
      {
        startAt: dayStart.toISOString(),
        endAt: dayEnd.toISOString(),
        kind: 'leave',
        label: 'On approved leave',
        detail: evidence.leaves[0].reason,
        evidence: {},
      },
    ]
  }

  // Build empty buckets between earliest shift start and last shift end (or fall back to dayStart→now)
  let windowStart = dayStart
  let windowEnd = new Date(Math.min(dayEnd.getTime(), Date.now()))
  if (evidence.shifts.length > 0) {
    const firstStart = Math.min(...evidence.shifts.map((s) => s.punchedInAt.getTime()))
    const lastEnd = Math.max(
      ...evidence.shifts.map((s) => s.punchedOutAt?.getTime() ?? Date.now())
    )
    windowStart = new Date(Math.max(firstStart, dayStart.getTime()))
    windowEnd = new Date(Math.min(lastEnd, dayEnd.getTime(), Date.now()))
  }

  const buckets = createBuckets(windowStart, windowEnd)
  if (buckets.length === 0) return []

  // Fold each evidence source into the buckets it overlaps.
  for (const b of buckets) {
    // Shift coverage
    b.inShift = evidence.shifts.some(
      (s) =>
        s.punchedInAt.getTime() <= b.endMs &&
        (s.punchedOutAt?.getTime() ?? Date.now()) >= b.startMs
    )

    // Break coverage
    for (const br of evidence.breaks) {
      const brStart = br.startedAt.getTime()
      const brEnd = br.endedAt?.getTime() ?? Date.now()
      if (brStart <= b.endMs && brEnd >= b.startMs) {
        b.breakReason = br.reason
      }
    }

    // GitHub events landing in this bucket
    b.githubEvents = evidence.githubEvents.filter(
      (e) => e.occurredAt.getTime() >= b.startMs && e.occurredAt.getTime() < b.endMs
    ).length
  }

  // Local activity windows are aligned to ~5min — distribute seconds into overlapping buckets.
  for (const a of evidence.activity) {
    const aStart = a.windowStart.getTime()
    const aEnd = a.windowEnd.getTime()
    const totalSecs = a.activeSeconds + a.idleSeconds
    if (totalSecs <= 0) continue
    for (const b of buckets) {
      const overlap = Math.max(0, Math.min(b.endMs, aEnd) - Math.max(b.startMs, aStart))
      if (overlap <= 0) continue
      const ratio = overlap / (aEnd - aStart)
      b.activeSeconds += a.activeSeconds * ratio
      b.idleSeconds += a.idleSeconds * ratio
      b.appSeconds[a.activeApp.toLowerCase()] =
        (b.appSeconds[a.activeApp.toLowerCase()] ?? 0) + a.activeSeconds * ratio
    }
  }

  // Screenshots: assign each shot to the nearest bucket.
  for (const { shot, analysis } of evidence.screenshots) {
    if (!analysis) continue
    const t = shot.capturedAt.getTime()
    const b = buckets.find((bk) => t >= bk.startMs && t < bk.endMs)
    if (!b) continue
    const hint = analysis.visibleContentHint ?? 'other'
    const cat = analysis.appCategory ?? 'unknown'
    b.screenshotHints[hint] = (b.screenshotHints[hint] ?? 0) + 1
    b.screenshotCategories[cat] = (b.screenshotCategories[cat] ?? 0) + 1
  }

  // Classify each bucket
  const classified = buckets.map(classifyBucket)

  // Merge contiguous buckets with the same kind into scenes.
  const scenes: StoryScene[] = []
  for (const c of classified) {
    if (c.kind === 'idle' && scenes.length === 0) continue // skip leading idle gap
    const last = scenes[scenes.length - 1]
    if (last && last.kind === c.kind) {
      last.endAt = c.endAt
      // Merge evidence
      const ev = last.evidence
      ev.activeSeconds = (ev.activeSeconds ?? 0) + (c.evidence.activeSeconds ?? 0)
      ev.idleSeconds = (ev.idleSeconds ?? 0) + (c.evidence.idleSeconds ?? 0)
      ev.githubEvents = (ev.githubEvents ?? 0) + (c.evidence.githubEvents ?? 0)
      if (c.evidence.topApp && (!ev.topApp || (c.evidence.activeSeconds ?? 0) > 0)) {
        ev.topApp = c.evidence.topApp
      }
      if (c.evidence.screenshotLabels) {
        ev.screenshotLabels = mergeNumberMaps(ev.screenshotLabels, c.evidence.screenshotLabels)
      }
      // Promote the longer label if the new one is non-default
      if (c.label && c.label.length > (last.label?.length ?? 0)) last.label = c.label
      if (c.detail) last.detail = c.detail
    } else {
      scenes.push({ ...c })
    }
  }

  // Trim trailing idle if present
  while (scenes.length > 0 && scenes[scenes.length - 1].kind === 'idle') {
    scenes.pop()
  }

  return scenes
}

function createBuckets(start: Date, end: Date): Bucket[] {
  const buckets: Bucket[] = []
  const bucketMs = BUCKET_MINUTES * 60_000
  let t = roundDown(start.getTime(), bucketMs)
  const endMs = end.getTime()
  while (t < endMs) {
    buckets.push({
      startMs: t,
      endMs: Math.min(t + bucketMs, endMs),
      appSeconds: {},
      idleSeconds: 0,
      activeSeconds: 0,
      screenshotHints: {},
      screenshotCategories: {},
      githubEvents: 0,
      breakReason: null,
      onLeave: false,
      inShift: false,
    })
    t += bucketMs
  }
  return buckets
}

function classifyBucket(b: Bucket): StoryScene {
  const startAt = new Date(b.startMs).toISOString()
  const endAt = new Date(b.endMs).toISOString()
  const topApp = topAppOf(b.appSeconds)

  if (b.breakReason) {
    return {
      startAt,
      endAt,
      kind: 'break',
      label: 'On break',
      detail: b.breakReason,
      evidence: {
        breakReason: b.breakReason,
        activeSeconds: Math.round(b.activeSeconds),
        idleSeconds: Math.round(b.idleSeconds),
      },
    }
  }

  if (!b.inShift) {
    return {
      startAt,
      endAt,
      kind: 'idle',
      label: 'Off-clock',
      evidence: {},
    }
  }

  // Strong signal: foreground app is a meeting app
  if (topApp && MEETING_APPS.has(topApp.toLowerCase())) {
    return {
      startAt,
      endAt,
      kind: 'meeting',
      label: 'In a meeting',
      detail: prettyApp(topApp),
      evidence: { topApp, activeSeconds: Math.round(b.activeSeconds), idleSeconds: Math.round(b.idleSeconds) },
    }
  }

  // Screenshot hint: chat-heavy
  const topHint = topKey(b.screenshotHints)
  if (topHint === 'video_streaming' && (topApp ? !CODE_APPS.has(topApp.toLowerCase()) : true)) {
    return {
      startAt,
      endAt,
      kind: 'meeting',
      label: 'In a meeting',
      detail: 'Video call detected',
      evidence: {
        topApp,
        screenshotLabels: clone(b.screenshotHints),
      },
    }
  }

  if (topApp && CODE_APPS.has(topApp.toLowerCase())) {
    const ghSuffix = b.githubEvents > 0 ? ` · ${b.githubEvents} GitHub event${b.githubEvents > 1 ? 's' : ''}` : ''
    return {
      startAt,
      endAt,
      kind: 'coding',
      label: 'Heads-down coding',
      detail: `${prettyApp(topApp)}${ghSuffix}`,
      evidence: {
        topApp,
        activeSeconds: Math.round(b.activeSeconds),
        idleSeconds: Math.round(b.idleSeconds),
        githubEvents: b.githubEvents,
        screenshotLabels: clone(b.screenshotHints),
      },
    }
  }

  if (topApp && DESIGN_APPS.has(topApp.toLowerCase())) {
    return {
      startAt,
      endAt,
      kind: 'design',
      label: 'Designing',
      detail: prettyApp(topApp),
      evidence: { topApp, activeSeconds: Math.round(b.activeSeconds), idleSeconds: Math.round(b.idleSeconds) },
    }
  }

  if (topApp && COMMS_APPS.has(topApp.toLowerCase())) {
    return {
      startAt,
      endAt,
      kind: 'comms',
      label: 'Replying to messages',
      detail: prettyApp(topApp),
      evidence: { topApp, activeSeconds: Math.round(b.activeSeconds), idleSeconds: Math.round(b.idleSeconds) },
    }
  }

  if (topApp && READING_APPS.has(topApp.toLowerCase())) {
    return {
      startAt,
      endAt,
      kind: 'reading',
      label: 'Reading / writing docs',
      detail: prettyApp(topApp),
      evidence: { topApp, activeSeconds: Math.round(b.activeSeconds), idleSeconds: Math.round(b.idleSeconds) },
    }
  }

  if (topApp && MEDIA_APPS.has(topApp.toLowerCase())) {
    return {
      startAt,
      endAt,
      kind: 'media',
      label: 'Watching media',
      detail: prettyApp(topApp),
      evidence: { topApp, activeSeconds: Math.round(b.activeSeconds), idleSeconds: Math.round(b.idleSeconds) },
    }
  }

  if (topApp && BROWSING_APPS.has(topApp.toLowerCase())) {
    return {
      startAt,
      endAt,
      kind: 'browsing',
      label: 'Browsing the web',
      detail: prettyApp(topApp),
      evidence: { topApp, activeSeconds: Math.round(b.activeSeconds), idleSeconds: Math.round(b.idleSeconds) },
    }
  }

  // Idle bucket — mostly no input
  const totalSec = b.activeSeconds + b.idleSeconds
  if (totalSec > 0 && b.idleSeconds / totalSec > 0.7) {
    return {
      startAt,
      endAt,
      kind: 'idle',
      label: 'Idle / away from desk',
      evidence: { activeSeconds: Math.round(b.activeSeconds), idleSeconds: Math.round(b.idleSeconds) },
    }
  }

  // Mixed / unknown — fall back to top app if any
  return {
    startAt,
    endAt,
    kind: topApp ? 'mixed' : 'unknown',
    label: topApp ? `Working in ${prettyApp(topApp)}` : 'Activity not detected',
    evidence: {
      topApp,
      activeSeconds: Math.round(b.activeSeconds),
      idleSeconds: Math.round(b.idleSeconds),
    },
  }
}

/* ------------------ narrative LLM call ------------------ */

async function generateNarrative(
  scenes: StoryScene[],
  evidence: Evidence,
  dayIso: string
): Promise<{ narrative: string; provider: string; model: string }> {
  // Compact scenes for the LLM
  const compactScenes = scenes.map((s) => ({
    from: timeOf(s.startAt),
    to: timeOf(s.endAt),
    kind: s.kind,
    label: s.label,
    detail: s.detail,
    topApp: s.evidence.topApp,
    githubEvents: s.evidence.githubEvents,
  }))

  const totals = {
    coding_minutes: minutesOf(scenes, 'coding'),
    meeting_minutes: minutesOf(scenes, 'meeting'),
    break_minutes: minutesOf(scenes, 'break'),
    comms_minutes: minutesOf(scenes, 'comms'),
    design_minutes: minutesOf(scenes, 'design'),
    reading_minutes: minutesOf(scenes, 'reading'),
    media_minutes: minutesOf(scenes, 'media'),
    idle_minutes: minutesOf(scenes, 'idle'),
    github_commits: evidence.githubEvents.filter((e) => e.type === 'commit').length,
    github_prs: evidence.githubEvents.filter((e) => e.type === 'pr_opened').length,
    github_reviews: evidence.githubEvents.filter((e) => e.type === 'pr_reviewed').length,
  }

  const messages = [
    {
      role: 'system' as const,
      content:
        'You are a workforce-intelligence narrator. Given an ordered timeline of an employee\'s day, write a brief, factual 3-5 sentence story.\n\n' +
        'RULES:\n' +
        '- Reference specific times in 12-hour format (e.g., "3 PM to 4 PM"). Use the from/to times exactly.\n' +
        '- Name what they did — meeting, coded, on a break, etc. Do not invent activities not in the scenes.\n' +
        '- Mention concrete artifacts when present (commits, PRs, reviews, app names).\n' +
        '- If they took breaks, name the break reason from the scene detail.\n' +
        '- Neutral tone — no praise, no judgement.\n' +
        '- Return PLAIN PROSE only. No headers, no JSON, no bullet points.\n' +
        '- Maximum 5 sentences.',
    },
    {
      role: 'user' as const,
      content: [
        `Date: ${dayIso}`,
        '',
        'Timeline (ordered):',
        '```json',
        JSON.stringify(compactScenes, null, 2),
        '```',
        '',
        'Daily totals (minutes):',
        '```json',
        JSON.stringify(totals, null, 2),
        '```',
        '',
        'Write the story now.',
      ].join('\n'),
    },
  ]

  try {
    const res = await generateWithFallback(messages, { temperature: 0.4, maxTokens: 350 })
    return { narrative: res.text.trim(), provider: res.provider, model: res.model }
  } catch (err) {
    console.error('[story] narrative gen failed', err)
    return {
      narrative: fallbackNarrative(scenes),
      provider: 'fallback',
      model: 'rules',
    }
  }
}

function fallbackNarrative(scenes: StoryScene[]): string {
  if (scenes.length === 0) return 'No activity recorded today.'
  const parts: string[] = []
  for (const s of scenes) {
    parts.push(`${timeOf(s.startAt)}–${timeOf(s.endAt)}: ${s.label}${s.detail ? ` (${s.detail})` : ''}`)
  }
  return parts.join('. ') + '.'
}

/* ------------------ utilities ------------------ */

function dayBounds(d: Date): { start: Date; end: Date; iso: string } {
  const start = new Date(d)
  start.setHours(0, 0, 0, 0)
  const end = new Date(start)
  end.setDate(end.getDate() + 1)
  return {
    start,
    end,
    iso: `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, '0')}-${String(start.getDate()).padStart(2, '0')}`,
  }
}

function roundDown(ms: number, bucket: number): number {
  return Math.floor(ms / bucket) * bucket
}

function topAppOf(seconds: Record<string, number>): string | null {
  let max = 0
  let app: string | null = null
  for (const k in seconds) {
    if (seconds[k] > max) {
      max = seconds[k]
      app = k
    }
  }
  return app
}

function topKey(m: Record<string, number>): string | null {
  let max = 0
  let key: string | null = null
  for (const k in m) {
    if (m[k] > max) {
      max = m[k]
      key = k
    }
  }
  return key
}

function clone<T extends Record<string, number>>(m: T): Record<string, number> {
  const o: Record<string, number> = {}
  for (const k in m) o[k] = m[k]
  return o
}

function mergeNumberMaps(
  a: Record<string, number> | undefined,
  b: Record<string, number> | undefined
): Record<string, number> {
  const out: Record<string, number> = { ...(a ?? {}) }
  if (b) {
    for (const k in b) out[k] = (out[k] ?? 0) + b[k]
  }
  return out
}

function prettyApp(name: string): string {
  // Re-capitalize known apps
  const map: Record<string, string> = {
    'code': 'VS Code',
    'visual studio code': 'VS Code',
    'cursor': 'Cursor',
    'figma': 'Figma',
    'sketch': 'Sketch',
    'safari': 'Safari',
    'chrome': 'Chrome',
    'google chrome': 'Chrome',
    'firefox': 'Firefox',
    'arc': 'Arc',
    'slack': 'Slack',
    'discord': 'Discord',
    'zoom': 'Zoom',
    'zoom.us': 'Zoom',
    'us.zoom.xos': 'Zoom',
    'meet': 'Google Meet',
    'google meet': 'Google Meet',
    'teams': 'Microsoft Teams',
    'microsoft teams': 'Microsoft Teams',
    'notion': 'Notion',
    'obsidian': 'Obsidian',
    'terminal': 'Terminal',
    'iterm2': 'iTerm',
    'warp': 'Warp',
    'youtube': 'YouTube',
    'netflix': 'Netflix',
    'spotify': 'Spotify',
  }
  return map[name.toLowerCase()] ?? name
}

function timeOf(iso: string): string {
  const d = new Date(iso)
  let h = d.getHours()
  const m = d.getMinutes()
  const ampm = h >= 12 ? 'PM' : 'AM'
  h = h % 12
  if (h === 0) h = 12
  return m === 0 ? `${h} ${ampm}` : `${h}:${String(m).padStart(2, '0')} ${ampm}`
}

function minutesOf(scenes: StoryScene[], kind: StoryScene['kind']): number {
  let total = 0
  for (const s of scenes) {
    if (s.kind !== kind) continue
    total += Math.round((new Date(s.endAt).getTime() - new Date(s.startAt).getTime()) / 60000)
  }
  return total
}
