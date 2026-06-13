import { notFound, redirect } from 'next/navigation'
import { and, count, eq, isNull } from 'drizzle-orm'
import { db, schema } from '@/lib/db/client'
import { HttpError, requireMembership } from '@/lib/auth/guards'
import InviteSetupClient from './client'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

/**
 * First-run "invite your teammates" step. We route a brand-new owner here
 * right after they create their org so the dashboard isn't lonely on first
 * load. They can fill the form (any number of rows) or click "Skip — I'll
 * invite later" and head straight to the dashboard.
 *
 * Gated to owners on orgs with exactly one member (themselves). Once anyone
 * else has joined, this page redirects to the regular Members page — it's
 * meant to be a one-time setup surface, not a permanent shortcut.
 */
export default async function InviteSetupPage({
  params,
}: {
  params: Promise<{ orgId: string }>
}) {
  const { orgId: raw } = await params
  const orgId = Number(raw)
  if (!Number.isInteger(orgId)) notFound()

  try {
    await requireMembership(orgId, 'admin')
  } catch (err) {
    if (err instanceof HttpError && err.status === 401) redirect('/')
    if (err instanceof HttpError && err.status === 403) redirect(`/org/${orgId}`)
    throw err
  }

  // If the org already has more than just the owner, this setup page is
  // no longer the right surface — send them to the proper Members page.
  const memberCount = await db
    .select({ n: count() })
    .from(schema.memberships)
    .where(and(eq(schema.memberships.orgId, orgId), isNull(schema.memberships.endedAt)))
  if ((memberCount[0]?.n ?? 0) > 1) {
    redirect(`/org/${orgId}/members`)
  }

  const org = await db.query.orgs.findFirst({ where: eq(schema.orgs.id, orgId) })
  if (!org) notFound()

  return <InviteSetupClient orgId={orgId} orgName={org.name} />
}
