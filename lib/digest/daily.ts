import { and, eq, gte, isNull, lt } from 'drizzle-orm'
import { db, schema } from '@/lib/db/client'

/**
 * Yesterday's snapshot per org, scoped to one manager's "people they care
 * about". For owners and managers without a reports-to chain, that's every
 * teammate. For managers with reports, it's just their reports + indirect
 * reports.
 *
 * Returns null when there's nothing worth emailing (no shifts, no deliverables,
 * no blockers, no leaves) — saves us from pinging managers about empty
 * weekends.
 */
export type ManagerDailyDigest = {
  managerName: string
  orgName: string
  date: string  // ISO 8601 "yesterday"
  totals: {
    shifts: number
    blockersOpen: number
    blockersResolved: number
    deliverablesShipped: number
    leavesPending: number
    onLeaveToday: number
  }
  ledger: Array<{
    userName: string
    userLogin: string
    shiftMinutes: number
    deliverables: string[]
    isBlocked: boolean
    blockedReason: string | null
  }>
  pending: {
    leaves: Array<{ userName: string; startDate: string; endDate: string; type: string }>
    blockers: Array<{ userName: string; minutesAgo: number; reason: string }>
  }
}

export async function buildManagerDailyDigest({
  managerName,
  orgId,
  scope,
}: {
  managerName: string
  orgId: number
  /** Optional list of user-ids to focus on. null = "the whole org". */
  scope: number[] | null
}): Promise<ManagerDailyDigest | null> {
  const org = await db.query.orgs.findFirst({ where: eq(schema.orgs.id, orgId) })
  if (!org) return null

  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const yesterday = new Date(today.getTime() - 24 * 60 * 60 * 1000)
  const yesterdayEnd = today

  // Active memberships in scope.
  const members = await db
    .select({
      m: schema.memberships,
      u: schema.users,
    })
    .from(schema.memberships)
    .innerJoin(schema.users, eq(schema.memberships.userId, schema.users.id))
    .where(
      and(
        eq(schema.memberships.orgId, orgId),
        isNull(schema.memberships.endedAt),
      ),
    )
  const targets = scope
    ? members.filter((row) => scope.includes(row.u.id))
    : members
  if (targets.length === 0) return null

  // Pull yesterday's shifts + deliverables + active blockers in a single sweep.
  const [shifts, deliverables, openBlockers, resolvedBlockers, pendingLeaves] = await Promise.all([
    db
      .select()
      .from(schema.shifts)
      .where(
        and(
          eq(schema.shifts.orgId, orgId),
          gte(schema.shifts.punchedInAt, yesterday),
          lt(schema.shifts.punchedInAt, yesterdayEnd),
        ),
      ),
    db
      .select()
      .from(schema.deliverables)
      .where(
        and(
          eq(schema.deliverables.orgId, orgId),
          gte(schema.deliverables.completedAt, yesterday),
          lt(schema.deliverables.completedAt, yesterdayEnd),
        ),
      ),
    db
      .select()
      .from(schema.breaks)
      .where(
        and(
          eq(schema.breaks.orgId, orgId),
          eq(schema.breaks.category, 'blocked'),
          isNull(schema.breaks.endedAt),
        ),
      ),
    db
      .select()
      .from(schema.breaks)
      .where(
        and(
          eq(schema.breaks.orgId, orgId),
          eq(schema.breaks.category, 'blocked'),
          gte(schema.breaks.startedAt, yesterday),
          lt(schema.breaks.startedAt, yesterdayEnd),
        ),
      ),
    db
      .select()
      .from(schema.leaveRequests)
      .where(and(eq(schema.leaveRequests.orgId, orgId), eq(schema.leaveRequests.status, 'pending'))),
  ])

  const inScope = new Set(targets.map((t) => t.u.id))

  // Build per-person ledger so the manager sees one row per person.
  const ledger: ManagerDailyDigest['ledger'] = targets.map(({ u }) => {
    const personShifts = shifts.filter((s) => s.userId === u.id)
    const personDelivs = deliverables.filter((d) => d.userId === u.id)
    const blocker = openBlockers.find((b) => b.userId === u.id)
    const minutes = personShifts.reduce((acc, s) => {
      if (!s.punchedOutAt) return acc
      return acc + Math.max(0, Math.round((s.punchedOutAt.getTime() - s.punchedInAt.getTime()) / 60000))
    }, 0)
    return {
      userName: u.name ?? `@${u.login}`,
      userLogin: u.login,
      shiftMinutes: minutes,
      deliverables: personDelivs.map((d) => d.title),
      isBlocked: !!blocker,
      blockedReason: blocker?.reason ?? null,
    }
  })

  // Drop empty days entirely — manager shouldn't get an email for a weekend
  // that had no signal. Rough heuristic: zero shifts, zero deliverables,
  // zero blockers, zero leaves.
  const totals = {
    shifts: shifts.filter((s) => inScope.has(s.userId)).length,
    blockersOpen: openBlockers.filter((b) => inScope.has(b.userId)).length,
    blockersResolved: resolvedBlockers
      .filter((b) => inScope.has(b.userId) && b.endedAt)
      .length,
    deliverablesShipped: deliverables.filter((d) => d.userId != null && inScope.has(d.userId))
      .length,
    leavesPending: pendingLeaves.filter((l) => inScope.has(l.userId)).length,
    onLeaveToday: 0, // computed below
  }
  if (
    totals.shifts === 0 &&
    totals.deliverablesShipped === 0 &&
    totals.blockersOpen === 0 &&
    totals.leavesPending === 0
  ) {
    return null
  }

  const todayStr = today.toISOString().slice(0, 10)
  // Anyone whose approved leave covers today.
  const onLeaveToday = await db
    .select()
    .from(schema.leaveRequests)
    .where(
      and(
        eq(schema.leaveRequests.orgId, orgId),
        eq(schema.leaveRequests.status, 'approved'),
        lt(schema.leaveRequests.startDate, todayStr + 'T23:59:59Z'),
        gte(schema.leaveRequests.endDate, todayStr + 'T00:00:00Z'),
      ),
    )
    .catch(() => [])
  totals.onLeaveToday = onLeaveToday.filter((l) => inScope.has(l.userId)).length

  return {
    managerName,
    orgName: org.name,
    date: yesterday.toISOString().slice(0, 10),
    totals,
    ledger,
    pending: {
      leaves: pendingLeaves
        .filter((l) => inScope.has(l.userId))
        .slice(0, 5)
        .map((l) => {
          const u = targets.find((t) => t.u.id === l.userId)
          return {
            userName: u?.u.name ?? `@${u?.u.login ?? 'someone'}`,
            startDate: l.startDate.slice(0, 10),
            endDate: l.endDate.slice(0, 10),
            type: l.leaveType,
          }
        }),
      blockers: openBlockers
        .filter((b) => inScope.has(b.userId))
        .slice(0, 5)
        .map((b) => {
          const u = targets.find((t) => t.u.id === b.userId)
          return {
            userName: u?.u.name ?? `@${u?.u.login ?? 'someone'}`,
            minutesAgo: Math.round((Date.now() - b.startedAt.getTime()) / 60000),
            reason: b.reason,
          }
        }),
    },
  }
}

export function renderManagerDailyEmail(d: ManagerDailyDigest): { subject: string; text: string; html: string } {
  const subject = `MARINA daily · ${d.orgName} · ${d.totals.deliverablesShipped} shipped, ${d.totals.blockersOpen} blocked`

  const ledgerLines = d.ledger
    .map((row) => {
      const hours = (row.shiftMinutes / 60).toFixed(1)
      const ship = row.deliverables.length > 0 ? ` — shipped: ${row.deliverables.slice(0, 3).join(' · ')}` : ''
      const blocked = row.isBlocked ? ` · BLOCKED: ${row.blockedReason ?? 'no reason given'}` : ''
      return `  · ${row.userName}: ${hours}h${ship}${blocked}`
    })
    .join('\n')

  const text = [
    `Morning ${d.managerName},`,
    '',
    `Yesterday on ${d.orgName} (${d.date}):`,
    `  · ${d.totals.deliverablesShipped} deliverables shipped`,
    `  · ${d.totals.blockersOpen} blocker${d.totals.blockersOpen === 1 ? '' : 's'} open`,
    `  · ${d.totals.leavesPending} leave request${d.totals.leavesPending === 1 ? '' : 's'} waiting on you`,
    `  · ${d.totals.onLeaveToday} teammate${d.totals.onLeaveToday === 1 ? '' : 's'} out today`,
    '',
    'Per person:',
    ledgerLines,
    '',
    ...(d.pending.blockers.length
      ? [
          'Open blockers — needs your attention:',
          ...d.pending.blockers.map(
            (b) => `  · ${b.userName} stuck ${b.minutesAgo}m: "${b.reason}"`,
          ),
          '',
        ]
      : []),
    ...(d.pending.leaves.length
      ? [
          'Leaves to decide:',
          ...d.pending.leaves.map(
            (l) => `  · ${l.userName} · ${l.type} · ${l.startDate} → ${l.endDate}`,
          ),
          '',
        ]
      : []),
    `Open MARINA: ${process.env.NEXT_PUBLIC_APP_URL ?? 'https://marina.team'}`,
    '',
    '— MARINA',
  ].join('\n')

  const html = `<!doctype html>
<html><head><meta charset="utf-8"></head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Inter', sans-serif; color: #1f2937; max-width: 580px; margin: 0 auto; padding: 24px;">
  <p style="font-family: 'Instrument Serif', Georgia, serif; font-size: 22px; color: #3f6b54; margin: 0 0 6px;">Morning, ${escapeHtml(d.managerName)}.</p>
  <p style="font-size: 14px; color: #6b7280; margin: 0 0 18px;">Yesterday on <strong style="color: #1f2937;">${escapeHtml(d.orgName)}</strong> · ${d.date}</p>

  <div style="display: flex; gap: 12px; margin: 18px 0; flex-wrap: wrap;">
    ${stat('Shipped', d.totals.deliverablesShipped, '#3f6b54')}
    ${stat('Blocked', d.totals.blockersOpen, '#b34d4d')}
    ${stat('Leaves pending', d.totals.leavesPending, '#c19a4d')}
    ${stat('Off today', d.totals.onLeaveToday, '#6b7280')}
  </div>

  <h2 style="font-family: 'Instrument Serif', Georgia, serif; font-weight: 500; font-size: 18px; color: #1f2937; margin: 24px 0 8px;">Per person</h2>
  <table cellpadding="0" cellspacing="0" style="width: 100%; border-collapse: collapse;">
    ${d.ledger.map((row) => `
      <tr style="border-top: 1px solid #f1f5f9;">
        <td style="padding: 8px 0; font-size: 13.5px; width: 35%;">
          <strong style="color: #1f2937;">${escapeHtml(row.userName)}</strong>
        </td>
        <td style="padding: 8px 0; font-size: 13px; color: #6b7280;">
          ${(row.shiftMinutes / 60).toFixed(1)}h
          ${row.deliverables.length ? ` · <span style="color: #3f6b54;">${row.deliverables.slice(0, 2).map(escapeHtml).join(' · ')}</span>` : ''}
          ${row.isBlocked ? ` · <span style="color: #b34d4d;">BLOCKED — ${escapeHtml(row.blockedReason ?? '')}</span>` : ''}
        </td>
      </tr>
    `).join('')}
  </table>

  ${d.pending.blockers.length ? `
    <h2 style="font-family: 'Instrument Serif', Georgia, serif; font-weight: 500; font-size: 18px; color: #b34d4d; margin: 24px 0 8px;">Open blockers · needs you</h2>
    <ul style="padding-left: 16px; font-size: 13.5px; color: #1f2937;">
      ${d.pending.blockers.map((b) => `<li style="margin: 4px 0;"><strong>${escapeHtml(b.userName)}</strong> · ${b.minutesAgo}m · ${escapeHtml(b.reason)}</li>`).join('')}
    </ul>
  ` : ''}

  ${d.pending.leaves.length ? `
    <h2 style="font-family: 'Instrument Serif', Georgia, serif; font-weight: 500; font-size: 18px; color: #c19a4d; margin: 24px 0 8px;">Leaves to decide</h2>
    <ul style="padding-left: 16px; font-size: 13.5px; color: #1f2937;">
      ${d.pending.leaves.map((l) => `<li style="margin: 4px 0;"><strong>${escapeHtml(l.userName)}</strong> · ${escapeHtml(l.type)} · ${l.startDate} → ${l.endDate}</li>`).join('')}
    </ul>
  ` : ''}

  <p style="margin-top: 28px; font-size: 12px; color: #9ca3af;">
    <a href="${process.env.NEXT_PUBLIC_APP_URL ?? 'https://marina.team'}" style="color: #3f6b54; text-decoration: none;">Open MARINA →</a>
  </p>
</body></html>`

  return { subject, text, html }
}

function stat(label: string, n: number, color: string): string {
  return `
    <div style="flex: 1; min-width: 100px; padding: 10px 12px; border: 1px solid #e5e7eb; border-radius: 8px;">
      <div style="font-family: 'Instrument Serif', Georgia, serif; font-size: 24px; color: ${color}; line-height: 1;">${n}</div>
      <div style="font-size: 10.5px; color: #6b7280; margin-top: 4px; text-transform: uppercase; letter-spacing: 0.08em;">${label}</div>
    </div>`
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}
