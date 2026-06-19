import { NextResponse } from 'next/server'
import { afterResponse } from '@/lib/after'
import { getSlackInstall, openModal, sendSlackChannel, type SlackInstall } from '@/lib/slack/client'
import { resolveSlackActor, type SlackActor } from '@/lib/slack/identity'
import { publishAppHomeFor } from '@/lib/slack/home'
import { deliverableModal, leaveModal, punchOutModal, blockerModal } from '@/lib/slack/views'
import { createDeliverable } from '@/lib/deliverables/create'
import { requestLeave } from '@/lib/leave/request'
import { createBreak } from '@/lib/breaks/create'
import { endActiveBreak } from '@/lib/breaks/end'
import { punchIn, punchOut } from '@/lib/shifts/punch'
import { applyLeaveDecision } from '@/lib/leave/decide'

/**
 * Minimal shape of the Slack interaction payloads we read. (Slack sends much
 * more; we only type what we touch.)
 */
type StateField = { value?: string; selected_option?: { value?: string }; selected_date?: string }
export type InteractionPayload = {
  type?: string
  team?: { id?: string }
  user?: { id?: string; team_id?: string }
  trigger_id?: string
  response_url?: string
  callback_id?: string
  actions?: Array<{ action_id?: string; value?: string }>
  view?: {
    callback_id?: string
    private_metadata?: string
    state?: { values?: Record<string, Record<string, StateField>> }
  }
}

const ok = () => NextResponse.json({ ok: true })
const clear = () => NextResponse.json({ response_action: 'clear' })
const fieldErrors = (errors: Record<string, string>) =>
  NextResponse.json({ response_action: 'errors', errors })

function refreshHome(teamId: string, slackUserId: string) {
  afterResponse(() => publishAppHomeFor(teamId, slackUserId), 'home refresh after action')
}

/** Replace the message that hosted a button (e.g. the leave-request DM). */
async function replaceMessage(responseUrl: string | undefined, text: string): Promise<void> {
  if (!responseUrl) return
  try {
    await fetch(responseUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ replace_original: true, text }),
    })
  } catch {
    /* best-effort — the decision already landed in the DB */
  }
}

export async function handleInteractivity(payload: InteractionPayload): Promise<NextResponse> {
  const teamId = payload.team?.id ?? payload.user?.team_id ?? ''
  const slackUserId = payload.user?.id ?? ''
  if (!teamId || !slackUserId) return ok()

  switch (payload.type) {
    case 'block_actions':
      return handleBlockActions(payload, teamId, slackUserId)
    case 'view_submission':
      return handleViewSubmission(payload, teamId, slackUserId)
    case 'shortcut':
    case 'message_action':
      return handleShortcut(payload, teamId, slackUserId)
    default:
      return ok()
  }
}

async function withInstall(
  teamId: string,
  slackUserId: string,
): Promise<{ actor: SlackActor; install: SlackInstall } | null> {
  const actor = await resolveSlackActor(teamId, slackUserId)
  if (!actor) return null
  const install = await getSlackInstall(actor.org.id)
  if (!install) return null
  return { actor, install }
}

async function handleBlockActions(
  payload: InteractionPayload,
  teamId: string,
  slackUserId: string,
): Promise<NextResponse> {
  const actionId = payload.actions?.[0]?.action_id
  // 'open_web' is a link button — Slack handles it client-side, nothing to do.
  if (actionId === 'open_web') return ok()

  const ctx = await withInstall(teamId, slackUserId)
  if (!ctx) return ok()
  const { actor, install } = ctx
  const orgId = actor.org.id
  const triggerId = payload.trigger_id ?? ''

  switch (actionId) {
    case 'open_deliverable_modal':
      await openModal(install, triggerId, deliverableModal(orgId))
      break
    case 'open_leave_modal':
      await openModal(install, triggerId, leaveModal(orgId))
      break
    case 'open_blocker_modal':
      await openModal(install, triggerId, blockerModal(orgId))
      break
    case 'open_punchout_modal':
      await openModal(install, triggerId, punchOutModal(orgId))
      break
    case 'punch_in':
      await punchIn(actor.user.id, orgId)
      refreshHome(teamId, slackUserId)
      break
    case 'end_break':
      await endActiveBreak(actor.user.id)
      refreshHome(teamId, slackUserId)
      break
    case 'resolve_blocker':
      await endActiveBreak(actor.user.id, { resolution: 'self' })
      refreshHome(teamId, slackUserId)
      break
    case 'leave_approve':
    case 'leave_deny': {
      // Manager approves/denies a leave straight from the Slack DM.
      const leaveId = Number(payload.actions?.[0]?.value)
      const canDecide = actor.membership.role === 'admin' || actor.membership.role === 'manager'
      if (Number.isInteger(leaveId) && canDecide) {
        const decision = actionId === 'leave_approve' ? 'approve' : 'deny'
        await applyLeaveDecision({ leaveId, orgId, deciderUserId: actor.user.id, decision })
        await replaceMessage(payload.response_url, `Leave ${decision === 'approve' ? 'approved' : 'denied'}.`)
      } else if (!canDecide) {
        await replaceMessage(payload.response_url, 'Only a manager or admin can decide leave.')
      }
      break
    }
    default:
      // refresh_home (and anything unknown) just re-renders the Home tab.
      refreshHome(teamId, slackUserId)
      break
  }
  return ok()
}

async function handleViewSubmission(
  payload: InteractionPayload,
  teamId: string,
  slackUserId: string,
): Promise<NextResponse> {
  const view = payload.view
  const values = view?.state?.values ?? {}
  const orgId = safeOrgId(view?.private_metadata)
  const actor = await resolveSlackActor(teamId, slackUserId)
  if (!actor || !orgId) {
    return fieldErrors({ title: 'Your MARINA account could not be resolved. Reopen and try again.' })
  }

  const text = (block: string, action = 'value') => values?.[block]?.[action]?.value?.trim() ?? ''
  const selected = (block: string, action = 'value') => values?.[block]?.[action]?.selected_option?.value ?? ''
  const date = (block: string, action = 'value') => values?.[block]?.[action]?.selected_date ?? ''

  switch (view?.callback_id) {
    case 'modal_deliverable': {
      const r = await createDeliverable({
        userId: actor.user.id,
        orgId,
        title: text('title'),
        url: text('url') || null,
        detail: 'Logged via Slack',
      })
      if (!r.ok) return fieldErrors({ title: r.error })
      refreshHome(teamId, slackUserId)
      return clear()
    }
    case 'modal_leave': {
      const r = await requestLeave({
        userId: actor.user.id,
        orgId,
        leaveType: selected('leave_type') || 'casual',
        startDate: date('start_date'),
        endDate: date('end_date'),
        reason: text('reason'),
      })
      if (!r.ok) return fieldErrors({ reason: r.error })
      refreshHome(teamId, slackUserId)
      return clear()
    }
    case 'modal_punchout': {
      const r = await punchOut(actor.user.id, text('summary'))
      if (!r.ok) return fieldErrors({ summary: r.error })
      refreshHome(teamId, slackUserId)
      return clear()
    }
    case 'modal_blocker': {
      await createBreak({
        userId: actor.user.id,
        orgId,
        category: 'blocked',
        reason: text('reason'),
        waitingOnExternal: text('waiting_on_external') || null,
      })
      refreshHome(teamId, slackUserId)
      return clear()
    }
    case 'modal_standup': {
      const yesterday = text('yesterday')
      const today = text('today')
      const blockers = text('blockers')
      const install = await getSlackInstall(orgId)
      if (!install) return clear()
      const name = actor.user.name ?? `@${actor.user.login}`
      const blocks: unknown[] = [
        { type: 'section', text: { type: 'mrkdwn', text: `*${name}'s standup*` } },
        { type: 'section', text: { type: 'mrkdwn', text: `*Yesterday*\n${yesterday || '—'}` } },
        { type: 'section', text: { type: 'mrkdwn', text: `*Today*\n${today || '—'}` } },
        ...(blockers ? [{ type: 'section', text: { type: 'mrkdwn', text: `*Blockers*\n${blockers}` } }] : []),
      ]
      const res = await sendSlackChannel(install, { text: `${name}'s standup`, blocks })
      if (!res.ok) {
        return fieldErrors({ today: 'No default channel set — ask an admin to set one in Settings → Integrations → Slack.' })
      }
      return clear()
    }
    default:
      return clear()
  }
}

async function handleShortcut(
  payload: InteractionPayload,
  teamId: string,
  slackUserId: string,
): Promise<NextResponse> {
  const ctx = await withInstall(teamId, slackUserId)
  if (!ctx) return ok()
  const { actor, install } = ctx
  const orgId = actor.org.id
  const triggerId = payload.trigger_id ?? ''
  switch (payload.callback_id) {
    case 'log_work':
      await openModal(install, triggerId, deliverableModal(orgId))
      break
    case 'request_leave':
      await openModal(install, triggerId, leaveModal(orgId))
      break
    case 'raise_blocker':
      await openModal(install, triggerId, blockerModal(orgId))
      break
  }
  return ok()
}

function safeOrgId(meta: string | undefined): number | null {
  if (!meta) return null
  try {
    const parsed = JSON.parse(meta) as { orgId?: number }
    return typeof parsed.orgId === 'number' ? parsed.orgId : null
  } catch {
    return null
  }
}
