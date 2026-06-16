import { notFound } from 'next/navigation'
import { and, desc, eq, gte, inArray, isNotNull, isNull, lt } from 'drizzle-orm'
import { auth } from '@/auth'
import { db, schema } from '@/lib/db/client'
import { getVisibleScope } from '@/lib/auth/scope'
import { hideSeedRows, isTestMode } from '@/lib/dev-state'
import CalendarHubClient from './client'
import CalendarBoard, { type CalPerson } from './board'

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
  // In test mode, show the calendar UI with seeded meetings even without a real
  // Google link, so the feature is testable end-to-end on demo data.
  const connected = isTestMode() || !!googleAccount

  const now = new Date()
  const todayMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate())

  const [upcoming, pastRecent, pastCountRows] = await Promise.all([
    db
      .select()
      .from(schema.meetings)
      .where(and(eq(schema.meetings.userId, userId), gte(schema.meetings.startAt, todayMidnight), hideSeedRows(schema.meetings.externalId)))
      .orderBy(schema.meetings.startAt)
      .limit(60),
    db
      .select()
      .from(schema.meetings)
      .where(and(eq(schema.meetings.userId, userId), lt(schema.meetings.startAt, now), hideSeedRows(schema.meetings.externalId)))
      .orderBy(desc(schema.meetings.startAt))
      .limit(8),
    db
      .select({ id: schema.meetings.id })
      .from(schema.meetings)
      .where(and(eq(schema.meetings.userId, userId), lt(schema.meetings.startAt, now), hideSeedRows(schema.meetings.externalId))),
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

  // ── Team / company meetings ────────────────────────────────────────────────
  // RBAC: a manager sees only the schedules of people they manage; an admin / HR
  // (view_all_data) sees everyone. Names are resolved across the whole org so a
  // teammate's cross-team meeting still shows who they're with — but you can only
  // open ("drill into") people inside your scope.
  const viewerMembership = await db.query.memberships.findFirst({
    where: and(eq(schema.memberships.orgId, orgId), eq(schema.memberships.userId, userId), isNull(schema.memberships.endedAt)),
  })
  let companyPeople: CalPerson[] | null = null
  let boardTitle = 'Team meetings'
  if (viewerMembership) {
    const scope = await getVisibleScope(orgId, {
      userId,
      membershipId: viewerMembership.id,
      role: viewerMembership.role as 'admin' | 'manager' | 'lead' | 'member',
    })
    boardTitle = scope.isAdminScope ? 'Company meetings' : 'Team meetings'
    const allMembers = await db
      .select({ userId: schema.users.id, name: schema.users.name, login: schema.users.login, email: schema.users.email })
      .from(schema.memberships)
      .innerJoin(schema.users, eq(schema.memberships.userId, schema.users.id))
      .where(and(eq(schema.memberships.orgId, orgId), isNull(schema.memberships.endedAt)))
    const allIds = allMembers.map((m) => m.userId)
    const scoped = scope.isAdminScope ? new Set(allIds) : scope.userIds
    const emailToUser = new Map<string, number>()
    for (const m of allMembers) if (m.email) emailToUser.set(m.email.toLowerCase(), m.userId)
    const nameByUser = new Map(allMembers.map((m) => [m.userId, m.name ?? `@${m.login}`]))
    const winStart = new Date(now.getTime() - 14 * DAY_MS)
    const winEnd = new Date(now.getTime() + 14 * DAY_MS)
    const allMeetings = allIds.length
      ? await db
          .select({ userId: schema.meetings.userId, title: schema.meetings.title, startAt: schema.meetings.startAt, attendees: schema.meetings.attendees })
          .from(schema.meetings)
          .where(and(inArray(schema.meetings.userId, allIds), gte(schema.meetings.startAt, winStart), lt(schema.meetings.startAt, winEnd), hideSeedRows(schema.meetings.externalId)))
          .orderBy(schema.meetings.startAt)
      : []
    // A schedule only for IN-SCOPE people — covering meetings they own OR attend.
    const part: Record<number, { meetings: Array<{ title: string; startAt: string }>; neighbors: Map<number, number> }> = {}
    for (const id of allIds) if (scoped.has(id)) part[id] = { meetings: [], neighbors: new Map() }
    for (const mt of allMeetings) {
      const attendeeIds = (Array.isArray(mt.attendees) ? mt.attendees : [])
        .map((e) => emailToUser.get(String(e).toLowerCase()))
        .filter((x): x is number => x != null)
      const participants = Array.from(new Set([mt.userId, ...attendeeIds]))
      for (const pid of participants) {
        const p = part[pid]
        if (!p) continue
        if (p.meetings.length < 30) p.meetings.push({ title: mt.title, startAt: mt.startAt.toISOString() })
        for (const other of participants) if (other !== pid) p.neighbors.set(other, (p.neighbors.get(other) ?? 0) + 1)
      }
    }
    const nowMs = now.getTime()
    companyPeople = allMembers
      .filter((m) => scoped.has(m.userId) && part[m.userId])
      .map((m): CalPerson => {
        const p = part[m.userId]
        const withPeople = [...p.neighbors.entries()].sort((a, b) => b[1] - a[1]).map(([id]) => nameByUser.get(id)!).filter(Boolean)
        const meetings = p.meetings.slice().sort((a, b) => {
          const am = new Date(a.startAt).getTime()
          const bm = new Date(b.startAt).getTime()
          const aUp = am >= nowMs
          const bUp = bm >= nowMs
          if (aUp && bUp) return am - bm
          if (aUp) return -1
          if (bUp) return 1
          return bm - am
        })
        return { id: m.userId, name: nameByUser.get(m.userId)!, count: p.meetings.length, withPeople, meetings, total: p.meetings.length }
      })
      .filter((p) => p.count > 0)
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

      {companyPeople && (
        <div className="max-w-5xl mt-9">
          <h2 className="text-[15px] font-semibold text-[var(--m-ink)] mb-1">{boardTitle}</h2>
          <p className="text-[11px] text-[var(--m-ink-4)] mb-3">Who&apos;s meeting with whom · click anyone to see their full schedule · ±14 days</p>
          {companyPeople.length === 0 ? (
            <div className="rounded-xl border border-[var(--m-border)] bg-white px-4 py-8 text-center text-[12.5px] text-[var(--m-ink-3)]">
              No meetings across the team in this window — teammates need Google Calendar connected.
            </div>
          ) : (
            <CalendarBoard people={companyPeople} />
          )}
        </div>
      )}
    </>
  )
}
