import { NextResponse } from 'next/server'
import { HttpError, requireCapability } from '@/lib/auth/guards'
import { audit, requestMeta } from '@/lib/audit/log'
import { redeemEarlyBird, REDEEM_FAILURE_COPY } from '@/lib/billing/early-bird'

export const runtime = 'nodejs'

/**
 * Redeem an early-bird promo code for the org. Gated on `manage_billing`
 * (typically the owner). On success the org is flipped to the granted plan
 * immediately, without going through Razorpay.
 *
 * Returns a 200 with a result envelope rather than mapping every failure to
 * a different status code — the UI shows the failure message inline rather
 * than as an error toast, so a uniform envelope is simpler to consume.
 */
export async function POST(req: Request, ctx: { params: Promise<{ orgId: string }> }) {
  const { orgId: raw } = await ctx.params
  const orgId = Number(raw)
  if (!Number.isInteger(orgId)) {
    return NextResponse.json({ error: 'invalid orgId' }, { status: 400 })
  }

  try {
    const { session } = await requireCapability(orgId, 'manage_billing')
    const body = (await req.json().catch(() => ({}))) as { code?: string }
    const code = (body.code ?? '').trim()
    if (!code) {
      return NextResponse.json({ ok: false, message: 'Enter a code to continue.' })
    }
    if (code.length > 64) {
      return NextResponse.json({ ok: false, message: 'That code is too long to be valid.' })
    }

    const result = await redeemEarlyBird({
      orgId,
      userId: session.appUserId,
      code,
    })

    if (!result.ok) {
      audit({
        action: 'org.settings_changed',
        orgId,
        actorUserId: session.appUserId,
        targetType: 'org',
        targetId: orgId,
        payload: { event: 'early_bird_redeem_failed', reason: result.reason },
        ...requestMeta(req),
      })
      return NextResponse.json({ ok: false, message: REDEEM_FAILURE_COPY[result.reason] })
    }

    audit({
      action: 'org.settings_changed',
      orgId,
      actorUserId: session.appUserId,
      targetType: 'org',
      targetId: orgId,
      payload: {
        event: 'early_bird_redeemed',
        plan: result.plan,
        lifetime: result.lifetime,
        expiresAt: result.expiresAt?.toISOString() ?? null,
      },
      ...requestMeta(req),
    })

    return NextResponse.json({
      ok: true,
      plan: result.plan,
      lifetime: result.lifetime,
      expiresAt: result.expiresAt?.toISOString() ?? null,
      message: result.lifetime
        ? `Workspace upgraded to ${result.plan} — free forever. Welcome to the founding crew.`
        : `Workspace upgraded to ${result.plan} until ${result.expiresAt!.toLocaleDateString('en-IN', {
            day: 'numeric',
            month: 'short',
            year: 'numeric',
          })}.`,
    })
  } catch (e) {
    if (e instanceof HttpError) {
      return NextResponse.json({ error: e.message }, { status: e.status })
    }
    console.error('[redeem-code] failed', e)
    return NextResponse.json({ error: 'internal' }, { status: 500 })
  }
}
