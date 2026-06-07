import { notFound, redirect } from 'next/navigation'
import { and, eq, isNull } from 'drizzle-orm'
import { auth, signOut as serverSignOut } from '@/auth'
import { db, schema } from '@/lib/db/client'
import { HttpError, requireMembership, roleAtLeast } from '@/lib/auth/guards'
import { OrgSidebar } from '@/components/org-sidebar'

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
  if (!me?.characterKey) redirect('/pick')

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
        userLogin={session.login}
        characterKey={me.characterKey}
        role={viewer.membership.role}
        pendingLeaveCount={pendingLeaveCount}
        signOutAction={signOutAction}
      />
      <main className="bg-[var(--m-bg)] min-w-0">
        <div className="px-8 pt-8 pb-10 max-w-[1400px] mx-auto fade-in">
          {children}
        </div>
      </main>
    </div>
  )
}
