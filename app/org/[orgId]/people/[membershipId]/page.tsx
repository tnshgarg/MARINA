import { notFound, redirect } from 'next/navigation'
import Link from 'next/link'
import { and, eq, isNull } from 'drizzle-orm'
import { db, schema } from '@/lib/db/client'
import { HttpError, requireMembership, roleAtLeast } from '@/lib/auth/guards'
import { hasCap } from '@/lib/auth/capabilities'
import { getVisibleScope } from '@/lib/auth/scope'
import { CharacterAvatar } from '@/components/character-avatar'
import { ProfilePageClient } from './client'

export const dynamic = 'force-dynamic'

/**
 * Dedicated employee profile route.
 *
 * Previously the only way to inspect a teammate was the in-dashboard modal —
 * not shareable, not bookmarkable, not deep-linkable from email digests or
 * Slack DMs. This route is the URL-addressable surface for an employee's
 * full record, intended for any flow that needs to point at a person:
 *
 *   - "@arjun is at risk" digest link
 *   - 1:1 prep doc with `marina.team/org/1/people/47`
 *   - HR back-office workflows for performance review
 *
 * Manager-scoped: viewer must be able to see this member (admin OR the
 * member is in their reports-to chain / managed team). We delegate the
 * permission check to the same `getVisibleScope` helper used everywhere
 * else so manager privacy is consistent across surfaces.
 */
export default async function EmployeeProfilePage({
  params,
}: {
  params: Promise<{ orgId: string; membershipId: string }>
}) {
  const { orgId: rawO, membershipId: rawM } = await params
  const orgId = Number(rawO)
  const membershipId = Number(rawM)
  if (!Number.isInteger(orgId) || !Number.isInteger(membershipId)) notFound()

  let viewer
  try {
    viewer = await requireMembership(orgId, 'member')
  } catch (err) {
    if (err instanceof HttpError && err.status === 401) redirect('/')
    if (err instanceof HttpError && err.status === 403) redirect('/dashboard')
    throw err
  }

  const isManager = roleAtLeast(viewer.membership.role, 'manager')
  if (!isManager) {
    // Plain members can only see their own profile via /dashboard. Don't leak
    // teammate profiles to non-managers.
    redirect('/dashboard')
  }

  const target = await db.query.memberships.findFirst({
    where: and(
      eq(schema.memberships.id, membershipId),
      eq(schema.memberships.orgId, orgId),
      isNull(schema.memberships.endedAt),
    ),
  })
  if (!target) notFound()

  // Scope check: admins see anyone; managers only their reports / teams.
  const scope = await getVisibleScope(orgId, {
    userId: viewer.session.appUserId,
    membershipId: viewer.membership.id,
    role: viewer.membership.role as 'admin' | 'manager' | 'lead' | 'member',
  })
  if (!scope.isAdminScope && !scope.userIds.has(target.userId)) {
    // Same as not-found from the viewer's perspective — don't leak existence.
    notFound()
  }

  const user = await db.query.users.findFirst({
    where: eq(schema.users.id, target.userId),
  })
  if (!user) notFound()

  return (
    <div className="-mx-4 sm:-mx-8 -mt-4 sm:-mt-8">
      {/* Breadcrumb + header banner — sticks above the scrollable detail. */}
      <header className="bg-white border-b border-[var(--m-border)] px-4 sm:px-8 pt-4 pb-5">
        <nav className="text-[11.5px] text-[var(--m-ink-3)] mb-2 flex items-center gap-1.5">
          <Link href={`/org/${orgId}/members`} className="hover:text-[var(--m-accent)] transition-colors">
            People
          </Link>
          <span className="text-[var(--m-ink-5)]">/</span>
          <span className="text-[var(--m-ink-2)]">{user.name ?? `@${user.login}`}</span>
        </nav>
        <div className="flex items-start gap-4">
          <CharacterAvatar
            imageUrl={(user as { image?: string | null }).image ?? user.avatarUrl}
            name={user.name}
            login={user.login}
            size={56}
          />
          <div className="min-w-0 flex-1">
            <h1 className="app-h1 truncate">
              {user.name ?? `@${user.login}`}
            </h1>
            <p className="text-[13px] text-[var(--m-ink-3)] mt-0.5 truncate">
              {(target as { jobTitle?: string | null }).jobTitle
                ? `${(target as { jobTitle?: string | null }).jobTitle} · `
                : ''}
              {target.role}
              {user.email ? ` · ${user.email}` : ''}
            </p>
          </div>
        </div>
      </header>

      <div className="px-4 sm:px-8 pt-5">
        <ProfilePageClient
          orgId={orgId}
          membershipId={membershipId}
          canViewReports={hasCap(
            viewer.membership.role,
            (viewer.membership as { extraCaps?: string[] }).extraCaps ?? [],
            'view_all_data',
          )}
        />
      </div>
    </div>
  )
}
