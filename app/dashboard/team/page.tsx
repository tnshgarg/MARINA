import { redirect } from 'next/navigation'
import { and, eq, inArray, isNull, ne } from 'drizzle-orm'
import { auth } from '@/auth'
import { db, schema } from '@/lib/db/client'
import { listMembershipsForCurrentUser } from '@/lib/auth/guards'
import { CharacterAvatar } from '@/components/character-avatar'

export const dynamic = 'force-dynamic'

type Person = {
  membershipId: number
  userId: number
  name: string | null
  login: string
  image: string | null
  avatarUrl: string | null
  characterKey: string | null
  role: string
  jobTitle: string | null
}

/** Employee "My team" — who you work with and who you report to. */
export default async function MyTeamPage() {
  const session = await auth()
  if (!session?.appUserId || !session.login) redirect('/')
  const memberships = await listMembershipsForCurrentUser()
  const primaryOrg = memberships[0] ?? null
  if (!primaryOrg) redirect('/dashboard')
  const meId = session.appUserId
  const orgId = primaryOrg.orgId

  const [myMem] = await db
    .select({ id: schema.memberships.id, reportsTo: schema.memberships.reportsToMembershipId })
    .from(schema.memberships)
    .where(and(eq(schema.memberships.orgId, orgId), eq(schema.memberships.userId, meId), isNull(schema.memberships.endedAt)))
    .limit(1)
  if (!myMem) redirect('/dashboard')

  const personCols = {
    membershipId: schema.memberships.id,
    userId: schema.users.id,
    name: schema.users.name,
    login: schema.users.login,
    image: schema.users.image,
    avatarUrl: schema.users.avatarUrl,
    characterKey: schema.users.characterKey,
    role: schema.memberships.role,
    jobTitle: schema.memberships.jobTitle,
  }

  // My teams + their members.
  const myTeams = await db
    .select({ id: schema.teams.id, name: schema.teams.name, color: schema.teams.color, managerMembershipId: schema.teams.managerMembershipId })
    .from(schema.teamMembers)
    .innerJoin(schema.teams, eq(schema.teamMembers.teamId, schema.teams.id))
    .where(eq(schema.teamMembers.membershipId, myMem.id))

  const teamIds = myTeams.map((t) => t.id)
  const teamMemberRows = teamIds.length
    ? await db
        .select({ teamId: schema.teamMembers.teamId, ...personCols })
        .from(schema.teamMembers)
        .innerJoin(schema.memberships, eq(schema.teamMembers.membershipId, schema.memberships.id))
        .innerJoin(schema.users, eq(schema.memberships.userId, schema.users.id))
        .where(and(inArray(schema.teamMembers.teamId, teamIds), isNull(schema.memberships.endedAt)))
    : []

  // Who I report to: explicit manager links, with a legacy single-manager fallback.
  let managers: Person[] = await db
    .select(personCols)
    .from(schema.membershipManagers)
    .innerJoin(schema.memberships, eq(schema.membershipManagers.managerMembershipId, schema.memberships.id))
    .innerJoin(schema.users, eq(schema.memberships.userId, schema.users.id))
    .where(eq(schema.membershipManagers.membershipId, myMem.id))
  if (managers.length === 0 && myMem.reportsTo) {
    managers = await db
      .select(personCols)
      .from(schema.memberships)
      .innerJoin(schema.users, eq(schema.memberships.userId, schema.users.id))
      .where(eq(schema.memberships.id, myMem.reportsTo))
  }

  // Fallback when the person isn't on any team yet — show their org-mates.
  const orgMates: Person[] =
    teamIds.length === 0
      ? await db
          .select(personCols)
          .from(schema.memberships)
          .innerJoin(schema.users, eq(schema.memberships.userId, schema.users.id))
          .where(and(eq(schema.memberships.orgId, orgId), isNull(schema.memberships.endedAt), ne(schema.memberships.userId, meId)))
          .limit(40)
      : []

  return (
    <div className="px-4 pt-4 pb-10 sm:px-8 sm:pt-7 max-w-[1000px] mx-auto fade-in">
      <div className="mb-5">
        <h1 className="app-h1 text-[22px] sm:text-[26px]">My team</h1>
        <p className="mt-1 text-[13px] text-[var(--m-ink-2)]">Who you work with, and who you report to.</p>
      </div>

      {/* Reports to */}
      <section className="mb-6">
        <h2 className="app-eyebrow mb-2">You report to</h2>
        {managers.length === 0 ? (
          <p className="text-[13px] text-[var(--m-ink-3)] rounded-xl border border-[var(--m-border)] bg-white px-4 py-4">
            No manager set yet. An admin can set your reporting line in Teams.
          </p>
        ) : (
          <div className="flex flex-wrap gap-2.5">
            {managers.map((m) => (
              <PersonChip key={m.membershipId} p={m} highlight />
            ))}
          </div>
        )}
      </section>

      {/* Teams */}
      {myTeams.length > 0 ? (
        myTeams.map((t) => {
          const members = teamMemberRows.filter((r) => r.teamId === t.id)
          return (
            <section key={t.id} className="mb-6">
              <h2 className="text-[14px] font-semibold text-[var(--m-ink)] mb-2 flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full" style={{ background: t.color || 'var(--m-accent)' }} aria-hidden />
                {t.name}
                <span className="text-[12px] font-normal text-[var(--m-ink-4)]">· {members.length}</span>
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
                {members.map((p) => (
                  <PersonChip key={p.membershipId} p={p} highlight={p.membershipId === t.managerMembershipId} note={p.membershipId === t.managerMembershipId ? 'Team lead' : undefined} />
                ))}
              </div>
            </section>
          )
        })
      ) : (
        <section className="mb-6">
          <h2 className="app-eyebrow mb-2">Your colleagues</h2>
          {orgMates.length === 0 ? (
            <p className="text-[13px] text-[var(--m-ink-3)]">You&apos;re the only one here so far.</p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
              {orgMates.map((p) => (
                <PersonChip key={p.membershipId} p={p} />
              ))}
            </div>
          )}
        </section>
      )}
    </div>
  )
}

function PersonChip({ p, highlight, note }: { p: Person; highlight?: boolean; note?: string }) {
  return (
    <div className={`rounded-xl border px-3 py-2.5 flex items-center gap-2.5 ${highlight ? 'border-[var(--m-accent)]/50 bg-[var(--m-accent-soft)]/50' : 'border-[var(--m-border)] bg-white'}`}>
      <CharacterAvatar characterKey={p.characterKey} name={p.name ?? p.login} login={p.login} imageUrl={p.image ?? p.avatarUrl} size={34} />
      <div className="min-w-0">
        <p className="text-[13px] font-medium text-[var(--m-ink)] truncate">{p.name ?? `@${p.login}`}</p>
        <p className="text-[11.5px] text-[var(--m-ink-3)] truncate">{note ?? p.jobTitle ?? p.role}</p>
      </div>
    </div>
  )
}
