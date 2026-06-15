import { NextResponse } from 'next/server'
import { eq } from 'drizzle-orm'
import { db, schema } from '@/lib/db/client'
import { requireCapability } from '@/lib/auth/guards'
import { syncOrgViaApp } from '@/lib/github/app-sync'
import { afterResponse } from '@/lib/after'

export const runtime = 'nodejs'

/**
 * GitHub App "Setup URL" callback. After an org admin installs (or
 * reconfigures) the MARINA GitHub App, GitHub redirects here with:
 *   ?installation_id=<n>&setup_action=install|update&state=<orgId>
 *
 * We bind that installation to the workspace (verifying the caller can manage
 * the workspace's integrations), then kick off a first sync.
 */
export async function GET(req: Request) {
  const url = new URL(req.url)
  const installationId = Number(url.searchParams.get('installation_id'))
  const orgId = Number(url.searchParams.get('state'))

  if (!Number.isInteger(orgId)) {
    return NextResponse.redirect(new URL('/dashboard', url.origin))
  }
  const back = new URL(`/org/${orgId}/settings/integrations`, url.origin)

  try {
    // Only someone who can manage this workspace's integrations may bind it.
    await requireCapability(orgId, 'manage_integrations')

    if (!Number.isInteger(installationId)) {
      back.searchParams.set('github_app', 'error')
      return NextResponse.redirect(back)
    }

    await db
      .update(schema.orgs)
      .set({ githubInstallationId: installationId })
      .where(eq(schema.orgs.id, orgId))

    // First sync in the background so the redirect is instant.
    afterResponse(() => syncOrgViaApp(orgId).then(() => {}), 'github-app first sync')

    back.searchParams.set('github_app', 'connected')
    return NextResponse.redirect(back)
  } catch {
    back.searchParams.set('github_app', 'forbidden')
    return NextResponse.redirect(back)
  }
}
