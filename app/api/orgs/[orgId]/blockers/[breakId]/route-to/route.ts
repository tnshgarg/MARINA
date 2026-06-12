import { NextResponse } from 'next/server'
import { and, eq, isNull } from 'drizzle-orm'
import { db, schema } from '@/lib/db/client'
import { HttpError, requireMembership } from '@/lib/auth/guards'
import { sendEmail } from '@/lib/email/send'
import { audit, requestMeta } from '@/lib/audit/log'
import { afterResponse } from '@/lib/after'
import { notify } from '@/lib/notify/send'

export const runtime = 'nodejs'

/**
 * Route a blocker to a different teammate who might be able to help.
 *
 * Use case: the blocked person was waiting on someone who's unavailable
 * (on leave, in a meeting, asleep in a different timezone). The manager
 * routes the unblock request to anyone on the team who could help.
 *
 * Sends:
 *  - In-app notification to the helper (shows up in the bell)
 *  - Email to the helper (if they have an address on file)
 *  - Slack DM via the org webhook
 *  - Desktop notification via the paired agent (polled by /api/agent/notifications)
 *
 * Records the routing in the blocker thread so the audit trail is complete.
 */
export async function POST(
  req: Request,
  ctx: { params: Promise<{ orgId: string; breakId: string }> },
) {
  const { orgId: rawOrg, breakId: rawBreak } = await ctx.params
  const orgId = Number(rawOrg)
  const breakId = Number(rawBreak)
  if (!Number.isInteger(orgId) || !Number.isInteger(breakId)) {
    return NextResponse.json({ error: 'invalid ids' }, { status: 400 })
  }

  try {
    const { session } = await requireMembership(orgId, 'manager')
    const body = (await req.json().catch(() => ({}))) as {
      helperUserId?: number
      note?: string
    }
    const helperUserId = body.helperUserId
    const note = (body.note ?? '').trim().slice(0, 500)
    if (typeof helperUserId !== 'number') {
      return NextResponse.json({ error: 'helperUserId required' }, { status: 400 })
    }

    // Verify the helper is an active member of this org.
    const helperMembership = await db.query.memberships.findFirst({
      where: and(
        eq(schema.memberships.orgId, orgId),
        eq(schema.memberships.userId, helperUserId),
        isNull(schema.memberships.endedAt),
      ),
    })
    if (!helperMembership) {
      return NextResponse.json({ error: 'helper not in this org' }, { status: 400 })
    }

    // Load the blocker + associated parties.
    const blocker = await db.query.breaks.findFirst({
      where: and(
        eq(schema.breaks.id, breakId),
        eq(schema.breaks.orgId, orgId),
        isNull(schema.breaks.endedAt),
      ),
    })
    if (!blocker) {
      return NextResponse.json({ error: 'blocker not found or already resolved' }, { status: 404 })
    }
    if (blocker.category !== 'blocked') {
      return NextResponse.json({ error: 'not a blocker' }, { status: 400 })
    }
    if (helperUserId === blocker.userId) {
      return NextResponse.json({ error: 'cannot route to the blocked person' }, { status: 400 })
    }
    // Manager can't route a blocker to themselves — that's a "Resolve" action,
    // not a route. Block here so the UI doesn't accidentally let it through.
    if (helperUserId === session.appUserId) {
      return NextResponse.json({ error: 'cannot route to yourself' }, { status: 400 })
    }

    const [helper, blocked, manager] = await Promise.all([
      db.query.users.findFirst({ where: eq(schema.users.id, helperUserId) }),
      db.query.users.findFirst({ where: eq(schema.users.id, blocker.userId) }),
      db.query.users.findFirst({ where: eq(schema.users.id, session.appUserId) }),
    ])
    if (!helper || !blocked || !manager) {
      return NextResponse.json({ error: 'user lookup failed' }, { status: 500 })
    }

    // Log the routing in the thread so it shows up in the history.
    const threadBody =
      `Routed help request to ${helper.name ?? '@' + helper.login}.` +
      (note ? `\n\n${note}` : '')
    // Best-effort thread log — the routing still works even if the thread
    // table hasn't been migrated yet; the user gets pinged either way.
    try {
      await db.insert(schema.blockerThread).values({
        breakId: blocker.id,
        authorUserId: session.appUserId,
        kind: 'suggestion',
        body: threadBody,
      })
    } catch (e) {
      console.warn('blocker_thread missing (run db:push):', e instanceof Error ? e.message : e)
    }

    audit({
      action: 'blocker.pinged',
      orgId,
      actorUserId: session.appUserId,
      targetType: 'break',
      targetId: blocker.id,
      payload: {
        routedToUserId: helperUserId,
        blockedUserId: blocker.userId,
        original_waitingOn: blocker.waitingOnUserId ?? blocker.waitingOnExternal,
      },
      ...requestMeta(req),
    })

    // Build the notification payload once and fan out to all channels.
    const blockedName = blocked.name ?? `@${blocked.login}`
    const managerName = manager.name ?? `@${manager.login}`
    const title = `${managerName} asked you to help unblock ${blockedName}`
    const subject = `Can you help unblock ${blockedName}?`
    const reasonLine = blocker.reason ? `\n\nThey said: "${blocker.reason}"` : ''
    const extraNote = note ? `\n\n${managerName}'s note: ${note}` : ''
    const bodyText = `${blockedName} is blocked and could use your help.${reasonLine}${extraNote}`

    // Fan-out: in-app, email, Slack, desktop (via agent polling).
    afterResponse(
      async () => {
        // In-app notification (the bell + agent will both pick this up).
        await db.insert(schema.notifications).values({
          userId: helperUserId,
          orgId,
          kind: 'blocker.help_requested',
          title,
          body: bodyText.slice(0, 500),
          href: null,
        })

        // Email — only if we have an address.
        if (helper.email) {
          await sendEmail({
            to: helper.email,
            subject,
            html: `<p>Hi ${helper.name ?? helper.login},</p>
<p><strong>${managerName}</strong> asked if you can help unblock <strong>${blockedName}</strong>.</p>
${blocker.reason ? `<p><em>Reason:</em> ${escapeHtml(blocker.reason)}</p>` : ''}
${note ? `<p><em>Manager's note:</em> ${escapeHtml(note)}</p>` : ''}
<p>Open MARINA to see the full thread and reply.</p>`,
            text: `${managerName} asked if you can help unblock ${blockedName}.${
              blocker.reason ? `\n\nReason: ${blocker.reason}` : ''
            }${note ? `\n\nNote: ${note}` : ''}`,
          })
        }

      },
      'route blocker to helper',
    )

    // Slack fan-out via the org webhook (the notify() system handles webhook-
    // absent gracefully).
    notify({
      kind: 'blocker.help_requested',
      orgId,
      actorUserId: blocker.userId,
      helperUserId,
      blockedName,
      helperName: helper.name ?? `@${helper.login}`,
      managerName,
      reason: blocker.reason,
      note,
    })

    return NextResponse.json({ ok: true })
  } catch (err) {
    if (err instanceof HttpError) {
      return NextResponse.json({ error: err.message }, { status: err.status })
    }
    console.error('blocker route-to failed', err)
    return NextResponse.json({ error: 'internal' }, { status: 500 })
  }
}

function escapeHtml(s: string): string {
  return s
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
}
