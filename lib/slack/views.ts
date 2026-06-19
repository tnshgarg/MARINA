import { LEAVE_TYPE_LABELS, type LeaveType } from '@/lib/db/schema'
import type { PersonalBrief } from '@/lib/brief/personal'
import type { TeamPulse } from '@/lib/brief/pulse'

/**
 * PURE Block Kit view builders for the Slack surface. No DB, no I/O — given a
 * model, return a Slack view. Design goal: clean and typographic (bold labels,
 * two-column `fields`, dividers, restrained punctuation) rather than emoji
 * clutter. This is the Slack adapter's "render" half of the surface
 * abstraction; the Teams adapter renders the same models as Adaptive Cards.
 */
type Block = Record<string, unknown>
export type SlackView = Record<string, unknown>

// ---- block helpers ----
const section = (text: string): Block => ({ type: 'section', text: { type: 'mrkdwn', text } })
const fieldsBlock = (pairs: [string, string][]): Block => ({
  type: 'section',
  fields: pairs.map(([k, v]) => ({ type: 'mrkdwn', text: `*${k}*\n${v}` })),
})
const header = (text: string): Block => ({ type: 'header', text: { type: 'plain_text', text, emoji: true } })
const context = (text: string): Block => ({ type: 'context', elements: [{ type: 'mrkdwn', text }] })
const divider = (): Block => ({ type: 'divider' })
const button = (
  text: string,
  action_id: string,
  opts: { style?: 'primary' | 'danger'; url?: string; value?: string; confirm?: unknown } = {},
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
const leaveLabel = (type: string) => LEAVE_TYPE_LABELS[type as LeaveType] ?? 'Leave'

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
  bits.push(p.activeShift ? `you're on the clock (${fmtMin(p.activeShift.sinceMin)})` : `you're off the clock`)
  if (p.activeBreak?.category === 'blocked') bits.push('blocked on something')
  else if (p.activeBreak) bits.push('on a break')
  if (p.deliverablesToday.count) bits.push(`${p.deliverablesToday.count} shipped today`)
  if (m.isManager && m.pulse && m.pulse.blocked) bits.push(`${m.pulse.blocked} on the team blocked`)
  return cap(bits.join(' · '))
}

export function appHomeView(m: AppHomeModel): SlackView {
  const p = m.personal
  const blocks: Block[] = []

  blocks.push(header('Marina'))
  blocks.push(section(`*${m.greeting}*\n${marinaLine(m)}`))
  blocks.push(context('Marina · your chief of staff'))

  // Contextual primary actions (no emoji — labels carry the meaning).
  const els: Block[] = []
  if (p.activeShift) els.push(button('Punch out', 'open_punchout_modal', { style: 'danger' }))
  else els.push(button('Punch in', 'punch_in', { style: 'primary' }))
  els.push(button('Log work', 'open_deliverable_modal'))
  els.push(button('Request leave', 'open_leave_modal'))
  if (p.activeBreak?.category === 'blocked') els.push(button('Resolve blocker', 'resolve_blocker', { style: 'primary' }))
  else if (p.activeBreak) els.push(button('End break', 'end_break'))
  else els.push(button('Raise blocker', 'open_blocker_modal'))
  blocks.push(actions(els))

  blocks.push(divider())
  blocks.push(section('*Your day*'))
  blocks.push(
    fieldsBlock([
      ['Status', p.activeShift ? `On the clock · ${fmtMin(p.activeShift.sinceMin)}` : 'Off the clock'],
      ['Shipped today', String(p.deliverablesToday.count)],
      [leaveLabel(p.leave?.type ?? 'casual'), p.leave ? `${p.leave.remaining} of ${p.leave.quota} left` : '—'],
      ['Pending requests', p.pendingLeaves ? String(p.pendingLeaves) : '—'],
    ]),
  )
  if (p.deliverablesToday.titles.length) {
    blocks.push(context(p.deliverablesToday.titles.map((t) => `• ${t}`).join('   ')))
  }
  if (p.activeBreak) {
    const label = p.activeBreak.category === 'blocked' ? 'Blocked on' : 'On a break'
    blocks.push(section(`*${label}*\n${p.activeBreak.reason} · ${fmtMin(p.activeBreak.sinceMin)}`))
  }

  if (m.isManager && m.pulse) {
    blocks.push(divider())
    blocks.push(section('*Team*'))
    blocks.push(
      fieldsBlock([
        ['On shift', String(m.pulse.onShift)],
        ['Blocked', String(m.pulse.blocked)],
        ['Team size', String(m.pulse.total)],
      ]),
    )
    if (m.pulse.blockers.length) {
      blocks.push(
        section(
          m.pulse.blockers
            .slice(0, 5)
            .map((b) => `*${b.name}* — waiting on ${b.waitingOn} · ${fmtMin(b.sinceMin)}`)
            .join('\n'),
        ),
      )
    }
    if (m.webUrl) blocks.push(actions([button('Open dashboard', 'open_web', { url: m.webUrl })]))
  }

  blocks.push(divider())
  blocks.push(context('Ask Marina anything — just send a direct message.'))

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
      ...(webUrl ? [actions([button('Open MARINA', 'open_web', { url: webUrl })])] : []),
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

export function standupModal(orgId: number, prefill: { yesterday: string; blockers: string }): SlackView {
  return {
    type: 'modal',
    callback_id: 'modal_standup',
    private_metadata: meta(orgId),
    title: { type: 'plain_text', text: 'Standup' },
    submit: { type: 'plain_text', text: 'Post' },
    close: { type: 'plain_text', text: 'Cancel' },
    blocks: [
      input(
        'yesterday',
        'Yesterday',
        textInput({
          multiline: true,
          max_length: 1500,
          ...(prefill.yesterday ? { initial_value: prefill.yesterday } : {}),
          placeholder: { type: 'plain_text', text: 'What you got done' },
        }),
      ),
      input(
        'today',
        'Today',
        textInput({
          multiline: true,
          max_length: 1500,
          placeholder: { type: 'plain_text', text: "What you're focusing on" },
        }),
      ),
      input(
        'blockers',
        'Blockers (optional)',
        textInput({
          multiline: true,
          max_length: 1000,
          ...(prefill.blockers ? { initial_value: prefill.blockers } : {}),
          placeholder: { type: 'plain_text', text: 'Anything in your way?' },
        }),
        true,
      ),
    ],
  }
}
