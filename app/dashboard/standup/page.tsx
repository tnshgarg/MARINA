import { redirect } from 'next/navigation'
import { and, eq, isNull } from 'drizzle-orm'
import { auth } from '@/auth'
import { db, schema } from '@/lib/db/client'
import { listMembershipsForCurrentUser } from '@/lib/auth/guards'
import { buildStandupPrefill } from '@/lib/brief/standup'
import {
  getTodayStandup,
  usersWithStandupToday,
  standupsForOrgDay,
  recentStandupsForUser,
  todayIso,
} from '@/lib/standups/save'
import { StandupCard } from '@/components/standup-card'
import { StandupThread } from '@/components/standup-thread'
import { MentionText } from '@/components/mention-text'
import { CharacterAvatar } from '@/components/character-avatar'

export const dynamic = 'force-dynamic'

/** Employee Daily standup — submit today, see the team's (✓/pending) and history. */
export default async function StandupPage() {
  const session = await auth()
  if (!session?.appUserId || !session.login) redirect('/')
  const memberships = await listMembershipsForCurrentUser()
  const primaryOrg = memberships[0] ?? null
  if (!primaryOrg) redirect('/dashboard')
  const meId = session.appUserId
  const orgId = primaryOrg.orgId
  const today = todayIso()

  const [prefill, existing, submitted, members, teamsRows, tmRows, todays, history] = await Promise.all([
    buildStandupPrefill(meId),
    getTodayStandup(meId),
    usersWithStandupToday(orgId),
    db
      .select({
        membershipId: schema.memberships.id,
        userId: schema.users.id,
        name: schema.users.name,
        login: schema.users.login,
        image: schema.users.image,
        avatarUrl: schema.users.avatarUrl,
        characterKey: schema.users.characterKey,
      })
      .from(schema.memberships)
      .innerJoin(schema.users, eq(schema.memberships.userId, schema.users.id))
      .where(and(eq(schema.memberships.orgId, orgId), isNull(schema.memberships.endedAt))),
    db.select({ id: schema.teams.id, name: schema.teams.name, color: schema.teams.color }).from(schema.teams).where(eq(schema.teams.orgId, orgId)).orderBy(schema.teams.name),
    db
      .select({ teamId: schema.teamMembers.teamId, membershipId: schema.teamMembers.membershipId })
      .from(schema.teamMembers)
      .innerJoin(schema.teams, eq(schema.teamMembers.teamId, schema.teams.id))
      .where(eq(schema.teams.orgId, orgId)),
    standupsForOrgDay(orgId, today),
    recentStandupsForUser(meId, 21),
  ])

  const contentByUser = new Map(todays.map((s) => [s.userId, s]))
  const teamOfMembership = new Map<number, number[]>() // membershipId -> teamIds
  for (const r of tmRows) {
    const arr = teamOfMembership.get(r.membershipId) ?? []
    arr.push(r.teamId)
    teamOfMembership.set(r.membershipId, arr)
  }

  type Mate = (typeof members)[number]
  const groups: { id: number | null; name: string; color: string | null; mates: Mate[] }[] = []
  for (const t of teamsRows) {
    const mates = members.filter((m) => (teamOfMembership.get(m.membershipId) ?? []).includes(t.id))
    if (mates.length > 0) groups.push({ id: t.id, name: t.name, color: t.color, mates })
  }
  const ungrouped = members.filter((m) => (teamOfMembership.get(m.membershipId) ?? []).length === 0)
  if (ungrouped.length > 0) groups.push({ id: null, name: teamsRows.length > 0 ? 'No team' : 'Everyone', color: null, mates: ungrouped })

  // Put the viewer's own team(s) first — they're what they care about most.
  const myMembershipId = members.find((m) => m.userId === meId)?.membershipId
  const myTeamIds = myMembershipId ? teamOfMembership.get(myMembershipId) ?? [] : []
  groups.sort((a, b) => {
    const rank = (g: { id: number | null }) => (g.id != null && myTeamIds.includes(g.id) ? 0 : g.id == null ? 2 : 1)
    return rank(a) - rank(b)
  })

  // Teammates I can @-mention, and the standups that mentioned me today.
  const teammates = members.filter((m) => m.userId !== meId).map((m) => ({ userId: m.userId, name: m.name, login: m.login }))
  const nameByUser = new Map(members.map((m) => [m.userId, m.name ?? `@${m.login}`]))
  const mentionedMe = todays
    .filter((s) => s.userId !== meId && Array.isArray(s.mentions) && s.mentions.includes(meId))
    .map((s) => ({ name: nameByUser.get(s.userId) ?? 'A teammate', today: s.today, yesterday: s.yesterday, blockers: s.blockers }))

  const todayLabel = new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' })
  const historyPrev = history.filter((h) => h.day !== today)

  return (
    <div className="px-4 pt-4 pb-10 sm:px-8 sm:pt-7 max-w-[1000px] mx-auto fade-in">
      <div className="mb-4">
        <h1 className="app-h1 text-[22px] sm:text-[26px]">Daily standup</h1>
        <p className="mt-1 text-[13px] text-[var(--m-ink-2)]">Post your update, see where the team is, and talk it through. · {todayLabel}</p>
      </div>

      {/* Mentions — where teammates tagged you today. Reply in the discussion. */}
      {mentionedMe.length > 0 && (
        <section className="mb-4 rounded-xl border border-[var(--m-good)]/40 bg-[var(--m-good)]/[0.06] p-4">
          <div className="flex items-center gap-2 mb-2">
            <span className="shrink-0 w-6 h-6 rounded-full bg-[var(--m-good)] text-white inline-flex items-center justify-center text-[12px] font-semibold">@</span>
            <h2 className="text-[13.5px] font-semibold text-[var(--m-ink)]">You were mentioned</h2>
            <span className="text-[11.5px] text-[var(--m-ink-4)]">{mentionedMe.length} today</span>
          </div>
          <ul className="space-y-2">
            {mentionedMe.map((m, i) => (
              <li key={i} className="text-[12.5px] text-[var(--m-ink-2)] leading-snug">
                <span className="font-semibold text-[var(--m-ink)]">{m.name}</span>
                {m.today && <span className="block"><span className="text-[var(--m-ink-4)]">Today: </span><MentionText text={m.today} /></span>}
                {m.blockers && <span className="block text-[var(--m-bad)]"><span className="opacity-70">Blocked: </span><MentionText text={m.blockers} /></span>}
              </li>
            ))}
          </ul>
          <p className="mt-2 text-[11.5px] text-[var(--m-ink-4)]">Reply in the discussion below to follow up.</p>
        </section>
      )}

      <div className="grid gap-4 lg:grid-cols-2 items-start">
        <div className="grid gap-4">
          <StandupCard orgId={orgId} prefill={prefill} existing={existing} teammates={teammates} />
          <StandupThread orgId={orgId} day={today} teammates={teammates} />
        </div>

        {/* Team status — ✓ submitted / pending, grouped by team. */}
        <div className="grid gap-4">
          <section className="app-card app-card-lg">
            <h2 className="app-h2">Team today</h2>
            <p className="app-sub mt-0.5 mb-3">Who&apos;s posted, and what they&apos;re on.</p>
            <div className="space-y-4">
              {groups.map((g) => (
                <div key={g.id ?? 'none'}>
                  <p className="text-[12px] font-semibold text-[var(--m-ink-2)] mb-1.5 flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full" style={{ background: g.color || 'var(--m-ink-4)' }} aria-hidden />
                    {g.name}
                    <span className="text-[11px] font-normal text-[var(--m-ink-4)]">
                      {g.mates.filter((m) => submitted.has(m.userId)).length}/{g.mates.length} posted
                    </span>
                  </p>
                  <ul className="space-y-1.5">
                    {g.mates.map((m) => {
                      const did = submitted.has(m.userId)
                      const content = contentByUser.get(m.userId)
                      const taggedMe = !!content && Array.isArray(content.mentions) && content.mentions.includes(meId) && m.userId !== meId
                      return (
                        <li key={m.membershipId} className={`rounded-lg border bg-white ${taggedMe ? 'border-[var(--m-accent)]/50' : 'border-[var(--m-border-soft)]'}`}>
                          {did && content ? (
                            <details className="group" open={taggedMe}>
                              <summary className="flex items-center gap-2.5 px-3 py-2 cursor-pointer list-none">
                                <CharacterAvatar characterKey={m.characterKey} name={m.name ?? m.login} login={m.login} imageUrl={m.image ?? m.avatarUrl} size={26} />
                                <span className="text-[12.5px] font-medium text-[var(--m-ink)] truncate flex-1">{m.name ?? `@${m.login}`}</span>
                                {taggedMe && (
                                  <span className="shrink-0 text-[10px] font-semibold px-1.5 py-0.5 rounded bg-[var(--m-accent)] text-white">@ you</span>
                                )}
                                <StatusPill done />
                              </summary>
                              <div className="px-3 pb-3 pt-0.5 text-[12.5px] text-[var(--m-ink-2)] space-y-1.5 whitespace-pre-wrap break-words">
                                {content.today && <p><span className="text-[var(--m-ink-4)]">Today:</span> <MentionText text={content.today} /></p>}
                                {content.yesterday && <p><span className="text-[var(--m-ink-4)]">Yesterday:</span> <MentionText text={content.yesterday} /></p>}
                                {content.blockers && <p className="text-[var(--m-bad)]"><span className="opacity-70">Blocked:</span> <MentionText text={content.blockers} /></p>}
                              </div>
                            </details>
                          ) : (
                            <div className="flex items-center gap-2.5 px-3 py-2">
                              <CharacterAvatar characterKey={m.characterKey} name={m.name ?? m.login} login={m.login} imageUrl={m.image ?? m.avatarUrl} size={26} />
                              <span className="text-[12.5px] font-medium text-[var(--m-ink)] truncate flex-1">{m.name ?? `@${m.login}`}</span>
                              <StatusPill />
                            </div>
                          )}
                        </li>
                      )
                    })}
                  </ul>
                </div>
              ))}
            </div>
          </section>
        </div>
      </div>

      {/* History */}
      <section className="mt-6">
        <h2 className="app-eyebrow mb-2">Your previous standups</h2>
        {historyPrev.length === 0 ? (
          <p className="text-[13px] text-[var(--m-ink-3)] rounded-xl border border-[var(--m-border)] bg-white px-4 py-5 text-center">
            Once you post on more days, they&apos;ll stack up here.
          </p>
        ) : (
          <ul className="space-y-2">
            {historyPrev.map((h) => (
              <li key={h.id} className="rounded-xl border border-[var(--m-border)] bg-white px-4 py-3">
                <p className="text-[12px] font-semibold text-[var(--m-ink)] mb-1">
                  {new Date(h.day + 'T00:00:00').toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })}
                </p>
                <div className="text-[12.5px] text-[var(--m-ink-2)] space-y-1 whitespace-pre-wrap break-words">
                  {h.today && <p><span className="text-[var(--m-ink-4)]">Did:</span> <MentionText text={h.today} /></p>}
                  {h.blockers && <p className="text-[var(--m-bad)]"><span className="opacity-70">Blocked:</span> <MentionText text={h.blockers} /></p>}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}

function StatusPill({ done }: { done?: boolean }) {
  return done ? (
    <span className="shrink-0 inline-flex items-center gap-1 text-[11px] font-medium px-1.5 py-0.5 rounded bg-[var(--m-good)]/12 text-[var(--m-good)]">
      <svg width={11} height={11} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3} aria-hidden>
        <path d="M5 12l5 5L20 7" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      Posted
    </span>
  ) : (
    <span className="shrink-0 inline-flex items-center gap-1 text-[11px] font-medium px-1.5 py-0.5 rounded bg-[var(--m-bg-soft)] text-[var(--m-ink-4)]">
      Pending
    </span>
  )
}
