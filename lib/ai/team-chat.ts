import { and, desc, eq, gte, inArray, isNull } from 'drizzle-orm'
import { db, schema } from '@/lib/db/client'
import { generateWithFallback } from '@/lib/ai/registry'
import type { ChatMessage } from '@/lib/ai/provider'
import type { ChatTurn } from '@/lib/ai/employee-chat'

const DAY_MS = 24 * 60 * 60 * 1000

/**
 * "Ask MARINA about this team" — the team-level counterpart to the per-employee
 * chat. A manager / admin can ask about the WHOLE team they're allowed to see:
 * who shipped what, who's blocked, who's on leave, how the team is trending —
 * and drill into any individual contributor within it.
 *
 * Grounding strategy: rather than dump every raw row for up to 50 people (huge
 * + expensive), we build ONE compact per-member summary (hours, output,
 * blockers, leaves, recent deliverables) plus team totals. The model answers
 * from that. Scope is enforced UPSTREAM by the caller passing the exact set of
 * userIds the viewer may see — this module never widens it.
 */
export async function buildTeamContext(input: {
  orgId: number
  userIds: number[]
  windowDays?: number
}): Promise<string> {
  const windowDays = input.windowDays ?? 14
  const ids = Array.from(new Set(input.userIds)).filter((n) => Number.isInteger(n))
  if (ids.length === 0) return JSON.stringify({ team: [], note: 'No members in scope.' })
  const since = new Date(Date.now() - windowDays * DAY_MS)
  const todayIso = new Date().toISOString().slice(0, 10)

  const [users, memberships, shifts, deliverables, leaves, blocks, ghEvents] = await Promise.all([
    db.select().from(schema.users).where(inArray(schema.users.id, ids)),
    db
      .select()
      .from(schema.memberships)
      .where(and(eq(schema.memberships.orgId, input.orgId), inArray(schema.memberships.userId, ids), isNull(schema.memberships.endedAt))),
    db
      .select({ userId: schema.shifts.userId, punchedInAt: schema.shifts.punchedInAt, punchedOutAt: schema.shifts.punchedOutAt })
      .from(schema.shifts)
      .where(and(inArray(schema.shifts.userId, ids), gte(schema.shifts.punchedInAt, since))),
    db
      .select({ userId: schema.deliverables.userId, title: schema.deliverables.title, completedAt: schema.deliverables.completedAt })
      .from(schema.deliverables)
      .where(and(inArray(schema.deliverables.userId, ids), gte(schema.deliverables.completedAt, since)))
      .orderBy(desc(schema.deliverables.completedAt)),
    db
      .select({
        userId: schema.leaveRequests.userId,
        startDate: schema.leaveRequests.startDate,
        endDate: schema.leaveRequests.endDate,
        leaveType: schema.leaveRequests.leaveType,
        status: schema.leaveRequests.status,
      })
      .from(schema.leaveRequests)
      .where(and(eq(schema.leaveRequests.orgId, input.orgId), inArray(schema.leaveRequests.userId, ids), gte(schema.leaveRequests.createdAt, since)))
      .orderBy(desc(schema.leaveRequests.createdAt)),
    db
      .select({ userId: schema.breaks.userId, reason: schema.breaks.reason, startedAt: schema.breaks.startedAt, endedAt: schema.breaks.endedAt })
      .from(schema.breaks)
      .where(and(inArray(schema.breaks.userId, ids), eq(schema.breaks.category, 'blocked'), gte(schema.breaks.startedAt, since)))
      .orderBy(desc(schema.breaks.startedAt)),
    db
      .select({ userId: schema.githubEvents.userId })
      .from(schema.githubEvents)
      .where(and(inArray(schema.githubEvents.userId, ids), gte(schema.githubEvents.occurredAt, since))),
  ])

  const userById = new Map(users.map((u) => [u.id, u]))
  const memByUser = new Map(memberships.map((m) => [m.userId, m]))

  // Aggregate per user.
  type Agg = {
    shiftMinutes: number
    shiftCount: number
    deliverables: string[]
    leaves: Array<{ startDate: string; endDate: string; leaveType: string; status: string }>
    activeBlocker: { reason: string; startedAt: string } | null
    pastBlockerCount: number
    githubEvents: number
  }
  const agg = new Map<number, Agg>()
  const get = (uid: number): Agg => {
    let a = agg.get(uid)
    if (!a) {
      a = { shiftMinutes: 0, shiftCount: 0, deliverables: [], leaves: [], activeBlocker: null, pastBlockerCount: 0, githubEvents: 0 }
      agg.set(uid, a)
    }
    return a
  }
  for (const s of shifts) {
    const a = get(s.userId)
    a.shiftCount++
    a.shiftMinutes += s.punchedOutAt
      ? Math.round((s.punchedOutAt.getTime() - s.punchedInAt.getTime()) / 60000)
      : Math.round((Date.now() - s.punchedInAt.getTime()) / 60000)
  }
  for (const d of deliverables) {
    const a = get(d.userId)
    if (a.deliverables.length < 5) a.deliverables.push(d.title)
  }
  for (const l of leaves) {
    const a = get(l.userId)
    if (a.leaves.length < 6) a.leaves.push({ startDate: l.startDate, endDate: l.endDate, leaveType: l.leaveType, status: l.status })
  }
  for (const b of blocks) {
    const a = get(b.userId)
    a.pastBlockerCount++
    if (!b.endedAt && !a.activeBlocker) a.activeBlocker = { reason: b.reason ?? '', startedAt: b.startedAt.toISOString() }
  }
  for (const g of ghEvents) get(g.userId).githubEvents++

  const team = ids.map((uid) => {
    const u = userById.get(uid)
    const m = memByUser.get(uid)
    const a = agg.get(uid)
    return {
      name: u?.name ?? u?.login ?? `user-${uid}`,
      role: m?.role ?? 'member',
      discipline: (m as { discipline?: string } | undefined)?.discipline ?? 'other',
      jobTitle: (m as { jobTitle?: string | null } | undefined)?.jobTitle ?? null,
      hoursLogged: a ? Math.round((a.shiftMinutes / 60) * 10) / 10 : 0,
      shiftCount: a?.shiftCount ?? 0,
      deliverables: a?.deliverables ?? [],
      githubEvents: a?.githubEvents ?? 0,
      leaves: a?.leaves ?? [],
      activeBlocker: a?.activeBlocker ?? null,
      blockersInWindow: a?.pastBlockerCount ?? 0,
    }
  })

  const ctx = {
    windowDays,
    windowStart: since.toISOString().slice(0, 10),
    today: todayIso,
    teamSize: team.length,
    totals: {
      totalHoursLogged: Math.round(team.reduce((s, t) => s + t.hoursLogged, 0) * 10) / 10,
      totalDeliverables: deliverables.length,
      peopleWithActiveBlocker: team.filter((t) => t.activeBlocker).length,
      peopleOnOrTakingLeave: team.filter((t) => t.leaves.some((l) => l.status === 'approved' || l.status === 'pending')).length,
    },
    team,
  }
  return JSON.stringify(ctx, null, 2)
}

const TEAM_SYSTEM_PROMPT = `You are MARINA, a concise people-data assistant. You answer a manager or admin's questions about THEIR TEAM using ONLY the JSON context block provided. The context lists each team member with their hours logged, shifts, deliverables, GitHub activity, leaves, and any active blocker, plus team totals — all for the stated time window.

RULES — not optional:
1. Ground every claim in the context. Quote specific people, deliverable titles, hours, dates when available.
2. You CAN answer about individual contributors in the team ("what did Priya ship?", "who is blocked?", "who took leave?") and about the team as a whole ("how is the team doing this week?").
3. If the answer is not in the context, say so plainly. Never speculate or invent specifics.
4. If asked about a person who is NOT in the provided team context, say you don't have data for them — you only see this manager's team.
5. Keep responses tight: 2-5 sentences for simple questions; short bullet lists for "who/list" questions.
6. Stay within the stated time window. Don't claim to know about periods outside it.
7. Be neutral and evidence-based. Present what the data shows; don't editorialise about individuals' worth.
8. Never expose raw JSON or internal IDs.

Format: plain text or short markdown lists. No headings, no preambles like "Based on the data". Just answer.`

export async function chatAboutTeam(input: {
  orgId: number
  userIds: number[]
  history: ChatTurn[]
  question: string
}): Promise<{ answer: string; provider: string; model: string; contextBytes: number }> {
  const ctxBlob = await buildTeamContext({ orgId: input.orgId, userIds: input.userIds })

  const messages: ChatMessage[] = [
    { role: 'system', content: TEAM_SYSTEM_PROMPT },
    { role: 'system', content: `Team context (JSON). Use ONLY this when answering:\n\n${ctxBlob}` },
    ...input.history.slice(-6).map<ChatMessage>((t) => ({ role: t.role, content: t.content })),
    { role: 'user', content: input.question },
  ]

  const { text, provider, model } = await generateWithFallback(messages, {
    temperature: 0.3,
    maxTokens: 700,
  })

  return { answer: text.trim(), provider, model, contextBytes: ctxBlob.length }
}
