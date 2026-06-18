import { NextResponse } from 'next/server'
import { db, schema } from '@/lib/db/client'
import { authorizeCron } from '@/lib/cron/auth'
import { getSlackInstall, sendSlackChannel } from '@/lib/slack/client'
import { getTeamPulse } from '@/lib/brief/pulse'

export const runtime = 'nodejs'
export const maxDuration = 120

/**
 * Morning brief → Slack. For every org that has the bot installed and a default
 * channel set, post the team pulse (on-shift / blocked / who to unblock first).
 * Orgs without Slack are skipped — so this is a safe no-op until a workspace is
 * connected. Schedule it alongside the email digest (e.g. 02:30 UTC weekdays).
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
  const orgs = await db.select().from(schema.orgs)
  let posted = 0
  let skipped = 0

  for (const org of orgs) {
    if (!org.slackBotToken || !org.slackDefaultChannelId) {
      skipped++
      continue
    }
    const install = await getSlackInstall(org.id)
    if (!install) {
      skipped++
      continue
    }
    const pulse = await getTeamPulse(org.id)
    if (pulse.total === 0) {
      skipped++
      continue
    }

    const blockerLines = pulse.blockers
      .slice(0, 5)
      .map((b) => `• *${b.name}* waiting on ${b.waitingOn} _(${b.sinceMin}m)_`)
      .join('\n')

    const blocks: unknown[] = [
      { type: 'header', text: { type: 'plain_text', text: '☀️ Morning brief', emoji: true } },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `:rocket: ${pulse.onShift} on-shift   :no_entry: ${pulse.blocked} blocked   :busts_in_silhouette: ${pulse.total} total`,
        },
      },
      ...(pulse.blockers.length
        ? [{ type: 'section', text: { type: 'mrkdwn', text: `*Worth clearing first:*\n${blockerLines}` } }]
        : []),
      { type: 'context', elements: [{ type: 'mrkdwn', text: '— Marina · open the Home tab for your day' }] },
    ]

    const res = await sendSlackChannel(install, {
      text: `Morning brief — ${pulse.blocked} blocked, ${pulse.onShift} on-shift`,
      blocks,
    })
    if (res.ok) posted++
    else skipped++
  }

  return NextResponse.json({ ok: true, posted, skipped })
}
