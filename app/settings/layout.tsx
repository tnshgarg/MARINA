import { redirect } from 'next/navigation'
import { and, eq } from 'drizzle-orm'
import { auth, signOut as serverSignOut } from '@/auth'
import { db, schema } from '@/lib/db/client'
import { listMembershipsForCurrentUser, roleAtLeast } from '@/lib/auth/guards'
import { capabilitiesFor } from '@/lib/auth/capabilities'
import { OrgSidebar } from '@/components/org-sidebar'
import { MobileNav } from '@/components/mobile-nav'

/**
 * Settings inherits the workspace sidebar so navigation context (org, role,
 * pending-leave badge) doesn't disappear when a manager clicks "My Settings".
 * If the viewer has no manager-or-above membership, we render a minimal shell
 * — they shouldn't have a team sidebar without a team to manage.
 */
export default async function SettingsLayout({ children }: { children: React.ReactNode }) {
  const session = await auth()
  if (!session?.appUserId || !session.login) redirect('/')

  const me = await db.query.users.findFirst({ where: eq(schema.users.id, session.appUserId) })
  if (!me) redirect('/')

  const memberships = await listMembershipsForCurrentUser()
  const managerMembership = memberships.find((m) => roleAtLeast(m.role, 'manager'))

  async function signOutAction() {
    'use server'
    await serverSignOut({ redirectTo: '/' })
  }

  if (!managerMembership) {
    // Plain member — render bare shell with a back-to-console link.
    return (
      <div className="min-h-screen bg-[var(--m-bg)]">
        <header className="bg-white border-b border-[var(--m-border)]">
          <div className="max-w-3xl mx-auto px-6 py-3 flex items-center justify-between">
            <a href="/dashboard" className="text-[13px] text-[var(--m-ink-2)] hover:text-[var(--m-accent)]">
              ← Back to console
            </a>
            <form action={signOutAction}>
              <button type="submit" className="text-[13px] text-[var(--m-ink-2)] hover:text-rose-600">
                Sign out
              </button>
            </form>
          </div>
        </header>
        <main className="px-8 pt-8 pb-10 max-w-3xl mx-auto fade-in">{children}</main>
      </div>
    )
  }

  const org = await db.query.orgs.findFirst({ where: eq(schema.orgs.id, managerMembership.orgId) })
  if (!org) redirect('/dashboard')

  const pendingRows = await db
    .select({ id: schema.leaveRequests.id })
    .from(schema.leaveRequests)
    .where(
      and(
        eq(schema.leaveRequests.orgId, managerMembership.orgId),
        eq(schema.leaveRequests.status, 'pending'),
      ),
    )

  return (
    <div className="app-shell">
      <OrgSidebar
        orgId={managerMembership.orgId}
        orgName={org.name}
        userLogin={session.login}
        characterKey={me.characterKey}
        userName={me.name}
        userAvatarUrl={me.image ?? me.avatarUrl ?? null}
        role={managerMembership.role}
        caps={[
          ...capabilitiesFor(
            managerMembership.role,
            (managerMembership as { extraCaps?: string[] }).extraCaps ?? [],
          ),
        ]}
        orgs={memberships.map((m) => ({
          id: m.orgId,
          name: m.org.name,
          role: m.role,
          logoUrl: (m.org as { logoUrl?: string | null }).logoUrl ?? null,
        }))}
        pendingLeaveCount={pendingRows.length}
        signOutAction={signOutAction}
      />
      <main className="bg-[var(--m-bg)] min-w-0">
        <MobileNav orgName={org.name} />
        <div className="px-4 pt-4 pb-10 sm:px-8 sm:pt-8 max-w-[1400px] mx-auto fade-in">{children}</div>
      </main>
    </div>
  )
}
