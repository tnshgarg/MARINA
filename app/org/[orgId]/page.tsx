import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { desc, eq, inArray } from 'drizzle-orm'
import { auth, signOut } from '@/auth'
import { db, schema } from '@/lib/db/client'
import { requireMembership, HttpError, roleAtLeast } from '@/lib/auth/guards'
import { getCompactSummaries } from '@/lib/activity/aggregate'
import TeamDashboardClient from './client'

export const dynamic = 'force-dynamic'

export default async function OrgPage({ params }: { params: Promise<{ orgId: string }> }) {
  const { orgId: raw } = await params
  const orgId = Number(raw)
  if (!Number.isInteger(orgId)) notFound()

  let viewer: Awaited<ReturnType<typeof requireMembership>>
  try {
    viewer = await requireMembership(orgId, 'member')
  } catch (err) {
    if (err instanceof HttpError && err.status === 401) redirect('/')
    if (err instanceof HttpError && err.status === 403) redirect('/onboarding')
    throw err
  }

  const session = await auth()
  const org = await db.query.orgs.findFirst({ where: eq(schema.orgs.id, orgId) })
  if (!org) notFound()

  const rawMembers = await db
    .select({
      m: schema.memberships,
      u: schema.users,
    })
    .from(schema.memberships)
    .innerJoin(schema.users, eq(schema.memberships.userId, schema.users.id))
    .where(eq(schema.memberships.orgId, orgId))

  const userIds = rawMembers.map((r) => r.u.id)
  const narratives = userIds.length
    ? await db
        .select()
        .from(schema.narratives)
        .where(inArray(schema.narratives.userId, userIds))
        .orderBy(desc(schema.narratives.createdAt))
    : []
  const compact = await getCompactSummaries(userIds)
  const settingsRows = userIds.length
    ? await db
        .select()
        .from(schema.userSettings)
        .where(inArray(schema.userSettings.userId, userIds))
    : []
  const settingsByUser = new Map(settingsRows.map((s) => [s.userId, s]))

  const latestByUser = new Map<number, (typeof narratives)[number]>()
  for (const n of narratives) {
    if (!latestByUser.has(n.userId)) latestByUser.set(n.userId, n)
  }

  const isManager = roleAtLeast(viewer.membership.role, 'manager')

  const members = rawMembers.map((r) => {
    const n = latestByUser.get(r.u.id)
    const c = compact.get(r.u.id)
    const s = settingsByUser.get(r.u.id)
    return {
      membershipId: r.m.id,
      userId: r.u.id,
      login: r.u.login,
      name: r.u.name,
      avatarUrl: r.u.avatarUrl,
      role: r.m.role,
      hasGithub: !!r.u.accessToken,
      activity: {
        activeSeconds: c?.activeSeconds ?? 0,
        idleSeconds: c?.idleSeconds ?? 0,
        topApp: c?.topApp ?? null,
        paused: !!s?.trackingPausedAt,
      },
      narrative: n
        ? {
            id: n.id,
            body: n.body,
            signal: n.signal,
            blockers: n.blockers,
            provider: n.provider,
            model: n.model,
            createdAt: n.createdAt.toISOString(),
          }
        : null,
    }
  })

  return (
    <main className="min-h-screen bg-zinc-50 dark:bg-black">
      <header className="border-b border-zinc-200 bg-white dark:border-zinc-800 dark:bg-black">
        <div className="max-w-5xl mx-auto px-6 py-4 flex items-center justify-between">
          <div>
            <p className="text-xs uppercase tracking-widest text-zinc-500">{org.name}</p>
            <h1 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">Team dashboard</h1>
          </div>
          <div className="flex items-center gap-4 text-sm">
            <Link href="/dashboard" className="text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100">
              My view
            </Link>
            {isManager && (
              <Link
                href={`/org/${orgId}/members`}
                className="text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
              >
                Members
              </Link>
            )}
            <Link
              href="/settings"
              className="text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
            >
              Settings
            </Link>
            <span className="text-xs text-zinc-500">
              @{session?.login} · {viewer.membership.role}
            </span>
            <form
              action={async () => {
                'use server'
                await signOut({ redirectTo: '/' })
              }}
            >
              <button type="submit" className="text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100">
                Sign out
              </button>
            </form>
          </div>
        </div>
      </header>

      <TeamDashboardClient orgId={orgId} isManager={isManager} members={members} />
    </main>
  )
}
