import { eq } from 'drizzle-orm'
import { db, schema } from '@/lib/db/client'

export type NotifyEvent =
  | { kind: 'leave.requested'; orgId: number; userName: string; userLogin: string; startDate: string; endDate: string; leaveType: string; reason: string }
  | { kind: 'leave.decided'; orgId: number; userName: string; userLogin: string; decision: 'approved' | 'denied'; startDate: string; endDate: string; note?: string | null }
  | { kind: 'break.started'; orgId: number; userName: string; userLogin: string; reason: string }
  | { kind: 'shift.punched_out'; orgId: number; userName: string; userLogin: string; durationMins: number; verificationStatus: string; verificationScore: number | null; summary: string; notes?: string | null }
  | { kind: 'shift.suspicious'; orgId: number; userName: string; userLogin: string; reason: string }
  | { kind: 'state.blocked'; orgId: number; userName: string; userLogin: string; reason: string }

/**
 * Best-effort fan-out. Reads the org's slack webhook + falls back to emailing
 * the org owner via Resend. Never throws; all errors are logged.
 */
export async function notify(event: NotifyEvent): Promise<void> {
  try {
    const org = await db.query.orgs.findFirst({ where: eq(schema.orgs.id, event.orgId) })
    if (!org) return

    const { title, text, color } = renderEvent(event)

    // Slack
    if (org.slackWebhookUrl) {
      void sendSlack(org.slackWebhookUrl, title, text, color)
    }

    // Email fallback: deliver to org owner if no Slack and event is high-priority
    const highPriority =
      event.kind === 'leave.requested' ||
      event.kind === 'shift.suspicious' ||
      event.kind === 'state.blocked'
    if (highPriority && !org.slackWebhookUrl) {
      const owner = await db.query.users.findFirst({ where: eq(schema.users.id, org.ownerId) })
      if (owner?.email) {
        void sendEmail(owner.email, `[MARINA] ${title}`, text)
      }
    }
  } catch (err) {
    console.error('[notify] failed', err)
  }
}

async function sendSlack(webhookUrl: string, title: string, text: string, color: string): Promise<void> {
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
            footer: 'MARINA · AI Workforce Intelligence',
            ts: Math.floor(Date.now() / 1000),
          },
        ],
      }),
    })
  } catch (err) {
    console.error('[notify] slack send failed', err)
  }
}

async function sendEmail(to: string, subject: string, text: string): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) return
  try {
    await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        from: process.env.RESEND_FROM || 'MARINA <onboarding@resend.dev>',
        to,
        subject,
        text,
      }),
    })
  } catch (err) {
    console.error('[notify] email send failed', err)
  }
}

function renderEvent(e: NotifyEvent): { title: string; text: string; color: string } {
  switch (e.kind) {
    case 'leave.requested':
      return {
        title: `Leave requested · ${e.userName}`,
        text: `*${e.leaveType}* from *${e.startDate}* to *${e.endDate}*\n${e.reason}`,
        color: '#f59e0b',
      }
    case 'leave.decided':
      return {
        title: `Leave ${e.decision} · ${e.userName}`,
        text: `${e.startDate} to ${e.endDate}${e.note ? `\n_${e.note}_` : ''}`,
        color: e.decision === 'approved' ? '#10b981' : '#ef4444',
      }
    case 'break.started':
      return {
        title: `On break · ${e.userName}`,
        text: e.reason,
        color: '#94a3b8',
      }
    case 'shift.punched_out': {
      const hh = Math.floor(e.durationMins / 60)
      const mm = e.durationMins % 60
      const conf =
        e.verificationScore !== null ? ` · ${e.verificationScore}/100 match` : ''
      return {
        title: `Punched out · ${e.userName} (${hh}h ${mm}m${conf})`,
        text: `*Status:* ${e.verificationStatus}\n*Summary:* ${e.summary}${e.notes ? `\n*AI note:* ${e.notes}` : ''}`,
        color:
          e.verificationStatus === 'verified'
            ? '#10b981'
            : e.verificationStatus === 'suspect'
              ? '#ef4444'
              : '#94a3b8',
      }
    }
    case 'shift.suspicious':
      return {
        title: `⚠️ Suspect punch-out · ${e.userName}`,
        text: e.reason,
        color: '#ef4444',
      }
    case 'state.blocked':
      return {
        title: `Blocked · ${e.userName}`,
        text: e.reason,
        color: '#f59e0b',
      }
  }
}
