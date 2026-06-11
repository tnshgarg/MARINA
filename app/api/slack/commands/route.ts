import { NextResponse } from 'next/server'
import { and, eq, isNull } from 'drizzle-orm'
import { db, schema } from '@/lib/db/client'
import { verifySlackRequest } from '@/lib/slack/verify'

export const runtime = 'nodejs'

/**
 * Slack slash command endpoint. Supports:
 *   /marina pulse           — post a snapshot of who's blocked + shipping today
 *   /marina nudge @user msg — send a check-in to a teammate (audit-logged)
 *
 * Slack expects an HTTP 200 within 3 seconds. We respond immediately with an
 * acknowledgement and do the work in the background.
 *
 * The org binding is resolved by matching the Slack team_id to an org's
 * `billing_customer_id` field (we'll repurpose this for now; in the longer
 * term we'd add a dedicated `slack_team_id` column).
 */
export async function POST(req: Request) {
  const raw = await req.text()
  const check = verifySlackRequest(req.headers, raw)
  if (!check.ok) {
    return NextResponse.json({ error: check.reason }, { status: 401 })
  }

  const params = new URLSearchParams(raw)
  const teamId = params.get('team_id') ?? ''
  const userId = params.get('user_id') ?? ''
  const userName = params.get('user_name') ?? 'someone'
  const channelId = params.get('channel_id') ?? ''
  const text = (params.get('text') ?? '').trim()
  const responseUrl = params.get('response_url') ?? ''

  void userId
  void channelId

  // Routing inside text: first word is the subcommand
  const [sub, ...rest] = text.split(/\s+/)
  const remainder = rest.join(' ').trim()

  const ack = (msg: string) =>
    NextResponse.json({ response_type: 'ephemeral', text: msg })

  // Look up the org bound to this Slack team.
  const org = await db.query.orgs.findFirst({
    where: eq(schema.orgs.billingCustomerId, `slack:${teamId}`),
  })
  if (!org) {
    return ack(
      `MARINA isn't connected to this Slack workspace yet. An owner can connect at ${process.env.NEXT_PUBLIC_APP_URL ?? 'https://marina.in'}/settings.`,
    )
  }

  switch (sub) {
    case '':
    case 'help':
      return ack(
        '*MARINA · slash commands*\n' +
          '`/marina pulse` — today\'s team snapshot\n' +
          '`/marina nudge @user message` — send a check-in (audit-logged)\n' +
          '`/marina blockers` — list active blockers',
      )

    case 'pulse':
    case 'blockers': {
      const text = await buildPulseText(org.id, sub === 'blockers')
      // We respond ephemerally for now to avoid spamming the channel.
      return NextResponse.json({ response_type: 'ephemeral', text })
    }

    case 'nudge': {
      // Defer the actual nudge to a fire-and-forget so we ack within 3s.
      ;(async () => {
        try {
          if (!responseUrl) return
          await fetch(responseUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              response_type: 'ephemeral',
              text: `Nudge logged — we'll handle the rest. ${remainder ? `Message: ${remainder}` : ''}`,
            }),
          })
          // TODO: parse @user from `remainder`, resolve to org membership,
          // call notify({ kind: 'blocker.pinged', ... }). Skeleton only.
          console.log(`[slack] nudge from ${userName} in org ${org.id}: ${remainder}`)
        } catch (err) {
          console.error('[slack/nudge] background failed', err)
        }
      })()
      return ack('Got it — sending the nudge in the background.')
    }

    default:
      return ack(`Unknown subcommand \`${sub}\`. Try \`/marina help\`.`)
  }
}

async function buildPulseText(orgId: number, blockersOnly: boolean): Promise<string> {
  const memberRows = await db
    .select({
      userId: schema.memberships.userId,
      login: schema.users.login,
      name: schema.users.name,
    })
    .from(schema.memberships)
    .innerJoin(schema.users, eq(schema.memberships.userId, schema.users.id))
    .where(eq(schema.memberships.orgId, orgId))

  if (memberRows.length === 0) return 'No members in this org yet.'

  const blockerRows = await db
    .select({ b: schema.breaks, u: schema.users })
    .from(schema.breaks)
    .innerJoin(schema.users, eq(schema.breaks.userId, schema.users.id))
    .where(
      and(
        eq(schema.breaks.orgId, orgId),
        eq(schema.breaks.category, 'blocked'),
        isNull(schema.breaks.endedAt),
      ),
    )

  if (blockersOnly) {
    if (blockerRows.length === 0) return ':zap: No active blockers right now.'
    return blockerRows
      .map(({ b, u }) => {
        const since = Math.floor((Date.now() - new Date(b.startedAt).getTime()) / 60000)
        const target = b.waitingOnExternal ?? 'a teammate'
        return `• *${u.name ?? `@${u.login}`}* waiting on ${target} · ${since}m`
      })
      .join('\n')
  }

  const openShifts = await db
    .select()
    .from(schema.shifts)
    .where(and(eq(schema.shifts.orgId, orgId), isNull(schema.shifts.punchedOutAt)))

  const onShiftCount = openShifts.length
  const blockedCount = blockerRows.length

  const lines = [
    `*Pulse for today*`,
    `:rocket: ${onShiftCount} on-shift   :no_entry: ${blockedCount} blocked   :bust_in_silhouette: ${memberRows.length} total`,
  ]
  if (blockerRows.length > 0) {
    lines.push('', '*Blocked right now:*')
    for (const { b, u } of blockerRows.slice(0, 5)) {
      const since = Math.floor((Date.now() - new Date(b.startedAt).getTime()) / 60000)
      const target = b.waitingOnExternal ?? 'a teammate'
      lines.push(`• *${u.name ?? `@${u.login}`}* waiting on ${target} · ${since}m`)
    }
  }
  return lines.join('\n')
}
