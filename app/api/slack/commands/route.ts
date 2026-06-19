import { NextResponse } from 'next/server'
import { and, eq, isNull } from 'drizzle-orm'
import { db, schema } from '@/lib/db/client'
import { roleAtLeast } from '@/lib/auth/guards'
import { verifySlackRequest } from '@/lib/slack/verify'
import { afterResponse } from '@/lib/after'
import { createDeliverable } from '@/lib/deliverables/create'
import { notify } from '@/lib/notify/send'
import { getSlackInstall, sendSlackDm, openModal } from '@/lib/slack/client'
import { resolveMembershipBySlack, resolveOrgByTeam } from '@/lib/slack/identity'
import { leaveModal, punchOutModal, standupModal, kudosModal } from '@/lib/slack/views'
import { buildStandupPrefill } from '@/lib/brief/standup'
import { createOrgAnnouncement } from '@/lib/announcements/create'
import { endActiveBreak } from '@/lib/breaks/end'
import { punchIn } from '@/lib/shifts/punch'
import { getPersonalBrief } from '@/lib/brief/personal'

export const runtime = 'nodejs'

/**
 * Slack slash-command endpoint. Supports:
 *
 *   /marina pulse            — today's team snapshot
 *   /marina blockers         — list active blockers
 *   /marina nudge @user msg  — DM the teammate; logged on both sides
 *   /marina blocker <reason> — mark *yourself* blocked
 *   /marina done <title>     — log a deliverable for today
 *   /marina off [reason]     — start a personal break
 *   /marina help             — list these
 *
 * Slack expects HTTP 200 within 3s — we ack synchronously and finish the
 * actual work in `afterResponse(...)`. Every action that mutates state
 * audits and emits a `notify(...)` so it shows up in MARINA's own activity
 * feed too, not just in Slack.
 */
export async function POST(req: Request) {
  const raw = await req.text()
  const check = verifySlackRequest(req.headers, raw)
  if (!check.ok) {
    return NextResponse.json({ error: check.reason }, { status: 401 })
  }

  const params = new URLSearchParams(raw)
  const teamId = params.get('team_id') ?? ''
  const slackUserId = params.get('user_id') ?? ''
  const slackUserName = params.get('user_name') ?? 'someone'
  const channelId = params.get('channel_id') ?? ''
  const text = (params.get('text') ?? '').trim()
  const responseUrl = params.get('response_url') ?? ''
  const triggerId = params.get('trigger_id') ?? ''

  const [sub, ...rest] = text.split(/\s+/)
  const remainder = rest.join(' ').trim()

  const ack = (msg: string) =>
    NextResponse.json({ response_type: 'ephemeral', text: msg })
  const notLinked = "I don't see you in MARINA yet — open the Marina app's Home tab once, then try again."

  // resolveOrgByTeam picks the most-recent install when a workspace is bound to
  // more than one org (a stale duplicate from a re-install).
  const org = await resolveOrgByTeam(teamId)
  if (!org) {
    return ack(
      `MARINA isn't connected to this Slack workspace yet. An owner can connect at ${process.env.NEXT_PUBLIC_APP_URL ?? 'https://marina.in'}/org/<id>/settings/integrations.`,
    )
  }

  // Map Slack user → MARINA membership for self-actions. Not every Slack
  // user has a MARINA membership (Slack workspace can include guests etc.),
  // so we lazily try to resolve and tell them to link if it fails.
  async function findCallerMembership() {
    // Link-on-first-use: direct slackUserId match, else resolve via email.
    return resolveMembershipBySlack(org!.id, slackUserId)
  }

  switch (sub) {
    case '':
    case 'help':
      return ack(
        '*Marina commands*\n' +
          '`/marina status` — your day at a glance\n' +
          '`/marina in` — punch in   ·   `/marina out` — punch out\n' +
          '`/marina done <title>` — log work you shipped\n' +
          '`/marina blocker <reason>` — flag yourself blocked\n' +
          '`/marina off [reason]` — start a break   ·   `/marina back` — end it\n' +
          '`/marina leave` — request time off\n' +
          '`/marina standup` — post your standup\n' +
          '`/marina kudos` — recognize a teammate\n' +
          '`/marina announce <message>` — post to the whole team (managers)\n' +
          "`/marina pulse` — today's team snapshot (managers)\n" +
          '`/marina blockers` — active blockers (managers)\n' +
          '`/marina nudge @user <message>` — DM a teammate (logged)',
      )

    case 'pulse':
    case 'blockers': {
      // SECURITY: the team snapshot (who's working, who's blocked + reasons) is
      // confidential. Only serve it to a Slack user who maps to an actual
      // member of this org — never to any guest in the workspace. Managers+ get
      // the full pulse; plain members are politely declined.
      const caller = await findCallerMembership()
      if (!caller) {
        return ack(
          "You're not linked to this MARINA workspace, so I can't share the team snapshot. Accept your invite (or ask an admin) first.",
        )
      }
      if (!roleAtLeast(caller.role, 'lead')) {
        return ack('The team snapshot is available to managers and team leads.')
      }
      const out = await buildPulseText(org.id, sub === 'blockers')
      return NextResponse.json({ response_type: 'ephemeral', text: out })
    }

    case 'nudge': {
      // Parse "<@U12345|username> rest of message" or "@handle rest"
      const targetSlackId = remainder.match(/^<@([A-Z0-9]+)/)?.[1] ?? null
      const message = targetSlackId
        ? remainder.replace(/^<@[A-Z0-9]+(\|[^>]+)?>\s*/, '')
        : remainder

      if (!targetSlackId) {
        return ack(
          'Usage: `/marina nudge @user your message`. Slack will auto-expand the @handle.',
        )
      }

      // Find both sides as memberships.
      const [me, them] = await Promise.all([
        findCallerMembership(),
        db.query.memberships.findFirst({
          where: and(
            eq(schema.memberships.orgId, org.id),
            eq(schema.memberships.slackUserId, targetSlackId),
            isNull(schema.memberships.endedAt),
          ),
        }),
      ])

      if (!them) {
        return ack(
          'That person isn\'t in MARINA yet — ask them to accept their invite first.',
        )
      }
      // SECURITY: only a real member of this org may send a MARINA-branded DM.
      // Without this, any Slack guest could spam/phish teammates through our
      // bot with an arbitrary "from" name.
      if (!me) {
        return ack(
          "You're not linked to this MARINA workspace, so you can't send nudges. Accept your invite first.",
        )
      }

      afterResponse(async () => {
        const install = await getSlackInstall(org.id)
        if (!install) return
        // Derive the sender name from the resolved member, NOT the Slack-supplied
        // user_name (which is client-controllable / spoofable).
        const fromUser = await db.query.users.findFirst({ where: eq(schema.users.id, me.userId) })
        const fromName = fromUser?.name ?? `@${fromUser?.login ?? slackUserName}`
        await sendSlackDm(install, targetSlackId, {
          text: `${fromName} on MARINA: ${message || 'just checking in'}`,
          blocks: [
            {
              type: 'section',
              text: {
                type: 'mrkdwn',
                text: `👋 *${fromName}* sent you a nudge via MARINA`,
              },
            },
            ...(message
              ? [{ type: 'section', text: { type: 'mrkdwn', text: message } } as const]
              : []),
          ],
        })

        if (me) {
          await db.insert(schema.notifications).values({
            userId: them.userId,
            orgId: org.id,
            kind: 'manager_message',
            title: `Nudge from ${fromName}`,
            body: message || 'Just checking in via Slack.',
          })
        }
      }, 'slack nudge dm')

      return ack(`Nudge sent to <@${targetSlackId}>.`)
    }

    case 'blocker': {
      if (!remainder) {
        return ack('Add a reason: `/marina blocker waiting on @arjun for staging creds`')
      }
      const me = await findCallerMembership()
      if (!me) return ack('I don\'t see you in MARINA yet. Sign in once at the dashboard and try again.')

      afterResponse(async () => {
        const [row] = await db
          .insert(schema.breaks)
          .values({
            userId: me.userId,
            orgId: org.id,
            startedAt: new Date(),
            reason: remainder,
            category: 'blocked',
          })
          .returning()

        const user = await db.query.users.findFirst({ where: eq(schema.users.id, me.userId) })
        notify({
          kind: 'state.blocked',
          orgId: org.id,
          actorUserId: me.userId,
          userName: user?.name ?? `@${user?.login ?? 'someone'}`,
          userLogin: user?.login ?? 'someone',
          reason: remainder,
        })
        void row
      }, 'slack blocker register')

      return ack(`Marked you blocked: _"${remainder}"_. Managers notified.`)
    }

    case 'done': {
      if (!remainder || remainder.length < 4) {
        return ack('Usage: `/marina done <what you finished>` — at least 4 characters.')
      }
      const me = await findCallerMembership()
      if (!me) return ack('I don\'t see you in MARINA yet. Sign in once at the dashboard and try again.')

      afterResponse(async () => {
        try {
          await createDeliverable({
            userId: me.userId,
            orgId: org.id,
            title: remainder.slice(0, 200),
            detail: 'logged via /marina done in Slack',
          })
        } catch (e) {
          console.warn('[slack done] failed to log deliverable', (e as Error).message)
        }
      }, 'slack done deliverable')

      return ack(`✅ Logged: _"${remainder.slice(0, 200)}"_`)
    }

    case 'off': {
      const me = await findCallerMembership()
      if (!me) return ack(notLinked)
      const reason = remainder || 'Quick break'
      afterResponse(async () => {
        await db.insert(schema.breaks).values({
          userId: me.userId,
          orgId: org.id,
          startedAt: new Date(),
          reason,
          category: 'personal',
        })
      }, 'slack off break')
      return ack(`Break started — _"${reason}"_. Use \`/marina back\` to end it.`)
    }

    case 'back':
    case 'unblock': {
      const me = await findCallerMembership()
      if (!me) return ack(notLinked)
      const r = await endActiveBreak(me.userId, sub === 'unblock' ? { resolution: 'self' } : undefined)
      if (!r.ended) return ack("You're not on a break right now.")
      return ack(r.wasBlocked ? 'Blocker cleared — welcome back.' : 'Break ended — welcome back.')
    }

    case 'in': {
      const me = await findCallerMembership()
      if (!me) return ack(notLinked)
      const r = await punchIn(me.userId, org.id)
      if (!r.ok) return ack('Could not punch in — try again.')
      return ack(r.alreadyOpen ? "You're already on the clock." : 'Punched in. Have a good one.')
    }

    case 'out': {
      // The trigger_id expires in ~3s, so open the modal on the fastest possible
      // path: skip findCallerMembership here (it can make a slow users.info call)
      // — the modal submit (modal_punchout) re-validates the actor anyway.
      const install = await getSlackInstall(org.id)
      if (install && triggerId) {
        const r = await openModal(install, triggerId, punchOutModal(org.id))
        if (!r.ok) return ack('That took too long to open — try `/marina out` again.')
        return new NextResponse(null, { status: 200 })
      }
      const me = await findCallerMembership()
      return ack(me ? 'Open the Marina app to punch out — it needs a quick work summary.' : notLinked)
    }

    case 'leave': {
      const me = await findCallerMembership()
      if (!me) return ack(notLinked)
      const install = await getSlackInstall(org.id)
      if (install && triggerId) {
        await openModal(install, triggerId, leaveModal(org.id))
        return new NextResponse(null, { status: 200 })
      }
      return ack('Open the Marina app to request leave.')
    }

    case 'status':
    case 'me': {
      const me = await findCallerMembership()
      if (!me) return ack(notLinked)
      const b = await getPersonalBrief(me.userId, org.id)
      const lines = [
        '*Your day*',
        `Status — ${b.activeShift ? `on the clock (${b.activeShift.sinceMin}m)` : 'off the clock'}`,
        `Shipped today — ${b.deliverablesToday.count}`,
        b.activeBreak
          ? `${b.activeBreak.category === 'blocked' ? 'Blocked on' : 'On a break'} — ${b.activeBreak.reason}`
          : null,
        b.leave ? `Leave — ${b.leave.remaining} of ${b.leave.quota} left` : null,
      ].filter(Boolean) as string[]
      return ack(lines.join('\n'))
    }

    case 'standup': {
      const me = await findCallerMembership()
      if (!me) return ack(notLinked)
      const install = await getSlackInstall(org.id)
      if (install && triggerId) {
        const prefill = await buildStandupPrefill(org.id, me.userId)
        await openModal(install, triggerId, standupModal(org.id, prefill, channelId))
        return new NextResponse(null, { status: 200 })
      }
      return ack('Open the Marina app to post your standup.')
    }

    case 'kudos': {
      const me = await findCallerMembership()
      if (!me) return ack(notLinked)
      const install = await getSlackInstall(org.id)
      if (install && triggerId) {
        await openModal(install, triggerId, kudosModal(org.id))
        return new NextResponse(null, { status: 200 })
      }
      return ack('Open the Marina app to give kudos.')
    }

    case 'announce': {
      const me = await findCallerMembership()
      if (!me) return ack(notLinked)
      if (!roleAtLeast(me.role, 'manager')) return ack('Only managers can post announcements.')
      if (!remainder) return ack('Usage: `/marina announce <your message>`')
      afterResponse(
        () => createOrgAnnouncement({ orgId: org.id, authorUserId: me.userId, body: remainder, source: 'slack' }),
        'slack:announce',
      )
      return ack('Posted to the team — sharing it in the announcements channel now.')
    }

    default:
      return ack(`Unknown command \`${sub}\`. Try \`/marina help\`.`)
  }
  // Suppress unused-channel warning if we end up not using these.
  void channelId
  void responseUrl
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
    .where(and(eq(schema.memberships.orgId, orgId), isNull(schema.memberships.endedAt)))

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
    if (blockerRows.length === 0) return 'No active blockers right now — nice.'
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
    `On shift: ${onShiftCount}   ·   Blocked: ${blockedCount}   ·   Team: ${memberRows.length}`,
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
