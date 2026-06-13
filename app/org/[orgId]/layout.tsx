import { notFound, redirect } from 'next/navigation'
import { and, eq, isNull } from 'drizzle-orm'
import { auth, signOut as serverSignOut } from '@/auth'
import { db, schema } from '@/lib/db/client'
import { HttpError, requireMembership, roleAtLeast } from '@/lib/auth/guards'
import { hasCap } from '@/lib/auth/capabilities'
import { OrgSidebar } from '@/components/org-sidebar'
import { MobileNav } from '@/components/mobile-nav'
import { AnnouncementBanner } from '@/components/announcement-banner'

export default async function OrgLayout({
  children,
  params,
}: {
  children: React.ReactNode
  params: Promise<{ orgId: string }>
}) {
  const { orgId: raw } = await params
  const orgId = Number(raw)
  if (!Number.isInteger(orgId)) notFound()

  let viewer
  try {
    viewer = await requireMembership(orgId, 'member')
  } catch (err) {
    if (err instanceof HttpError && err.status === 401) redirect('/')
    if (err instanceof HttpError && err.status === 403) redirect('/onboarding')
    throw err
  }

  // Only managers + owners reach any /org/* page. Plain members go to their console.
  if (!roleAtLeast(viewer.membership.role, 'manager')) {
    redirect('/dashboard')
  }

  const session = await auth()
  if (!session?.appUserId || !session.login) redirect('/')
  const me = await db.query.users.findFirst({ where: eq(schema.users.id, session.appUserId) })
  if (!me) redirect('/')

  const org = await db.query.orgs.findFirst({ where: eq(schema.orgs.id, orgId) })
  if (!org) notFound()

  // Pending leave count for the sidebar badge.
  const pendingRows = await db
    .select({ id: schema.leaveRequests.id })
    .from(schema.leaveRequests)
    .where(
      and(
        eq(schema.leaveRequests.orgId, orgId),
        eq(schema.leaveRequests.status, 'pending')
      )
    )
  const pendingLeaveCount = pendingRows.length

  async function signOutAction() {
    'use server'
    await serverSignOut({ redirectTo: '/' })
  }

  return (
    <div className="app-shell">
      <OrgSidebar
        orgId={orgId}
        orgName={org.name}
        orgLogoUrl={(org as { logoUrl?: string | null }).logoUrl ?? null}
        userLogin={session.login}
        characterKey={me.characterKey}
        userName={me.name}
        userAvatarUrl={me.image ?? me.avatarUrl ?? null}
        role={viewer.membership.role}
        canManageWorkspace={hasCap(
          viewer.membership.role,
          (viewer.membership as { extraCaps?: string[] }).extraCaps ?? [],
          'manage_workspace',
        )}
        pendingLeaveCount={pendingLeaveCount}
        signOutAction={signOutAction}
      />
      <main className="bg-[var(--m-bg)] min-w-0">
        <MobileNav orgName={org.name} />
        <AnnouncementBanner viewerRole={viewer.membership.role as 'admin' | 'manager' | 'lead' | 'member'} />
        <div className="px-4 pt-4 pb-10 sm:px-8 sm:pt-8 max-w-[1400px] mx-auto fade-in">
          {children}
        </div>
      </main>
    </div>
  )
}
