import { notFound, redirect } from 'next/navigation'
import { eq } from 'drizzle-orm'
import { auth } from '@/auth'
import { db, schema } from '@/lib/db/client'
import { HttpError, requireMembership } from '@/lib/auth/guards'
import WelcomeClient from './client'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

/**
 * First-run "here's what Marina does" glance, shown right after a manager
 * creates their org — before the invite step and the dashboard — so they get
 * a feel for the product instead of landing on an empty HQ. Fully skippable.
 * Reached only from the create-org redirect; a returning user routes straight
 * to their dashboard, so this never nags.
 */
export default async function WelcomePage({ params }: { params: Promise<{ orgId: string }> }) {
  const { orgId: raw } = await params
  const orgId = Number(raw)
  if (!Number.isInteger(orgId)) notFound()

  // Gate on 'admin' to match the invite step this hands off to — otherwise a
  // non-admin manager could reach the welcome CTA and 403 on the invite page.
  try {
    await requireMembership(orgId, 'admin')
  } catch (err) {
    if (err instanceof HttpError && err.status === 401) redirect('/')
    if (err instanceof HttpError && err.status === 403) redirect(`/org/${orgId}`)
    throw err
  }

  const session = await auth()
  const me = session?.appUserId
    ? await db.query.users.findFirst({ where: eq(schema.users.id, session.appUserId) })
    : null
  const org = await db.query.orgs.findFirst({ where: eq(schema.orgs.id, orgId) })
  if (!org) notFound()

  const firstName = me?.name?.split(' ')[0] || (session?.login ? `@${session.login}` : 'there')

  return <WelcomeClient orgId={orgId} orgName={org.name} firstName={firstName} />
}
