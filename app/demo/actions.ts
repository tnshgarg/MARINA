'use server'

import { sendEmail } from '@/lib/email/send'
import { afterResponse } from '@/lib/after'

export type DemoFormState = {
  status: 'idle' | 'ok' | 'error'
  message?: string
}

const TEAM_SIZES = new Set(['1-5', '6-20', '21-50', '51-200', '200+'])

function sanitize(s: unknown, max: number): string {
  if (typeof s !== 'string') return ''
  return s.trim().slice(0, max)
}

function isEmail(s: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s)
}

/**
 * Server action backing the `/demo` form. Captures name + email + team size +
 * one-liner about what they're struggling with, then fires an email to the
 * MARINA founder address. We avoid blocking the response on the email so the
 * user sees the "we're on it" confirmation immediately even if the email
 * provider is slow — the form just needs to feel snappy.
 */
export async function submitDemoRequest(
  _prev: DemoFormState,
  formData: FormData,
): Promise<DemoFormState> {
  const name = sanitize(formData.get('name'), 80)
  const email = sanitize(formData.get('email'), 200)
  const teamSize = sanitize(formData.get('teamSize'), 16)
  const struggle = sanitize(formData.get('struggle'), 1000)
  const company = sanitize(formData.get('company'), 120)

  if (name.length < 2) {
    return { status: 'error', message: 'Please tell us your name.' }
  }
  if (!isEmail(email)) {
    return { status: 'error', message: 'That doesn\'t look like a valid work email.' }
  }
  if (!TEAM_SIZES.has(teamSize)) {
    return { status: 'error', message: 'Pick a team size so we can send the right info.' }
  }

  const to = process.env.DEMO_REQUEST_INBOX || 'thetanishgarg@gmail.com'

  const subject = `Demo request · ${name} · ${company || teamSize}`
  const html = `
    <div style="font-family: -apple-system, system-ui, sans-serif; max-width: 540px; margin: 0 auto; padding: 24px; color: #1f2937;">
      <p style="font-size: 11px; letter-spacing: 0.1em; text-transform: uppercase; color: #6b7280; margin: 0;">MARINA · Demo request</p>
      <h1 style="font-size: 22px; margin: 8px 0 18px;">${escapeHtml(name)} wants a demo</h1>
      <table style="font-size: 14px; line-height: 1.7;">
        <tr><td style="color:#6b7280;padding-right:16px;">Email</td><td><a href="mailto:${escapeHtml(email)}">${escapeHtml(email)}</a></td></tr>
        ${company ? `<tr><td style="color:#6b7280;padding-right:16px;">Company</td><td>${escapeHtml(company)}</td></tr>` : ''}
        <tr><td style="color:#6b7280;padding-right:16px;">Team size</td><td>${escapeHtml(teamSize)}</td></tr>
      </table>
      ${
        struggle
          ? `<p style="margin-top: 18px; padding: 14px 16px; background: #f8f9f4; border-left: 3px solid #3f6b54; border-radius: 6px; line-height: 1.55;">${escapeHtml(struggle).replace(/\n/g, '<br/>')}</p>`
          : ''
      }
      <p style="margin-top: 22px; font-size: 12px; color: #6b7280;">Sent from the MARINA landing page demo form.</p>
    </div>
  `

  afterResponse(async () => {
    const res = await sendEmail({ to, subject, html })
    if (!res.ok) {
      console.error('[demo] sendEmail failed', res.error, {
        name,
        email,
        teamSize,
        company,
        struggleLength: struggle.length,
      })
    } else {
      console.log('[demo] sent demo request email', { id: res.id, name, email })
    }
  }, 'demo-request-email')

  return {
    status: 'ok',
    message:
      'We got it. Tanish will reach out within 24h with a calendar link and a tailored demo. Check your inbox.',
  }
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!,
  )
}
