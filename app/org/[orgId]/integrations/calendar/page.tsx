import { notFound } from 'next/navigation'
import { and, desc, eq, gte, inArray, isNotNull, isNull, lt } from 'drizzle-orm'
import { auth } from '@/auth'
import { db, schema } from '@/lib/db/client'
import { capabilitiesFor } from '@/lib/auth/capabilities'
import CalendarHubClient from './client'
import CalendarConstellation, { type CalDetail } from './constellation'
import type { CNode, CEdge } from '@/components/collaboration-constellation'

export const dynamic = 'force-dynamic'

const DAY_MS = 24 * 60 * 60 * 1000

/**
 * Calendar integration detail — the viewer's own Google Calendar, surfaced as a
 * full workspace tab: today / tomorrow / upcoming meetings, a past-meeting
 * count + recent history, sync, and "schedule a meeting with anyone".
 */
export default async function CalendarHubPage({
  params,
}: {
  params: Promise<{ orgId: string }>
}) {
  const { orgId: raw } = await params
  const orgId = Number(raw)
  if (!Number.isInteger(orgId)) notFound()

  const session = await auth()
  if (!session?.appUserId) notFound()
  const userId = session.appUserId

  const googleAccount = await db.query.accounts.findFirst({
    where: and(
      eq(schema.accounts.userId, userId),
      eq(schema.accounts.provider, 'google'),
      isNotNull(schema.accounts.access_token),
    ),
  })
  const connected = !!googleAccount

  const now = new Date()
  const todayMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate())

  const [upcoming, pastRecent, pastCountRows] = await Promise.all([
    db
      .select()
      .from(schema.meetings)
      .where(and(eq(schema.meetings.userId, userId), gte(schema.meetings.startAt, todayMidnight)))
      .orderBy(schema.meetings.startAt)
      .limit(60),
    db
      .select()
      .from(schema.meetings)
      .where(and(eq(schema.meetings.userId, userId), lt(schema.meetings.startAt, now)))
      .orderBy(desc(schema.meetings.startAt))
      .limit(8),
    db
      .select({ id: schema.meetings.id })
      .from(schema.meetings)
      .where(and(eq(schema.meetings.userId, userId), lt(schema.meetings.startAt, now))),
  ])

  // Active teammates for the "schedule with anyone" picker.
  const teammates = await db
    .select({ membershipId: schema.memberships.id, name: schema.users.name, login: schema.users.login, userId: schema.users.id })
    .from(schema.memberships)
    .innerJoin(schema.users, eq(schema.memberships.userId, schema.users.id))
    .where(and(eq(schema.memberships.orgId, orgId), isNull(schema.memberships.endedAt)))

  const ser = (m: typeof upcoming[number]) => ({
    id: m.id,
    title: m.title,
    startAt: m.startAt.toISOString(),
    endAt: m.endAt.toISOString(),
    location: m.location,
    conferenceUrl: m.conferenceUrl,
    rsvpStatus: m.rsvpStatus,
    attendeeCount: Array.isArray(m.attendees) ? m.attendees.length : 0,
  })

  const todayEnd = new Date(todayMidnight.getTime() + DAY_MS)
  const tomorrowEnd = new Date(todayMidnight.getTime() + 2 * DAY_MS)
  const todayMeetings = upcoming.filter((m) => m.startAt < todayEnd).map(ser)
  const tomorrowMeetings = upcoming.filter((m) => m.startAt >= todayEnd && m.startAt < tomorrowEnd).map(ser)
  const laterMeetings = upcoming.filter((m) => m.startAt >= tomorrowEnd).map(ser)

  // ── Company meeting map (admin / HR only) ──────────────────────────────────
  // Anyone with view_all_data sees a constellation of who-meets-with-whom across
  // the whole company, built from co-attendance over a ±14-day window.
  const viewerMembership = await db.query.memberships.findFirst({
    where: and(eq(schema.memberships.orgId, orgId), eq(schema.memberships.userId, userId), isNull(schema.memberships.endedAt)),
  })
  const viewerCaps = viewerMembership
    ? [...capabilitiesFor(viewerMembership.role as 'admin' | 'manager' | 'lead' | 'member', (viewerMembership as { extraCaps?: string[] }).extraCaps ?? [])]
    : []
  let company: { nodes: CNode[]; edges: CEdge[]; detail: Record<number, CalDetail> } | null = null
  if (viewerCaps.includes('view_all_data')) {
    const members = await db
      .select({ userId: schema.users.id, name: schema.users.name, login: schema.users.login, email: schema.users.email })
      .from(schema.memberships)
      .innerJoin(schema.users, eq(schema.memberships.userId, schema.users.id))
      .where(and(eq(schema.memberships.orgId, orgId), isNull(schema.memberships.endedAt)))
    const memberIds = members.map((m) => m.userId)
    const emailToUser = new Map<string, number>()
    for (const m of members) if (m.email) emailToUser.set(m.email.toLowerCase(), m.userId)
    const nameByUser = new Map(members.map((m) => [m.userId, m.name ?? `@${m.login}`]))
    const winStart = new Date(now.getTime() - 14 * DAY_MS)
    const winEnd = new Date(now.getTime() + 14 * DAY_MS)
    const allMeetings = memberIds.length
      ? await db
          .select({ userId: schema.meetings.userId, title: schema.meetings.title, startAt: schema.meetings.startAt, attendees: schema.meetings.attendees })
          .from(schema.meetings)
          .where(and(inArray(schema.meetings.userId, memberIds), gte(schema.meetings.startAt, winStart), lt(schema.meetings.startAt, winEnd)))
          .orderBy(schema.meetings.startAt)
      : []
    const detailMap: Record<number, CalDetail> = {}
    for (const m of members) detailMap[m.userId] = { name: nameByUser.get(m.userId)!, count: 0, meetings: [] }
    const edgeW = new Map<string, number>()
    for (const mt of allMeetings) {
      const d = detailMap[mt.userId]
      if (d) {
        d.count++
        if (d.meetings.length < 14) d.meetings.push({ title: mt.title, startAt: mt.startAt.toISOString(), attendees: Array.isArray(mt.attendees) ? mt.attendees.length : 0 })
      }
      const atts = Array.isArray(mt.attendees) ? mt.attendees : []
      for (const email of atts) {
        const other = emailToUser.get(String(email).toLowerCase())
        if (other != null && other !== mt.userId) {
          const a = Math.min(other, mt.userId)
          const b = Math.max(other, mt.userId)
          edgeW.set(`${a}|${b}`, (edgeW.get(`${a}|${b}`) ?? 0) + 1)
        }
      }
    }
    const cnodes: CNode[] = []
    const nodeIds = new Set<number>()
    for (const m of members) {
      const c = detailMap[m.userId].count
      if (c > 0) { cnodes.push({ id: m.userId, label: nameByUser.get(m.userId)!, value: c }); nodeIds.add(m.userId) }
    }
    for (const k of edgeW.keys()) {
      const [a, b] = k.split('|').map(Number)
      for (const id of [a, b]) if (!nodeIds.has(id) && detailMap[id]) { cnodes.push({ id, label: nameByUser.get(id)!, value: 1 }); nodeIds.add(id) }
    }
    const cedges: CEdge[] = Array.from(edgeW.entries())
      .map(([k, w]) => { const [a, b] = k.split('|').map(Number); return { source: a, target: b, weight: w } })
      .filter((e) => nodeIds.has(e.source) && nodeIds.has(e.target))
    const detailOut: Record<number, CalDetail> = {}
    for (const id of nodeIds) detailOut[id] = detailMap[id]
    company = { nodes: cnodes, edges: cedges, detail: detailOut }
  }

  return (
    <>
      <CalendarHubClient
        orgId={orgId}
        connected={connected}
        today={todayMeetings}
        tomorrow={tomorrowMeetings}
        later={laterMeetings}
        pastRecent={pastRecent.map(ser)}
        pastCount={pastCountRows.length}
        teammates={teammates
          .filter((t) => t.userId !== userId)
          .map((t) => ({ membershipId: t.membershipId, name: t.name ?? `@${t.login}` }))}
      />

      {company && (
        <div className="max-w-5xl mt-9">
          <div className="flex items-baseline justify-between gap-3 mb-2 flex-wrap">
            <h2 className="text-[15px] font-semibold text-[var(--m-ink)]">Company meeting map</h2>
            <p className="text-[11px] text-[var(--m-ink-4)]">
              ★ size = meetings · lines = shared meetings · <span className="text-[var(--m-ink-3)]">click to drill in</span> · ±14 days
            </p>
          </div>
          {company.nodes.length === 0 ? (
            <div className="rounded-xl border border-[var(--m-border)] bg-white px-4 py-8 text-center text-[12.5px] text-[var(--m-ink-3)]">
              No meetings across the team in this window — teammates need Google Calendar connected.
            </div>
          ) : (
            <CalendarConstellation nodes={company.nodes} edges={company.edges} detail={company.detail} />
          )}
        </div>
      )}
    </>
  )
}
