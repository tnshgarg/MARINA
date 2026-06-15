import { and, eq, isNull } from 'drizzle-orm'
import { db, schema } from '@/lib/db/client'
import { afterResponse } from '@/lib/after'
import {
  ensureUserSlackIdInOrg,
  getSlackInstall,
  sendSlackChannel,
  sendSlackDm,
  type SlackInstall,
} from '@/lib/slack/client'
import { managerUserIdsForOrg, userIdsWithCapability } from '@/lib/notify/audiences'
import { sendDigestMail } from '@/lib/email/send'
import { signLeaveAction, leaveActionExpiry } from '@/lib/leave/action-link'

/** Build signed one-click approve/deny URLs for a leave request (or null). */
function leaveActionLinks(leaveId: number | undefined): { approve: string; deny: string } | null {
  if (!leaveId || !(process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET)) return null
  const base = (process.env.NEXT_PUBLIC_APP_URL ?? '').replace(/\/+$/, '')
  if (!base) return null
  const exp = leaveActionExpiry()
  return {
    approve: `${base}/leave-action/${signLeaveAction({ leaveId, decision: 'approve', exp })}`,
    deny: `${base}/leave-action/${signLeaveAction({ leaveId, decision: 'deny', exp })}`,
  }
}

/**
 * Every NotifyEvent carries two routing hints:
 *
 *   - `actorUserId`: the employee the event is about. Used to DM them with
 *     decisions made on their behalf ("Your leave was approved").
 *   - `recipientUserIds` (computed in `dispatch`): the people who need to
 *     act on this. Managers for leave requests, the named teammate for a
 *     blocker.pinged, etc.
 *
 * Storing the IDs makes the dispatcher unambiguous — no name-matching, no
 * dependence on the order of operations elsewhere in the app.
 */
export type NotifyEvent =
  | {
      kind: 'leave.requested'
      orgId: number
      actorUserId: number
      userName: string
      userLogin: string
      startDate: string
      endDate: string
      leaveType: string
      reason: string
      /** Enables the one-click approve/deny links in the notification. */
      leaveId?: number
    }
  | {
      kind: 'leave.decided'
      orgId: number
      actorUserId: number
      userName: string
      userLogin: string
      decision: 'approved' | 'denied'
      startDate: string
      endDate: string
      note?: string | null
    }
  | {
      kind: 'break.started'
      orgId: number
      actorUserId: number
      userName: string
      userLogin: string
      reason: string
    }
  | {
      kind: 'shift.punched_out'
      orgId: number
      actorUserId: number
      userName: string
      userLogin: string
      durationMins: number
      verificationStatus: string
      verificationScore: number | null
      summary: string
      notes?: string | null
    }
  | {
      kind: 'shift.suspicious'
      orgId: number
      actorUserId: number
      userName: string
      userLogin: string
      reason: string
    }
  | {
      kind: 'state.blocked'
      orgId: number
      actorUserId: number
      userName: string
      userLogin: string
      reason: string
    }
  | {
      kind: 'blocker.pinged'
      orgId: number
      actorUserId: number  // the blocked person
      blockedName: string
      blockedLogin: string
      waitingOnUserId: number | null  // the recipient of the ping
      waitingOnName: string | null
      waitingOnLogin: string | null
      waitingOnExternal: string | null
      reason: string
    }
  | {
      kind: 'blocker.help_requested'
      orgId: number
      actorUserId: number  // the blocked person
      helperUserId: number  // the recipient
      blockedName: string
      helperName: string
      managerName: string
      reason: string
      note: string
    }
  | {
      kind: 'break.checkin'
      orgId: number
      actorUserId: number  // the manager
      targetUserId: number  // the employee being checked in on
      userName: string
      userLogin: string
      managerName: string
      reason: string
    }
  | {
      kind: 'celebration.birthday'
      orgId: number
      actorUserId: number
      userName: string
      userLogin: string
    }
  | {
      kind: 'celebration.anniversary'
      orgId: number
      actorUserId: number
      userName: string
      userLogin: string
      years: number
    }

/**
 * Fan out a notification. Wraps the work in Next's `after()` so callers don't
 * have to `void notify(...)`. Never throws.
 *
 * Channels we try, in order:
 *   1. Slack bot DMs to the relevant individuals (manager, employee, teammate)
 *   2. Slack channel post if a default channel is configured
 *   3. Legacy `slackWebhookUrl` (single channel, for orgs on the old flow)
 *   4. Email fallback to the org owner for high-priority events when Slack
 *      isn't set up at all
 *
 * Steps 1 & 2 require the bot install (`slackBotToken`). Step 3 is the
 * pre-bot path. We don't double-post — if (1) handled DMs and (2) posted
 * to a channel, we skip (3) so an org that's migrating doesn't get
 * duplicate messages.
 */
export function notify(event: NotifyEvent): void {
  afterResponse(() => dispatch(event).catch((err) => console.error('[notify] dispatch failed', err)), `notify:${event.kind}`)
}

async function dispatch(event: NotifyEvent): Promise<void> {
  const org = await db.query.orgs.findFirst({ where: eq(schema.orgs.id, event.orgId) })
  if (!org) return

  const rendered = renderEvent(event)
  const install = await getSlackInstall(event.orgId)

  // 1 — Determine the personal recipients. Each event picks a small,
  //     well-defined set: don't broadcast to the whole org by default.
  const recipientIds = await resolveRecipients(event)

  let usedBot = false
  if (install) {
    // DM each recipient individually. Failures on one don't block the others.
    for (const userId of recipientIds) {
      const slackId = await ensureUserSlackIdInOrg(install, event.orgId, userId)
      if (!slackId) continue
      const res = await sendSlackDm(install, slackId, {
        text: rendered.title,
        blocks: rendered.blocks,
      })
      if (res.ok) usedBot = true
    }
    // Channel broadcast for org-wide events. Personal events stay private.
    if (rendered.broadcast && install.defaultChannelId) {
      const res = await sendSlackChannel(install, {
        text: rendered.title,
        blocks: rendered.blocks,
      })
      if (res.ok) usedBot = true
    }
  }

  // 2 — Legacy webhook fallback. Only if the bot wasn't used at all — we
  //     don't want duplicate pings for orgs that have both wired up during
  //     a migration window.
  if (!usedBot && org.slackWebhookUrl) {
    await sendWebhook(org.slackWebhookUrl, rendered.title, rendered.text, rendered.color)
  }

  // 3 — Email fallback for high-priority events with no Slack at all.
  if (!install && !org.slackWebhookUrl) {
    const highPriority =
      event.kind === 'leave.requested' ||
      event.kind === 'shift.suspicious' ||
      event.kind === 'state.blocked' ||
      event.kind === 'blocker.help_requested'
    if (highPriority) {
      // DM the recipients via email if we know their addresses.
      for (const userId of recipientIds.length > 0 ? recipientIds : [org.ownerId]) {
        const u = await db.query.users.findFirst({ where: eq(schema.users.id, userId) })
        if (u?.email) {
          await sendDigestMail({
            to: u.email,
            subject: `[MARINA] ${rendered.title}`,
            text: rendered.text,
            html: `<p>${escapeHtml(rendered.text).replace(/\n/g, '<br/>')}</p>`,
          })
        }
      }
    }
  }
}

/**
 * Map each event to the set of MARINA user IDs who should be DM'd. Read
 * managers fresh per-event so capability changes are picked up without a
 * server restart.
 */
async function resolveRecipients(event: NotifyEvent): Promise<number[]> {
  switch (event.kind) {
    case 'leave.requested':
      // Everyone with decide_leaves (managers by default + extra-cap holders).
      return userIdsWithCapability(event.orgId, 'decide_leaves')
    case 'leave.decided':
      // DM the employee whose leave was decided.
      return [event.actorUserId]
    case 'shift.suspicious':
    case 'state.blocked':
      // Managers see suspicious punch-outs and blocked teammates.
      return managerUserIdsForOrg(event.orgId)
    case 'shift.punched_out':
      // Manager visibility — they may want to inspect.
      return managerUserIdsForOrg(event.orgId)
    case 'break.started':
      // Low signal — skip personal DMs; rely on channel broadcast.
      return []
    case 'blocker.pinged':
      // The teammate being asked for help. External-only (e.g. someone not
      // in MARINA) gets a channel mention instead.
      return event.waitingOnUserId ? [event.waitingOnUserId] : []
    case 'blocker.help_requested':
      return [event.helperUserId]
    case 'break.checkin':
      return [event.targetUserId]
    case 'celebration.birthday':
    case 'celebration.anniversary':
      // Broadcast only — no DM (the celebrated person sees it in the channel too).
      return []
  }
}

type Rendered = {
  title: string
  text: string
  color: string
  blocks?: unknown[]
  broadcast: boolean  // whether to also post into the default channel
}

function renderEvent(e: NotifyEvent): Rendered {
  switch (e.kind) {
    case 'leave.requested': {
      // One-click approve/deny links (signed). Managers can act straight from
      // Slack / email without opening the app. The landing page re-checks RBAC.
      const links = leaveActionLinks(e.leaveId)
      const actionLine = links ? `Approve: ${links.approve}\nDeny: ${links.deny}` : ''
      return {
        title: `Leave requested · ${e.userName}`,
        text: `*${e.leaveType}* from *${e.startDate}* to *${e.endDate}*\n${e.reason}${actionLine ? `\n\n${actionLine}` : ''}`,
        color: '#c19a4d',
        broadcast: false,
        blocks: simpleBlocks(`📅 *Leave requested · ${e.userName}*`, [
          `*${e.leaveType}* — ${e.startDate} → ${e.endDate}`,
          e.reason,
          ...(links ? [`<${links.approve}|✅ Approve>   ·   <${links.deny}|❌ Deny>`] : []),
        ]),
      }
    }
    case 'leave.decided':
      return {
        title: `Leave ${e.decision} · ${e.userName}`,
        text: `${e.startDate} to ${e.endDate}${e.note ? `\n${e.note}` : ''}`,
        color: e.decision === 'approved' ? '#3f6b54' : '#b34d4d',
        broadcast: e.decision === 'approved',  // announce the approved leaves to the team
        blocks: simpleBlocks(
          `${e.decision === 'approved' ? '✅' : '❌'} *Leave ${e.decision} · ${e.userName}*`,
          [`${e.startDate} → ${e.endDate}`, e.note ?? ''].filter(Boolean),
        ),
      }
    case 'break.started':
      return {
        title: `On break · ${e.userName}`,
        text: e.reason,
        color: '#8a8478',
        broadcast: true,
        blocks: simpleBlocks(`☕ *${e.userName} is on a break*`, [e.reason]),
      }
    case 'shift.punched_out': {
      const hh = Math.floor(e.durationMins / 60)
      const mm = e.durationMins % 60
      return {
        title: `Punched out · ${e.userName} (${hh}h ${mm}m)`,
        text: `*Summary:* ${e.summary}${e.notes ? `\n*Note:* ${e.notes}` : ''}`,
        color: e.verificationStatus === 'verified' ? '#3f6b54' : '#c19a4d',
        broadcast: false,
        blocks: simpleBlocks(`🚪 *${e.userName} ended shift · ${hh}h ${mm}m*`, [
          e.summary,
          e.notes ?? '',
        ].filter(Boolean)),
      }
    }
    case 'shift.suspicious':
      return {
        title: `Suspect punch-out · ${e.userName}`,
        text: e.reason,
        color: '#b34d4d',
        broadcast: false,
        blocks: simpleBlocks(`⚠️ *Suspect punch-out · ${e.userName}*`, [e.reason]),
      }
    case 'state.blocked':
      return {
        title: `Blocked · ${e.userName}`,
        text: e.reason,
        color: '#c19a4d',
        broadcast: false,
        blocks: simpleBlocks(`🛑 *${e.userName} is blocked*`, [e.reason]),
      }
    case 'blocker.pinged': {
      const who = e.waitingOnLogin ? `@${e.waitingOnLogin}` : e.waitingOnExternal ?? 'someone'
      return {
        title: `${who}, ${e.blockedName} is waiting on you`,
        text: e.reason || 'A teammate is blocked on your input.',
        color: '#c47b56',
        broadcast: false,
        blocks: simpleBlocks(`🔔 *${e.blockedName} is waiting on you*`, [
          e.reason || 'A teammate is blocked on your input.',
        ]),
      }
    }
    case 'blocker.help_requested':
      return {
        title: `Can you help unblock ${e.blockedName}?`,
        text: [
          `${e.managerName} asked you to help unblock *${e.blockedName}*.`,
          e.reason ? `Reason: ${e.reason}` : '',
          e.note ? `Note: ${e.note}` : '',
        ].filter(Boolean).join('\n'),
        color: '#b34d4d',
        broadcast: false,
        blocks: simpleBlocks(`🆘 *${e.managerName} asked: can you help ${e.blockedName}?*`, [
          e.reason || '',
          e.note || '',
        ].filter(Boolean)),
      }
    case 'break.checkin':
      return {
        title: `Check-in from ${e.managerName}`,
        text: e.reason,
        color: '#c47b56',
        broadcast: false,
        blocks: simpleBlocks(`👋 *${e.managerName} checking in*`, [e.reason]),
      }
    case 'celebration.birthday':
      return {
        title: `🎂 Happy birthday, ${e.userName}!`,
        text: `Wishing ${e.userName} a great day — drop a 🎉 to celebrate.`,
        color: '#c19a4d',
        broadcast: true,
        blocks: simpleBlocks(`🎂 *Happy birthday, ${e.userName}!*`, [
          `Wishing ${e.userName} a great day — drop a 🎉 to celebrate.`,
        ]),
      }
    case 'celebration.anniversary':
      return {
        title: `🎉 ${e.userName} · ${e.years} year${e.years === 1 ? '' : 's'}!`,
        text: `${e.userName} is celebrating ${e.years} year${e.years === 1 ? '' : 's'} with the team today.`,
        color: '#3f6b54',
        broadcast: true,
        blocks: simpleBlocks(`🎉 *${e.userName} · ${e.years} year${e.years === 1 ? '' : 's'} with the team!*`, [
          `Drop a note to say thanks for the journey so far.`,
        ]),
      }
  }
}

function simpleBlocks(headline: string, lines: string[]): unknown[] {
  const blocks: unknown[] = [
    {
      type: 'section',
      text: { type: 'mrkdwn', text: headline },
    },
  ]
  if (lines.length > 0 && lines.some(Boolean)) {
    blocks.push({
      type: 'context',
      elements: [
        { type: 'mrkdwn', text: lines.filter(Boolean).map((l) => l.trim()).join('\n') },
      ],
    })
  }
  return blocks
}

async function sendWebhook(webhookUrl: string, title: string, text: string, color: string): Promise<void> {
  try {
    await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        attachments: [
          {
            color,
            title,
            text,
            mrkdwn_in: ['text'],
            footer: 'MARINA',
            ts: Math.floor(Date.now() / 1000),
          },
        ],
      }),
    })
  } catch (err) {
    console.error('[notify] webhook send failed', err)
  }
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}

/** Re-exports for direct use from cron / digest paths. */
export { getSlackInstall, sendSlackDm, sendSlackChannel } from '@/lib/slack/client'
