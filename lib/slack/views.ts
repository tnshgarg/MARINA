import { LEAVE_TYPE_LABELS, type LeaveType } from '@/lib/db/schema'
import type { PersonalBrief } from '@/lib/brief/personal'
import type { TeamPulse } from '@/lib/brief/pulse'

/**
 * PURE Block Kit view builders for the Slack surface. No DB, no I/O — given a
 * model, return a Slack view object. This is the Slack adapter's "render"
 * half of the surface abstraction; the Teams adapter will have an Adaptive-Card
 * equivalent over the same models. Kept pure so it's unit-testable.
 */
type Block = Record<string, unknown>
export type SlackView = Record<string, unknown>

// ---- block helpers ----
const section = (text: string): Block => ({ type: 'section', text: { type: 'mrkdwn', text } })
const header = (text: string): Block => ({ type: 'header', text: { type: 'plain_text', text, emoji: true } })
const context = (text: string): Block => ({ type: 'context', elements: [{ type: 'mrkdwn', text }] })
const divider = (): Block => ({ type: 'divider' })
const button = (
  text: string,
  action_id: string,
  opts: { style?: 'primary' | 'danger'; url?: string; value?: string } = {},
): Block => ({ type: 'button', text: { type: 'plain_text', text, emoji: true }, action_id, ...opts })
const actions = (elements: Block[]): Block => ({ type: 'actions', elements })
const input = (block_id: string, label: string, element: Block, optional = false): Block => ({
  type: 'input',
  block_id,
  optional,
  label: { type: 'plain_text', text: label, emoji: true },
  element,
})
const textInput = (opts: Record<string, unknown> = {}): Block => ({
  type: 'plain_text_input',
  action_id: 'value',
  ...opts,
})

function fmtMin(min: number): string {
  if (min < 60) return `${min}m`
  const h = Math.floor(min / 60)
  const m = min % 60
  return m ? `${h}h ${m}m` : `${h}h`
}
const cap = (s: string) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s)

// ---- App Home ----
export type AppHomeModel = {
  greeting: string
  personal: PersonalBrief
  isManager: boolean
  pulse: TeamPulse | null
  orgId: number
  webUrl: string
}

function marinaLine(m: AppHomeModel): string {
  const p = m.personal
  const bits: string[] = []
  bits.push(p.activeShift ? `you're on the clock (${fmtMin(p.activeShift.sinceMin)})` : `you're not punched in yet`)
  if (p.myBlockers.length) bits.push(`${p.myBlockers.length} thing${p.myBlockers.length > 1 ? 's' : ''} blocking you`)
  if (p.deliverablesToday.count) bits.push(`${p.deliverablesToday.count} shipped today`)
  if (m.isManager && m.pulse && m.pulse.blocked) bits.push(`${m.pulse.blocked} on the team blocked`)
  return cap(bits.join(' · '))
}

export function appHomeView(m: AppHomeModel): SlackView {
  const p = m.personal
  const blocks: Block[] = []

  blocks.push(header('Marina'))
  blocks.push(section(`*${m.greeting}*\n_${marinaLine(m)}_`))
  blocks.push(context('— Marina, your chief of staff'))

  // Primary actions — punch in/out swaps on shift state.
  const actionEls: Block[] = []
  if (p.activeShift) actionEls.push(button('🔴 Punch out', 'open_punchout_modal', { style: 'danger' }))
  else actionEls.push(button('🟢 Punch in', 'punch_in', { style: 'primary' }))
  actionEls.push(button('✅ Log work', 'open_deliverable_modal'))
  actionEls.push(button('🌴 Request leave', 'open_leave_modal'))
  actionEls.push(button('🛑 Raise blocker', 'open_blocker_modal'))
  blocks.push(actions(actionEls))

  blocks.push(divider())

  // Your day
  blocks.push(section('*Your day*'))
  const shiftLine = p.activeShift
    ? `:large_green_circle: On the clock — ${fmtMin(p.activeShift.sinceMin)}`
    : ':white_circle: Not punched in'
  const delivLine = p.deliverablesToday.count
    ? `:package: Shipped today: ${p.deliverablesToday.count}\n${p.deliverablesToday.titles.map((t) => `• ${t}`).join('\n')}`
    : ':package: Nothing logged today yet'
  blocks.push(section(`${shiftLine}\n${delivLine}`))
  if (p.myBlockers.length) {
    blocks.push(
      section(
        `:no_entry: *You're blocked on:*\n${p.myBlockers
          .map((b) => `• ${b.reason} _(${fmtMin(b.sinceMin)})_`)
          .join('\n')}`,
      ),
    )
  }

  // Time off
  const leaveLine = p.leave
    ? `:palm_tree: ${LEAVE_TYPE_LABELS[(p.leave.type as LeaveType)] ?? p.leave.type}: *${p.leave.remaining}* of ${p.leave.quota} left`
    : ':palm_tree: Leave balance unavailable'
  const pendingLine = p.pendingLeaves ? ` · ${p.pendingLeaves} pending` : ''
  blocks.push(section(`${leaveLine}${pendingLine}`))

  // Manager pulse
  if (m.isManager && m.pulse) {
    blocks.push(divider())
    blocks.push(section('*Team pulse*'))
    blocks.push(
      section(
        `:rocket: ${m.pulse.onShift} on-shift   :no_entry: ${m.pulse.blocked} blocked   :busts_in_silhouette: ${m.pulse.total} total`,
      ),
    )
    if (m.pulse.blockers.length) {
      blocks.push(
        section(
          `*Blocked right now:*\n${m.pulse.blockers
            .slice(0, 5)
            .map((b) => `• *${b.name}* waiting on ${b.waitingOn} _(${fmtMin(b.sinceMin)})_`)
            .join('\n')}`,
        ),
      )
    }
    if (m.webUrl) blocks.push(actions([button('Open dashboard ↗', 'open_web', { url: m.webUrl })]))
  }

  blocks.push(divider())
  blocks.push(context('💬 *Ask Marina anything* — just send me a direct message.'))

  return { type: 'home', blocks }
}

/** Home shown to a Slack user we can't map to a MARINA member yet. */
export function linkAccountHomeView(webUrl: string): SlackView {
  return {
    type: 'home',
    blocks: [
      header('Marina'),
      section(
        "I can't find your MARINA account in this workspace yet. Accept your invite (or ask an admin to add you), then reopen this tab.",
      ),
      ...(webUrl ? [actions([button('Open MARINA ↗', 'open_web', { url: webUrl })])] : []),
    ],
  }
}

// ---- Modals (private_metadata carries the orgId for the submit handler) ----
const meta = (orgId: number) => JSON.stringify({ orgId })

export function deliverableModal(orgId: number): SlackView {
  return {
    type: 'modal',
    callback_id: 'modal_deliverable',
    private_metadata: meta(orgId),
    title: { type: 'plain_text', text: 'Log work' },
    submit: { type: 'plain_text', text: 'Log' },
    close: { type: 'plain_text', text: 'Cancel' },
    blocks: [
      input(
        'title',
        'What did you ship?',
        textInput({
          multiline: true,
          min_length: 10,
          max_length: 200,
          placeholder: { type: 'plain_text', text: 'e.g. Shipped the onboarding redesign v2' },
        }),
      ),
      input('url', 'Link (optional)', textInput({ placeholder: { type: 'plain_text', text: 'https://…' } }), true),
    ],
  }
}

export function leaveModal(orgId: number): SlackView {
  const types: LeaveType[] = ['casual', 'sick', 'earned', 'compoff', 'unpaid', 'other']
  const options = types.map((t) => ({ text: { type: 'plain_text', text: LEAVE_TYPE_LABELS[t] }, value: t }))
  return {
    type: 'modal',
    callback_id: 'modal_leave',
    private_metadata: meta(orgId),
    title: { type: 'plain_text', text: 'Request leave' },
    submit: { type: 'plain_text', text: 'Request' },
    close: { type: 'plain_text', text: 'Cancel' },
    blocks: [
      input('leave_type', 'Type', {
        type: 'static_select',
        action_id: 'value',
        initial_option: options[0],
        options,
      }),
      input('start_date', 'From', { type: 'datepicker', action_id: 'value' }),
      input('end_date', 'To', { type: 'datepicker', action_id: 'value' }),
      input(
        'reason',
        'Reason',
        textInput({ multiline: true, max_length: 500, placeholder: { type: 'plain_text', text: 'Why?' } }),
      ),
    ],
  }
}

export function punchOutModal(orgId: number, sinceMin?: number): SlackView {
  return {
    type: 'modal',
    callback_id: 'modal_punchout',
    private_metadata: meta(orgId),
    title: { type: 'plain_text', text: 'Punch out' },
    submit: { type: 'plain_text', text: 'Punch out' },
    close: { type: 'plain_text', text: 'Cancel' },
    blocks: [
      ...(typeof sinceMin === 'number' ? [context(`On the clock for ${fmtMin(sinceMin)}`)] : []),
      input(
        'summary',
        'What did you work on?',
        textInput({
          multiline: true,
          min_length: 20,
          max_length: 4000,
          placeholder: { type: 'plain_text', text: 'A couple of sentences on what you got done today.' },
        }),
      ),
    ],
  }
}

export function blockerModal(orgId: number): SlackView {
  return {
    type: 'modal',
    callback_id: 'modal_blocker',
    private_metadata: meta(orgId),
    title: { type: 'plain_text', text: 'Raise a blocker' },
    submit: { type: 'plain_text', text: 'Raise blocker' },
    close: { type: 'plain_text', text: 'Cancel' },
    blocks: [
      input(
        'reason',
        "What's blocking you?",
        textInput({
          multiline: true,
          max_length: 500,
          placeholder: { type: 'plain_text', text: 'e.g. Waiting on staging creds to deploy' },
        }),
      ),
      input(
        'waiting_on_external',
        'Waiting on (optional)',
        textInput({ placeholder: { type: 'plain_text', text: 'e.g. Stripe support, the design team' } }),
        true,
      ),
    ],
  }
}
