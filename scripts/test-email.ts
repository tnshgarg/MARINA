/**
 * Sends ONE real test email via the production Resend code path to the
 * address the user explicitly approved. Also doubles as a Resend-domain
 * verification probe (the response tells us whether marina.team is verified).
 *
 *   pnpm tsx --env-file=.env scripts/test-email.ts
 */
import { sendEmail } from '../lib/email/send'

async function main() {
  const to = process.env.TEST_EMAIL_TO || 'thetanishgarg@gmail.com'
  console.log('FROM:', process.env.RESEND_FROM)
  console.log('KEY set:', !!process.env.RESEND_API_KEY, 'len', (process.env.RESEND_API_KEY ?? '').length)
  console.log('TO  :', to)
  const r = await sendEmail({
    to,
    subject: '[MARINA] Test notification — delivery check',
    html: `<div style="font-family:system-ui,sans-serif;max-width:480px">
      <h2 style="color:#3f6b54">MARINA email delivery test</h2>
      <p>This is an automated test from MARINA's testing run on 2026-06-18.</p>
      <p>If you can read this, the email notification channel (Resend) works end-to-end.</p>
      <p style="color:#71717a;font-size:12px">Sent via the production <code>sendEmail()</code> path.</p>
    </div>`,
    text: 'MARINA email delivery test. If you received this, the email notification channel (Resend) works end-to-end.',
  })
  console.log('RESULT:', JSON.stringify(r, null, 2))
  if (!r.ok) {
    console.log('\n>>> Email did NOT send. The same failure applies to the loadtest blocker emails — meaning they did NOT deliver/bounce (no reputation harm), but email notifications also will not work in prod until this is fixed.')
  } else {
    console.log('\n>>> Email SENT (Resend accepted it, id above). marina.team is a verified sender — which ALSO means the loadtest blocker emails to @acmedemo.in were accepted and will bounce. Check Resend bounce rate.')
  }
}

main().catch((e) => { console.error('FATAL', e); process.exit(1) })
