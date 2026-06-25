import { NextResponse } from 'next/server'
import { db, schema } from '@/lib/db/client'
import { generateMagicToken, isValidEmail, MAGIC_TTL_MINUTES } from '@/lib/auth/magic'
import { checkRateLimit } from '@/lib/auth/rate-limit'

export const runtime = 'nodejs'

/** Start the magic-link flow. Sends an email with a one-click sign-in link. */
export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { email?: string; redirectTo?: string; flow?: string }
  const email = (body.email ?? '').trim().toLowerCase()
  if (!email || !isValidEmail(email)) {
    return NextResponse.json({ error: 'Enter a valid email address.' }, { status: 400 })
  }

  // 5 magic links per email per 15 min. Blocks spam + brute attempts.
  const limited = await checkRateLimit(`magic_link:${email}`, 5, 15 * 60_000)
  if (!limited.allowed) {
    const retryS = Math.max(1, Math.round((limited.resetAtMs - Date.now()) / 1000))
    return NextResponse.json(
      { error: `Too many sign-in attempts. Try again in ${Math.ceil(retryS / 60)} minutes.` },
      { status: 429, headers: { 'Retry-After': String(retryS) } },
    )
  }
  // Open-redirect guard: must be a same-site absolute path. Reject `//evil.com`
  // and `/\evil.com` (protocol-relative / backslash tricks browsers normalize).
  const rt = typeof body.redirectTo === 'string' ? body.redirectTo : ''
  const redirectTo =
    rt.startsWith('/') && !rt.startsWith('//') && !rt.startsWith('/\\') ? rt : '/'

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

  // Send via Resend (if configured) — and detect the test-domain silent-drop.
  const apiKey = process.env.RESEND_API_KEY
  const from = process.env.RESEND_FROM || 'MARINA <onboarding@resend.dev>'
  const usingResendTestDomain = /onboarding@resend\.dev|@resend\.dev>/i.test(from)
  let emailDispatched = false
  let providerError: string | null = null
  let resendId: string | null = null

  // Resend's test sender domain `onboarding@resend.dev` SILENTLY DROPS mail
  // sent to anyone other than the verified account owner. We can't detect this
  // from the API response — Resend returns 200. So when the test domain is in
  // use, we deliberately ALSO return the sign-in link in the JSON so users can
  // proceed even when no email arrives.
  const ALWAYS_RETURN_LINK_REASONS: string[] = []
  if (!apiKey) {
    ALWAYS_RETURN_LINK_REASONS.push('No RESEND_API_KEY is configured.')
  } else if (usingResendTestDomain) {
    ALWAYS_RETURN_LINK_REASONS.push(
      'Using Resend test domain (onboarding@resend.dev) — mail to non-owner addresses is silently dropped. Set RESEND_FROM and verify your domain at resend.com/domains.'
    )
  }

  if (apiKey) {
    try {
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          from,
          to: email,
          subject: 'Your MARINA sign-in link',
          html: renderHtml(link),
          text: renderText(link),
        }),
      })
      emailDispatched = res.ok
      if (res.ok) {
        const data = (await res.json().catch(() => null)) as { id?: string } | null
        resendId = data?.id ?? null
      } else {
        const txt = await res.text().catch(() => '')
        console.error('[magic] resend failed', res.status, txt)
        providerError = `${res.status}: ${txt.slice(0, 200)}`
      }
    } catch (err) {
      console.error('[magic] resend threw', err)
      providerError = err instanceof Error ? err.message : String(err)
    }
  }

  // Always log the link in dev (NODE_ENV !== 'production').
  if (process.env.NODE_ENV !== 'production') {
    console.log(`\n[magic] sign-in link for ${email}:\n${link}\n`)
  }

  // SECURITY: the sign-in link is a bearer credential. NEVER return it in the
  // HTTP response in production — doing so let anyone POST a victim's email and
  // receive a one-click login for that account. The link is only ever returned
  // in non-production (local dev / preview) to ease testing. In production, if
  // email delivery isn't configured the user must fix RESEND_* — we surface the
  // reason in `notes` but withhold the link itself.
  const isProd = process.env.NODE_ENV === 'production'
  const showLink = !isProd

  const res = NextResponse.json({
    ok: true,
    dispatched: emailDispatched,
    resendId,
    providerError: isProd ? null : providerError,
    notes: ALWAYS_RETURN_LINK_REASONS,
    devLink: showLink ? link : undefined,
  })

  // Persist the flow choice across the magic-link round-trip so the post-auth
  // landing routes correctly: 'solo' (employee) → /dashboard, 'org' (manager)
  // → /onboarding. Cleared for org so a stale solo marker can't misroute.
  if (body.flow === 'solo') {
    res.cookies.set('marina_flow', 'solo', { maxAge: 60 * 60 * 24 * 365, httpOnly: true, sameSite: 'lax', path: '/' })
  } else if (body.flow === 'org') {
    res.cookies.delete('marina_flow')
  }
  return res
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
