import { getSlackInstall, publishHomeView } from '@/lib/slack/client'
import { resolveOrgByTeam, resolveSlackActor } from '@/lib/slack/identity'
import { roleAtLeast } from '@/lib/auth/guards'
import { getPersonalBrief } from '@/lib/brief/personal'
import { getTeamPulse } from '@/lib/brief/pulse'
import { appHomeView, linkAccountHomeView } from '@/lib/slack/views'

/**
 * Publish the App Home tab for a Slack user. Resolves them to a MARINA member,
 * builds their personal brief (+ team pulse for managers), and republishes the
 * Home view. Call on app_home_opened and after any state-changing action.
 */
export async function publishAppHomeFor(teamId: string, slackUserId: string): Promise<void> {
  const base = (process.env.NEXT_PUBLIC_APP_URL ?? '').replace(/\/+$/, '')
  const actor = await resolveSlackActor(teamId, slackUserId)

  if (!actor) {
    // Unlinked Slack user — show a "link your account" home if we have the install.
    const org = await resolveOrgByTeam(teamId)
    if (!org) return
    const install = await getSlackInstall(org.id)
    if (!install) return
    await publishHomeView(install, slackUserId, linkAccountHomeView(base))
    return
  }

  const install = await getSlackInstall(actor.org.id)
  if (!install) return

  const isManager = roleAtLeast(actor.membership.role, 'lead')
  const [personal, pulse] = await Promise.all([
    getPersonalBrief(actor.user.id, actor.org.id),
    isManager ? getTeamPulse(actor.org.id) : Promise.resolve(null),
  ])

  const view = appHomeView({
    greeting: greetingFor(actor.user.name ?? actor.user.login),
    personal,
    isManager,
    pulse,
    orgId: actor.org.id,
    webUrl: base ? `${base}/org/${actor.org.id}` : '',
  })
  await publishHomeView(install, slackUserId, view)
}

function greetingFor(name: string): string {
  const h = new Date().getHours()
  const part = h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening'
  return `${part}, ${name.split(' ')[0]}`
}
