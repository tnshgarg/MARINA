import { redirect } from 'next/navigation'
import { and, desc, eq, isNull } from 'drizzle-orm'
import { auth, signOut } from '@/auth'
import { db, schema } from '@/lib/db/client'
import { listMembershipsForCurrentUser, roleAtLeast } from '@/lib/auth/guards'
import { EmployeeSidebar } from '@/components/employee-sidebar'
import { MobileNav } from '@/components/mobile-nav'

export const dynamic = 'force-dynamic'

/**
 * Employee console shell. Org members get the persistent sidebar + main area
 * (each feature is its own page). Solo employees (no org) keep their clean
 * standalone dashboard, so we render their page through untouched.
 */
export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await auth()
  if (!session?.appUserId || !session.login) redirect('/')

  const memberships = await listMembershipsForCurrentUser()
  const primaryOrg = memberships[0] ?? null

  // Solo employee — no org, no shell. Their page owns the full viewport.
  if (!primaryOrg) return <>{children}</>

  const me = await db.query.users.findFirst({ where: eq(schema.users.id, session.appUserId) })
  if (!me) redirect('/')

  const activeShiftRows = await db
    .select({ punchedInAt: schema.shifts.punchedInAt })
    .from(schema.shifts)
    .where(and(eq(schema.shifts.userId, session.appUserId), isNull(schema.shifts.punchedOutAt)))
    .orderBy(desc(schema.shifts.punchedInAt))
    .limit(1)
  const activeSince = activeShiftRows[0]?.punchedInAt.toISOString() ?? null

  async function doSignOut() {
    'use server'
    await signOut({ redirectTo: '/' })
  }

  return (
    <div className="app-shell">
      <EmployeeSidebar
        orgId={primaryOrg.orgId}
        canSeeTeam={roleAtLeast(primaryOrg.role, 'manager')}
        isOrgMember
        userName={me.name}
        userLogin={session.login}
        userAvatarUrl={me.image ?? me.avatarUrl ?? null}
        characterKey={me.characterKey}
        activeSince={activeSince}
        signOutAction={doSignOut}
      />
      <main className="bg-[var(--m-bg)] min-w-0">
        <MobileNav orgName="My console" />
        {children}
      </main>
    </div>
  )
}
