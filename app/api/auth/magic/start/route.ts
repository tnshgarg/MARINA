import { NextResponse } from 'next/server'
import { db, schema } from '@/lib/db/client'
import { generateMagicToken, isValidEmail, MAGIC_TTL_MINUTES } from '@/lib/auth/magic'

export const runtime = 'nodejs'

/** Start the magic-link flow. Sends an email with a one-click sign-in link. */
export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { email?: string; redirectTo?: string }
  const email = (body.email ?? '').trim().toLowerCase()
  if (!email || !isValidEmail(email)) {
    return NextResponse.json({ error: 'Enter a valid email address.' }, { status: 400 })
  }
  const redirectTo = typeof body.redirectTo === 'string' && body.redirectTo.startsWith('/')
    ? body.redirectTo
    : '/'

  // Generate the token + persist hash
  const { plaintext, hash } = generateMagicToken()
  const expiresAt = new Date(Date.now() + MAGIC_TTL_MINUTES * 60_000)
  const ip = (req.headers.get('x-forwarded-for') ?? '').split(',')[0]?.trim() || null

  await db.insert(schema.magicLinks).values({
    email,
    tokenHash: hash,
    expiresAt,
    requestedIp: ip,
  })

  // Compose the link
  const base = process.env.NEXT_PUBLIC_APP_URL || new URL(req.url).origin
  const link = `${base.replace(/\/+$/, '')}/auth/verify?token=${encodeURIComponent(plaintext)}&redirect=${encodeURIComponent(redirectTo)}`

  // Send via Resend (if configured) or log the link for dev.
  const apiKey = process.env.RESEND_API_KEY
  let emailSent = false
  if (apiKey) {
    try {
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          from: process.env.RESEND_FROM || 'MARINA <onboarding@resend.dev>',
          to: email,
          subject: 'Your MARINA sign-in link',
          html: renderHtml(link),
          text: renderText(link),
        }),
      })
      emailSent = res.ok
      if (!res.ok) {
        const txt = await res.text().catch(() => '')
        console.error('[magic] resend failed', res.status, txt)
      }
    } catch (err) {
      console.error('[magic] resend threw', err)
    }
  }

  if (!emailSent) {
    // Dev / no-Resend mode: surface the link in logs.
    console.log(`[magic] sign-in link for ${email} → ${link}`)
  }

  return NextResponse.json({
    ok: true,
    sent: emailSent,
    // In dev (when no email provider is configured), include the link so the user can click it.
    devLink: emailSent ? undefined : link,
  })
}

function renderHtml(link: string): string {
  return `
    <div style="font-family: -apple-system, system-ui, sans-serif; max-width: 480px; margin: 0 auto; padding: 24px;">
      <p style="font-size: 11px; letter-spacing: 0.1em; text-transform: uppercase; color: #71717a; margin: 0;">MARINA</p>
      <h1 style="font-size: 22px; margin: 8px 0 16px;">Sign in to MARINA</h1>
      <p style="color: #3f3f46; line-height: 1.6;">
        Click the button below to sign in. This link is valid for ${MAGIC_TTL_MINUTES} minutes and can only be used once.
      </p>
      <p style="margin: 28px 0;">
        <a href="${link}" style="display: inline-block; background: #6366f1; color: white; padding: 12px 20px; border-radius: 10px; text-decoration: none; font-weight: 500;">Sign me in →</a>
      </p>
      <p style="color: #71717a; font-size: 12px;">Or paste this in your browser:<br/>${link}</p>
      <p style="margin-top: 32px; color: #a1a1aa; font-size: 11px;">
        If you didn't request this, you can safely ignore it.
      </p>
    </div>
  `
}

function renderText(link: string): string {
  return [
    'Sign in to MARINA',
    '',
    `Open this link within ${MAGIC_TTL_MINUTES} minutes:`,
    link,
    '',
    "If you didn't request this, ignore this email.",
  ].join('\n')
}
