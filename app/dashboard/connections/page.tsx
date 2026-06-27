import { redirect } from 'next/navigation'
import { and, eq, isNotNull } from 'drizzle-orm'
import { auth, signIn } from '@/auth'
import { db, schema } from '@/lib/db/client'
import { listMembershipsForCurrentUser } from '@/lib/auth/guards'
import { IntegrationsPanel } from '@/components/integrations-panel'

export const dynamic = 'force-dynamic'

/** Employee Connections — enable GitHub / Calendar; Slack status; review packet. */
export default async function ConnectionsPage() {
  const session = await auth()
  if (!session?.appUserId || !session.login) redirect('/')

  const memberships = await listMembershipsForCurrentUser()
  const primaryOrg = memberships[0] ?? null
  if (!primaryOrg) redirect('/dashboard')

  const me = await db.query.users.findFirst({ where: eq(schema.users.id, session.appUserId) })
  if (!me) redirect('/')
  const meId = session.appUserId

  const myGoogle = await db.query.accounts.findFirst({
    where: and(eq(schema.accounts.userId, meId), eq(schema.accounts.provider, 'google'), isNotNull(schema.accounts.access_token)),
  })

  const githubLinked = me.githubId != null || !!me.githubLogin
  const calendarConnected = !!myGoogle
  const slackOrgConnected = !!primaryOrg.org?.slackBotToken
  const slackReachable = !!primaryOrg.slackUserId

  async function githubConnectAction() {
    'use server'
    await signIn('github', { redirectTo: '/dashboard/connections' })
  }

  return (
    <div className="px-4 pt-4 pb-10 sm:px-8 sm:pt-7 max-w-[820px] mx-auto fade-in">
      <div className="mb-4">
        <h1 className="app-h1 text-[22px] sm:text-[26px]">Connections</h1>
        <p className="mt-1 text-[13px] text-[var(--m-ink-2)]">Plug Marina into the tools you already use so your work shows up automatically.</p>
      </div>
      <div className="grid gap-3">
        <IntegrationsPanel
          variant="employee"
          orgId={primaryOrg.orgId}
          github={{ connected: githubLinked }}
          calendar={{ connected: calendarConnected }}
          slack={{ connected: slackOrgConnected, detail: slackReachable ? "You're linked — use /marina in Slack." : undefined }}
          githubConnectAction={githubConnectAction}
        />
      </div>
    </div>
  )
}
