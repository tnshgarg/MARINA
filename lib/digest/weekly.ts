import { and, desc, eq, gte, inArray, like, not, sql } from 'drizzle-orm'
import { db, schema } from '@/lib/db/client'

/**
 * Compose the founder/CEO weekly digest. Single source of truth used by both
 * the cron job and the "Preview digest" button on the workspace settings page.
 *
 * Designed for skim-reading on a phone at 8am on a Monday.
 *   - Headline sentence: how the team is doing
 *   - "Worth your attention" — up to 3 actionable items
 *   - Standouts — top 3 by shipping volume
 *   - Heads-up — who's out next week
 *   - Numbers — small inline stats
 *
 * Designed to be forwarded by the founder to investors / co-founders. So we
 * lean into specific names and PRs, not vague summaries.
 */

const WEEK_MS = 7 * 24 * 60 * 60 * 1000

export type DigestRow = {
  user: { id: number; login: string; name: string | null }
  commits: number
  prsOpened: number
  reviews: number
  issuesClosed: number
  prevCommits: number
}

export type Digest = {
  orgId: number
  orgName: string
  weekStart: string         // YYYY-MM-DD
  weekEnd: string
  generatedAt: string
  totals: {
    members: number
    commits: number
    prsOpened: number
    reviews: number
    issuesClosed: number
    activeBlockers: number
    pendingLeaves: number
    onLeaveNextWeek: number
    membersWithoutGithub: number
  }
  velocity: {
    deltaPct: number | null   // last 7d events vs previous 7d
  }
  standouts: DigestRow[]
  attention: Array<{
    kind: 'blocked' | 'quiet' | 'long-day'
    userId: number
    name: string
    detail: string
  }>
  outNextWeek: Array<{
    name: string
    leaveType: string
    startDate: string
    endDate: string
  }>
  topShipped: Array<{ title: string; url: string; type: string; repo: string }>
  /** Hours → cost → capacity. Present when there are shifts in the week. */
  workforce?: {
    hoursLogged: number
    estCostInr: number | null    // null when org hasn't set costPerHourInr
    capacityPct: number | null   // logged vs expected full-time hours for the team
  }
}

export async function buildWeeklyDigest(orgId: number): Promise<Digest | null> {
  const org = await db.query.orgs.findFirst({ where: eq(schema.orgs.id, orgId) })
  if (!org) return null

  const now = new Date()
  const weekStart = new Date(now.getTime() - WEEK_MS)
  const prevWeekStart = new Date(now.getTime() - 2 * WEEK_MS)
  const nextWeekEnd = new Date(now.getTime() + WEEK_MS)

  const memberRows = await db
    .select({
      userId: schema.memberships.userId,
      login: schema.users.login,
      name: schema.users.name,
      hasGithub: schema.users.accessToken,
    })
    .from(schema.memberships)
    .innerJoin(schema.users, eq(schema.memberships.userId, schema.users.id))
    .where(eq(schema.memberships.orgId, orgId))

  const userIds = memberRows.map((m) => m.userId)
  if (userIds.length === 0) {
    return {
      orgId,
      orgName: org.name,
      weekStart: isoDay(weekStart),
      weekEnd: isoDay(now),
      generatedAt: now.toISOString(),
      totals: {
        members: 0, commits: 0, prsOpened: 0, reviews: 0, issuesClosed: 0,
        activeBlockers: 0, pendingLeaves: 0, onLeaveNextWeek: 0, membersWithoutGithub: 0,
      },
      velocity: { deltaPct: null },
      standouts: [],
      attention: [],
      outNextWeek: [],
      topShipped: [],
    }
  }

  const NOT_SEED = not(like(schema.githubEvents.externalId, 'seed-%'))

  const [eventsThis, eventsPrev, blockerRows, pendingLeavesCount, leavesNextWeek, topPRs] =
    await Promise.all([
      db
        .select()
        .from(schema.githubEvents)
        .where(
          and(
            inArray(schema.githubEvents.userId, userIds),
            gte(schema.githubEvents.occurredAt, weekStart),
            NOT_SEED,
          ),
        ),
      db
        .select()
        .from(schema.githubEvents)
        .where(
          and(
            inArray(schema.githubEvents.userId, userIds),
            gte(schema.githubEvents.occurredAt, prevWeekStart),
            sql`${schema.githubEvents.occurredAt} < ${weekStart}`,
            NOT_SEED,
          ),
        ),
      db
        .select({ b: schema.breaks, u: schema.users })
        .from(schema.breaks)
        .innerJoin(schema.users, eq(schema.breaks.userId, schema.users.id))
        .where(
          and(
            inArray(schema.breaks.userId, userIds),
            eq(schema.breaks.category, 'blocked'),
            sql`${schema.breaks.endedAt} IS NULL`,
          ),
        ),
      db
        .select({ id: schema.leaveRequests.id })
        .from(schema.leaveRequests)
        .where(
          and(
            eq(schema.leaveRequests.orgId, orgId),
            eq(schema.leaveRequests.status, 'pending'),
          ),
        ),
      db
        .select({ l: schema.leaveRequests, u: schema.users })
        .from(schema.leaveRequests)
        .innerJoin(schema.users, eq(schema.leaveRequests.userId, schema.users.id))
        .where(
          and(
            eq(schema.leaveRequests.orgId, orgId),
            eq(schema.leaveRequests.status, 'approved'),
          ),
        ),
      db
        .select()
        .from(schema.githubEvents)
        .where(
          and(
            inArray(schema.githubEvents.userId, userIds),
            eq(schema.githubEvents.type, 'pr_opened'),
            gte(schema.githubEvents.occurredAt, weekStart),
            NOT_SEED,
          ),
        )
        .orderBy(desc(schema.githubEvents.occurredAt))
        .limit(8),
    ])

  // Aggregate per-user counts (this week + previous week for delta)
  const byUserThis = new Map<number, Omit<DigestRow, 'user' | 'prevCommits'>>()
  for (const e of eventsThis) {
    const slot = byUserThis.get(e.userId) ?? { commits: 0, prsOpened: 0, reviews: 0, issuesClosed: 0 }
    if (e.type === 'commit') slot.commits++
    else if (e.type === 'pr_opened') slot.prsOpened++
    else if (e.type === 'pr_reviewed') slot.reviews++
    else if (e.type === 'issue_closed') slot.issuesClosed++
    byUserThis.set(e.userId, slot)
  }
  const prevCommitsByUser = new Map<number, number>()
  for (const e of eventsPrev) {
    if (e.type !== 'commit') continue
    prevCommitsByUser.set(e.userId, (prevCommitsByUser.get(e.userId) ?? 0) + 1)
  }

  const userById = new Map(memberRows.map((m) => [m.userId, m]))

  // Standouts: top 3 by total output volume
  const standouts: DigestRow[] = [...byUserThis.entries()]
    .map(([userId, c]) => {
      const m = userById.get(userId)!
      const total = c.commits + c.prsOpened + c.reviews + c.issuesClosed
      const prevCommits = prevCommitsByUser.get(userId) ?? 0
      return {
        user: { id: userId, login: m.login, name: m.name },
        ...c,
        prevCommits,
        total,
      }
    })
    .sort((a, b) => b.total - a.total)
    .slice(0, 3)
    .map(({ total, ...row }) => {
      void total
      return row
    })

  // Velocity delta
  const totalThis = eventsThis.length
  const totalPrev = eventsPrev.length
  const deltaPct =
    totalPrev === 0 ? null : Math.round(((totalThis - totalPrev) / totalPrev) * 100)

  // Attention — combine blockers, quiet members, long days
  const attention: Digest['attention'] = []
  for (const { b, u } of blockerRows) {
    attention.push({
      kind: 'blocked',
      userId: u.id,
      name: u.name ?? `@${u.login}`,
      detail: `Blocked since ${humanDuration(Date.now() - new Date(b.startedAt).getTime())} ago. ${b.reason ?? ''}`.trim(),
    })
  }
  // Quiet members — no commits in last 7 days but have GitHub linked
  const githubLinked = memberRows.filter((m) => !!m.hasGithub)
  for (const m of githubLinked) {
    if (attention.length >= 5) break
    if (!byUserThis.has(m.userId) || (byUserThis.get(m.userId)?.commits ?? 0) === 0) {
      attention.push({
        kind: 'quiet',
        userId: m.userId,
        name: m.name ?? `@${m.login}`,
        detail: 'No commits this week. Worth a check-in.',
      })
    }
  }

  // Workforce: hours logged this week → estimated cost → capacity utilization.
  const weekShifts = await db
    .select({ punchedInAt: schema.shifts.punchedInAt, punchedOutAt: schema.shifts.punchedOutAt })
    .from(schema.shifts)
    .where(and(inArray(schema.shifts.userId, userIds), gte(schema.shifts.punchedInAt, weekStart)))
  let hoursLogged = 0
  for (const s of weekShifts) {
    const end = s.punchedOutAt ?? now
    hoursLogged += Math.max(0, (end.getTime() - s.punchedInAt.getTime()) / 3_600_000)
  }
  hoursLogged = Math.round(hoursLogged * 10) / 10
  const costPerHour = (org as { costPerHourInr?: number | null }).costPerHourInr ?? null
  const estCostInr = costPerHour ? Math.round(hoursLogged * costPerHour) : null
  const expectedPerPerson = Math.max(1, org.workdayEndHour - org.workdayStartHour) * 5 // full-time week
  const capacityPct =
    memberRows.length > 0 ? Math.round((hoursLogged / (memberRows.length * expectedPerPerson)) * 100) : null

  // Out next week
  const today = isoDay(now)
  const nextWk = isoDay(nextWeekEnd)
  const outNextWeek = leavesNextWeek
    .filter(({ l }) => l.endDate >= today && l.startDate <= nextWk)
    .map(({ l, u }) => ({
      name: u.name ?? `@${u.login}`,
      leaveType: l.leaveType,
      startDate: l.startDate,
      endDate: l.endDate,
    }))
    .sort((a, b) => a.startDate.localeCompare(b.startDate))

  return {
    orgId,
    orgName: org.name,
    weekStart: isoDay(weekStart),
    weekEnd: isoDay(now),
    generatedAt: now.toISOString(),
    totals: {
      members: memberRows.length,
      commits: eventsThis.filter((e) => e.type === 'commit').length,
      prsOpened: eventsThis.filter((e) => e.type === 'pr_opened').length,
      reviews: eventsThis.filter((e) => e.type === 'pr_reviewed').length,
      issuesClosed: eventsThis.filter((e) => e.type === 'issue_closed').length,
      activeBlockers: blockerRows.length,
      pendingLeaves: pendingLeavesCount.length,
      onLeaveNextWeek: outNextWeek.length,
      membersWithoutGithub: memberRows.filter((m) => !m.hasGithub).length,
    },
    velocity: { deltaPct },
    standouts,
    attention: attention.slice(0, 5),
    outNextWeek,
    topShipped: topPRs.map((e) => ({
      title: e.title,
      url: e.url,
      type: e.type,
      repo: e.repo,
    })),
    workforce: { hoursLogged, estCostInr, capacityPct },
  }
}

/* ------------ HTML email rendering ------------ */

export function renderDigestEmail(d: Digest): { subject: string; html: string; text: string } {
  const headline = composeHeadline(d)
  const subject = `${d.orgName} weekly · ${headline.short}`

  const standoutsBlock = d.standouts
    .map((s) => {
      const name = s.user.name ?? `@${s.user.login}`
      const trend = s.commits - s.prevCommits
      const trendStr =
        trend > 0 ? `<span style="color:#547d62">↑ ${trend}</span>` :
        trend < 0 ? `<span style="color:#ad4c52">↓ ${Math.abs(trend)}</span>` :
        `<span style="color:#8a91a3">—</span>`
      return `<tr>
        <td style="padding:4px 0;font:500 14px Inter,sans-serif;color:#1a1f2e">${escapeHtml(name)}</td>
        <td style="padding:4px 0;text-align:right;font:500 13px Inter,sans-serif;color:#5e6678">
          ${s.commits} commits ${trendStr} · ${s.prsOpened} PRs · ${s.reviews} reviews
        </td>
      </tr>`
    })
    .join('')

  const attentionBlock = d.attention.length === 0
    ? '<p style="margin:0;color:#5e6678;font:14px Inter,sans-serif;font-style:italic">Nothing demands your attention this week. Enjoy the calm.</p>'
    : d.attention
        .map((a) => `<li style="margin:8px 0;font:14px Inter,sans-serif;color:#1a1f2e">
          <strong>${escapeHtml(a.name)}</strong> ·
          <span style="color:#5e6678">${escapeHtml(a.detail)}</span>
        </li>`)
        .join('')

  const outBlock = d.outNextWeek.length === 0
    ? '<p style="margin:0;color:#5e6678;font:14px Inter,sans-serif;font-style:italic">Nobody scheduled to be out next week.</p>'
    : `<ul style="margin:0;padding:0;list-style:none">
        ${d.outNextWeek
          .map(
            (o) => `<li style="margin:6px 0;font:14px Inter,sans-serif;color:#1a1f2e">
            <strong>${escapeHtml(o.name)}</strong>
            <span style="color:#5e6678"> · ${escapeHtml(o.leaveType)} · ${escapeHtml(o.startDate)} → ${escapeHtml(o.endDate)}</span>
          </li>`,
          )
          .join('')}
      </ul>`

  const shippedBlock = d.topShipped.length === 0
    ? ''
    : `<table style="width:100%;border-collapse:collapse;margin-top:8px">
        ${d.topShipped
          .slice(0, 6)
          .map(
            (s) => `<tr>
              <td style="padding:4px 0;font:14px Inter,sans-serif">
                <a href="${escapeHtml(s.url)}" style="color:#3f6b54;text-decoration:none">${escapeHtml(s.title)}</a>
              </td>
              <td style="padding:4px 0;text-align:right;font:12px Inter,sans-serif;color:#8a91a3">${escapeHtml(s.repo)}</td>
            </tr>`,
          )
          .join('')}
      </table>`

  const html = `<!doctype html>
<html><head><meta charset="utf-8"/><title>${escapeHtml(subject)}</title></head>
<body style="margin:0;padding:0;background:#f8f6f1;font-family:Inter,Helvetica,Arial,sans-serif;color:#1a1f2e">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f8f6f1">
    <tr><td align="center" style="padding:32px 16px">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:14px;border:1px solid #e5e0d4;box-shadow:0 1px 3px rgba(26,31,46,0.04)">

        <!-- Brand -->
        <tr><td style="padding:24px 32px 0;text-align:center">
          <div style="display:inline-block;font:600 16px Inter,sans-serif;color:#1a1f2e;letter-spacing:-0.01em">
            <span style="display:inline-block;width:8px;height:8px;background:linear-gradient(135deg,#3f6b54,#c19a4d);border-radius:2px;vertical-align:middle;margin-right:8px"></span>
            MARINA
          </div>
        </td></tr>

        <!-- Eyebrow + headline -->
        <tr><td style="padding:24px 32px 8px">
          <p style="margin:0 0 8px;font:600 11px Inter,sans-serif;color:#8a91a3;letter-spacing:0.18em;text-transform:uppercase">
            Week of ${escapeHtml(d.weekStart)} · ${escapeHtml(d.orgName)}
          </p>
          <h1 style="margin:0;font:400 32px 'Instrument Serif',Georgia,serif;color:#1a1f2e;letter-spacing:-0.005em;line-height:1.15">
            ${escapeHtml(headline.long)}
          </h1>
        </td></tr>

        <!-- Numbers strip -->
        <tr><td style="padding:20px 32px 8px">
          <table role="presentation" width="100%" style="background:#efece5;border-radius:10px">
            <tr>
              ${stat(d.totals.commits, 'commits')}
              ${stat(d.totals.prsOpened, 'PRs opened')}
              ${stat(d.totals.reviews, 'reviews')}
              ${stat(d.totals.activeBlockers, 'blocked')}
            </tr>
          </table>
        </td></tr>
        ${d.workforce ? `
        <!-- Workforce: hours → cost → capacity -->
        <tr><td style="padding:8px 32px 0">
          <table role="presentation" width="100%" style="background:#f4f1ea;border-radius:10px">
            <tr>
              ${stat(d.workforce.hoursLogged, 'hours logged')}
              ${d.workforce.estCostInr != null ? statText(`₹${d.workforce.estCostInr.toLocaleString('en-IN')}`, 'people cost') : statText('—', 'set hourly cost')}
              ${d.workforce.capacityPct != null ? statText(`${d.workforce.capacityPct}%`, 'capacity used') : ''}
            </tr>
          </table>
        </td></tr>` : ''}

        <!-- Worth your attention -->
        <tr><td style="padding:24px 32px 0">
          <h2 style="margin:0 0 10px;font:400 22px 'Instrument Serif',Georgia,serif;color:#1a1f2e">
            Worth your attention
          </h2>
          <ul style="margin:0;padding:0;list-style:none">${attentionBlock}</ul>
        </td></tr>

        <!-- Standouts -->
        ${d.standouts.length > 0 ? `<tr><td style="padding:24px 32px 0">
          <h2 style="margin:0 0 10px;font:400 22px 'Instrument Serif',Georgia,serif;color:#1a1f2e">
            Standouts this week
          </h2>
          <table style="width:100%;border-collapse:collapse">${standoutsBlock}</table>
        </td></tr>` : ''}

        <!-- Top shipped -->
        ${shippedBlock ? `<tr><td style="padding:24px 32px 0">
          <h2 style="margin:0 0 10px;font:400 22px 'Instrument Serif',Georgia,serif;color:#1a1f2e">
            Top of what shipped
          </h2>
          ${shippedBlock}
        </td></tr>` : ''}

        <!-- Out next week -->
        <tr><td style="padding:24px 32px 32px">
          <h2 style="margin:0 0 10px;font:400 22px 'Instrument Serif',Georgia,serif;color:#1a1f2e">
            Out next week
          </h2>
          ${outBlock}
        </td></tr>

        <!-- Footer -->
        <tr><td style="padding:0 32px 28px">
          <hr style="border:0;border-top:1px solid #efece5;margin:0 0 18px"/>
          <p style="margin:0;font:12px Inter,sans-serif;color:#8a91a3;line-height:1.6">
            You're receiving this because you're the owner of <strong>${escapeHtml(d.orgName)}</strong> on MARINA.
            Manage delivery in <a href="${escapeHtml(process.env.NEXT_PUBLIC_APP_URL ?? '')}/org/${d.orgId}/settings" style="color:#3f6b54">workspace settings</a>.
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`

  const text = renderText(d, headline.long)
  return { subject, html, text }
}

function stat(n: number, label: string): string {
  return statText(String(n), label)
}

/** Same visual as stat() but accepts a pre-formatted string value (₹, %, h). */
function statText(value: string, label: string): string {
  return `<td align="center" style="padding:16px 8px">
    <div style="font:600 28px Inter,sans-serif;color:#1a1f2e;letter-spacing:-0.02em">${escapeHtml(value)}</div>
    <div style="font:12px Inter,sans-serif;color:#5e6678">${escapeHtml(label)}</div>
  </td>`
}

function composeHeadline(d: Digest): { long: string; short: string } {
  const t = d.totals
  const dPct = d.velocity.deltaPct
  if (t.activeBlockers > 0) {
    return {
      long: `${t.activeBlockers} ${t.activeBlockers === 1 ? 'teammate is' : 'teammates are'} blocked. ${t.commits} commits shipped.`,
      short: `${t.activeBlockers} blocked, ${t.commits} commits`,
    }
  }
  if (t.commits === 0 && t.prsOpened === 0) {
    return {
      long: `Quiet week — no GitHub activity recorded across the team.`,
      short: `Quiet week`,
    }
  }
  const trend =
    dPct == null ? '' :
    dPct > 0 ? ` (+${dPct}% vs last week)` :
    dPct < 0 ? ` (${dPct}% vs last week)` :
    ''
  return {
    long: `${t.commits} commits, ${t.prsOpened} PRs, ${t.reviews} reviews this week${trend}.`,
    short: `${t.commits} commits, ${t.prsOpened} PRs`,
  }
}

function renderText(d: Digest, headline: string): string {
  const lines: string[] = []
  lines.push(`${d.orgName} — week of ${d.weekStart}`, '', headline, '')
  if (d.attention.length > 0) {
    lines.push('Worth your attention:')
    for (const a of d.attention) lines.push(`  • ${a.name}: ${a.detail}`)
    lines.push('')
  }
  if (d.standouts.length > 0) {
    lines.push('Standouts:')
    for (const s of d.standouts) {
      const name = s.user.name ?? `@${s.user.login}`
      lines.push(`  • ${name}: ${s.commits} commits, ${s.prsOpened} PRs, ${s.reviews} reviews`)
    }
    lines.push('')
  }
  if (d.outNextWeek.length > 0) {
    lines.push('Out next week:')
    for (const o of d.outNextWeek) lines.push(`  • ${o.name} — ${o.leaveType} · ${o.startDate} → ${o.endDate}`)
  }
  return lines.join('\n')
}

function escapeHtml(s: string): string {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)
}

function humanDuration(ms: number): string {
  const mins = Math.max(0, Math.floor(ms / 60000))
  if (mins < 60) return `${mins}m`
  const h = Math.floor(mins / 60)
  if (h < 24) return `${h}h ${mins % 60}m`
  return `${Math.floor(h / 24)}d`
}

function isoDay(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
