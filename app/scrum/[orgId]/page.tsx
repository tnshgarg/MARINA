import { notFound, redirect } from 'next/navigation'
import { eq } from 'drizzle-orm'
import { db, schema } from '@/lib/db/client'
import { HttpError, requireMembership } from '@/lib/auth/guards'
import ScrumClient from './client'

export const dynamic = 'force-dynamic'

/**
 * Scrum Mode — projection-friendly standup helper. Lives at /scrum/[orgId]
 * (outside the org chrome) so it owns the full viewport. The manager picks an
 * employee, sees a one-screen brief of yesterday's work, active blockers and
 * recent context. Arrow keys advance through the roster.
 */
export default async function ScrumPage({ params }: { params: Promise<{ orgId: string }> }) {
  const { orgId: raw } = await params
  const orgId = Number(raw)
  if (!Number.isInteger(orgId)) notFound()

  try {
    await requireMembership(orgId, 'manager')
  } catch (err) {
    if (err instanceof HttpError && err.status === 401) redirect('/')
    if (err instanceof HttpError && err.status === 403) redirect(`/org/${orgId}`)
    throw err
  }

  const org = await db.query.orgs.findFirst({ where: eq(schema.orgs.id, orgId) })
  if (!org) notFound()

  const memberRows = await db
    .select({
      membershipId: schema.memberships.id,
      userId: schema.users.id,
      login: schema.users.login,
      name: schema.users.name,
      characterKey: schema.users.characterKey,
      role: schema.memberships.role,
    })
    .from(schema.memberships)
    .innerJoin(schema.users, eq(schema.memberships.userId, schema.users.id))
    .where(eq(schema.memberships.orgId, orgId))

  memberRows.sort((a, b) => {
    if (a.role !== b.role) {
      const order = { owner: 0, manager: 1, member: 2 } as const
      return (order[a.role as keyof typeof order] ?? 9) - (order[b.role as keyof typeof order] ?? 9)
    }
    return (a.name ?? a.login).localeCompare(b.name ?? b.login)
  })

  return (
    <ScrumClient
      orgId={orgId}
      orgName={org.name}
      members={memberRows}
    />
  )
}
