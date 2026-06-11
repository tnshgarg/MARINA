export type SendInviteEmailInput = {
  to: string
  inviteUrl: string
  orgName: string
  inviterLogin: string
  role: string
}

export type SendInviteResult =
  | { sent: true; provider: 'resend' }
  | { sent: false; reason: 'no_api_key' | 'failed'; details?: string }

/**
 * Send an invite email via Resend. If RESEND_API_KEY isn't configured, log the
 * invite link so the inviter can copy it manually from the UI / server logs.
 */
export async function sendInviteEmail(input: SendInviteEmailInput): Promise<SendInviteResult> {
  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) {
    console.log('[invite] no RESEND_API_KEY, surface link in UI instead:', input.inviteUrl)
    return { sent: false, reason: 'no_api_key' }
  }

  const from = process.env.RESEND_FROM || 'Project MARINA <onboarding@resend.dev>'
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        from,
        to: input.to,
        subject: `${input.inviterLogin} invited you to ${input.orgName} on Project MARINA`,
        html: renderInviteHtml(input),
        text: renderInviteText(input),
      }),
    })
    if (!res.ok) {
      const txt = await res.text().catch(() => '')
      console.error('[invite] resend failed', res.status, txt)
      return { sent: false, reason: 'failed', details: `${res.status} ${txt}` }
    }
    return { sent: true, provider: 'resend' }
  } catch (err) {
    console.error('[invite] resend threw', err)
    return { sent: false, reason: 'failed', details: String(err) }
  }
}

function renderInviteHtml(i: SendInviteEmailInput): string {
  return `
    <div style="font-family: -apple-system, system-ui, sans-serif; max-width: 520px; margin: 0 auto; padding: 24px;">
      <p style="font-size: 12px; letter-spacing: 0.1em; text-transform: uppercase; color: #71717a; margin: 0;">Project MARINA</p>
      <h1 style="font-size: 22px; margin: 8px 0 16px;">You've been invited to ${escapeHtml(i.orgName)}</h1>
      <p style="color: #3f3f46; line-height: 1.6;">
        <strong>${escapeHtml(i.inviterLogin)}</strong> invited you to join <strong>${escapeHtml(i.orgName)}</strong>
        as a <strong>${escapeHtml(i.role)}</strong>.
      </p>
      <p style="margin: 24px 0;">
        <a href="${i.inviteUrl}" style="display: inline-block; background: #18181b; color: white; padding: 10px 16px; border-radius: 6px; text-decoration: none; font-weight: 500;">Accept invite</a>
      </p>
      <p style="color: #71717a; font-size: 12px;">Or paste this link in your browser:<br/>${escapeHtml(i.inviteUrl)}</p>
    </div>
  `
}

function renderInviteText(i: SendInviteEmailInput): string {
  return [
    `${i.inviterLogin} invited you to ${i.orgName} on Project MARINA as ${i.role}.`,
    `Accept: ${i.inviteUrl}`,
  ].join('\n\n')
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)
}

/**
 * Generic HTML-or-text email sender. Awaits the Resend response and returns
 * an `{ ok, id, error }` result so the caller can decide whether to retry.
 * Use this for the CEO digest, password resets, anything where we need to
 * know whether it actually went out.
 */
export async function sendEmail({
  to,
  subject,
  html,
  text,
}: {
  to: string
  subject: string
  html?: string
  text?: string
}): Promise<{ ok: boolean; id?: string; error?: string }> {
  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) return { ok: false, error: 'RESEND_API_KEY not configured' }
  const from = process.env.RESEND_FROM || 'Project MARINA <onboarding@resend.dev>'
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ from, to, subject, html, text: text ?? stripTags(html ?? '') }),
    })
    const body = (await res.json().catch(() => null)) as { id?: string; message?: string } | null
    if (!res.ok) return { ok: false, error: `${res.status}: ${body?.message ?? 'send failed'}` }
    return { ok: true, id: body?.id }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
}

function stripTags(html: string): string {
  return html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
}

/**
 * Generic plain-text email to an employee. Fire-and-forget; runs in
 * background. Use for leave decisions, calendar reminders, etc.
 */
export function sendEmployeeEmail(to: string, subject: string, text: string): void {
  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) {
    console.log(`[email] no RESEND_API_KEY, would have sent to ${to}: ${subject}`)
    return
  }
  const from = process.env.RESEND_FROM || 'Project MARINA <onboarding@resend.dev>'
  void fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({ from, to, subject, text }),
  }).catch((err) => console.error('[email] employee send failed', err))
}
