import { NextResponse } from 'next/server'
import { and, eq, isNull, isNotNull } from 'drizzle-orm'
import { db, schema } from '@/lib/db/client'
import { authorizeCron } from '@/lib/cron/auth'
import { getSlackInstall, sendSlackDm, sendSlackChannel } from '@/lib/slack/client'
import { usersWithStandupToday } from '@/lib/standups/save'

export const runtime = 'nodejs'
export const maxDuration = 120

/**
 * Morning standup nudge. For each Slack-connected org, Marina posts a kickoff
 * line to the scrum channel and DMs every linked teammate who hasn't filed a
 * standup yet today — each DM carries a "Do my standup" button that opens the
 * pre-filled modal (open_standup_modal). Schedule on weekday mornings.
 */
export async function GET(req: Request) {
  if (!authorizeCron(req)) return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  return run()
}
export async function POST(req: Request) {
  if (!authorizeCron(req)) return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  return run()
}

async function run() {
  const orgs = await db.select().from(schema.orgs).where(isNotNull(schema.orgs.slackBotToken))
  let orgsHit = 0
  let dmed = 0
  for (const org of orgs) {
    const install = await getSlackInstall(org.id)
    if (!install) continue

    const done = await usersWithStandupToday(org.id)
    const members = await db
      .select({
        userId: schema.memberships.userId,
        slackUserId: schema.memberships.slackUserId,
        name: schema.users.name,
        login: schema.users.login,
      })
      .from(schema.memberships)
      .innerJoin(schema.users, eq(schema.memberships.userId, schema.users.id))
      .where(
        and(
          eq(schema.memberships.orgId, org.id),
          isNull(schema.memberships.endedAt),
          isNotNull(schema.memberships.slackUserId),
        ),
      )

    const pending = members.filter((m) => m.slackUserId && !done.has(m.userId))
    if (pending.length === 0) continue
    orgsHit++

    // Kickoff line in the scrum channel (best-effort; skip if no channel set).
    const channel = install.scrumChannelId ?? install.defaultChannelId
    if (channel) {
      await sendSlackChannel(install, {
        channel,
        text: 'Standup time',
        blocks: [
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: "*Good morning — standup time.*\nDrop your update with `/marina standup`, or tap the button in the DM I just sent you.",
            },
          },
        ],
      })
    }

    for (const m of pending) {
      const first = (m.name ?? m.login ?? 'there').split(' ')[0]
      const r = await sendSlackDm(install, m.slackUserId!, {
        text: 'Time for your standup',
        blocks: [
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: `*Morning, ${first}.* Ready for standup? I've drafted what you shipped yesterday — just add today's plan and post.`,
            },
          },
          {
            type: 'actions',
            elements: [
              { type: 'button', text: { type: 'plain_text', text: 'Do my standup' }, style: 'primary', action_id: 'open_standup_modal' },
            ],
          },
        ],
      })
      if (r.ok) dmed++
    }
  }
  return NextResponse.json({ ok: true, orgsHit, dmed })
}
