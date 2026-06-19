import { eq } from 'drizzle-orm'
import { db, schema } from '@/lib/db/client'
import { inbox } from '@/lib/notify/inbox'
import { getSlackInstall, sendSlackDm, ensureUserSlackIdInOrg } from '@/lib/slack/client'

/**
 * Welcome a member who just joined an org: an in-app inbox note always, plus a
 * Slack DM with the Marina basics when the org has Slack connected. Best-effort
 * — never throws (it runs in afterResponse off the invite-accept paths).
 */
export async function welcomeNewMember(orgId: number, userId: number): Promise<void> {
  try {
    const org = await db.query.orgs.findFirst({ where: eq(schema.orgs.id, orgId) })
    if (!org) return

    inbox({
      userId,
      orgId,
      kind: 'member.welcome',
      title: `Welcome to ${org.name} on Marina`,
      body: "Punch in, log what you ship, and flag blockers — I'll keep your team in the loop.",
      href: `/org/${orgId}`,
    })

    const install = await getSlackInstall(orgId)
    if (!install) return
    const slackId = await ensureUserSlackIdInOrg(install, orgId, userId)
    if (!slackId) return

    await sendSlackDm(install, slackId, {
      text: `Welcome to ${org.name} on Marina`,
      blocks: [
        { type: 'section', text: { type: 'mrkdwn', text: `*Welcome to ${org.name} on Marina*` } },
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text:
              "I'm your chief of staff in Slack. A few things you can do:\n" +
              '• `/marina in` / `/marina out` — start and end your day\n' +
              '• `/marina done <what you shipped>` — log work\n' +
              "• `/marina blocker <reason>` — flag you're stuck\n" +
              '• `/marina leave` — request time off\n' +
              '• `/marina status` — your day at a glance',
          },
        },
        { type: 'context', elements: [{ type: 'mrkdwn', text: 'Open my *Home* tab (top of this DM) for your dashboard.' }] },
      ],
    })
  } catch {
    /* best-effort — onboarding should never block invite acceptance */
  }
}
