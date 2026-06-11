import { createHmac, timingSafeEqual } from 'crypto'

/**
 * Razorpay subscription helpers. We use the Subscriptions API (not Orders)
 * because customers pay monthly with autopay.
 *
 * Three plan IDs need to be set up in the Razorpay dashboard ahead of time
 * and put in env vars: RAZORPAY_PLAN_FREE / TEAM / SCALE. We default to
 * skipping the API call when no key is configured, so dev works without
 * touching real money.
 */

export type RazorpayPlanKey = 'team' | 'scale'

export function razorpayConfig() {
  const keyId = process.env.RAZORPAY_KEY_ID
  const keySecret = process.env.RAZORPAY_KEY_SECRET
  const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET
  if (!keyId || !keySecret) {
    throw new Error('Razorpay not configured — set RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET.')
  }
  return { keyId, keySecret, webhookSecret }
}

export function planIdFor(plan: RazorpayPlanKey): string | null {
  if (plan === 'team') return process.env.RAZORPAY_PLAN_TEAM ?? null
  if (plan === 'scale') return process.env.RAZORPAY_PLAN_SCALE ?? null
  return null
}

/** Verify a Razorpay webhook signature. */
export function verifyWebhook(
  rawBody: string,
  signature: string | null,
): { ok: true } | { ok: false; reason: string } {
  if (!signature) return { ok: false, reason: 'missing signature header' }
  const secret = process.env.RAZORPAY_WEBHOOK_SECRET
  if (!secret) return { ok: false, reason: 'webhook secret not configured' }
  const computed = createHmac('sha256', secret).update(rawBody).digest('hex')
  try {
    const sigBuf = Buffer.from(signature)
    const compBuf = Buffer.from(computed)
    if (sigBuf.length !== compBuf.length) return { ok: false, reason: 'length mismatch' }
    if (!timingSafeEqual(sigBuf, compBuf)) return { ok: false, reason: 'signature mismatch' }
    return { ok: true }
  } catch {
    return { ok: false, reason: 'verify threw' }
  }
}

/** Create a subscription via Razorpay REST API. */
export async function createSubscription(input: {
  planId: string
  customerNotify: number
  totalCount: number  // 12 = monthly for a year
  notes?: Record<string, string>
}): Promise<{ id: string; status: string; short_url?: string } | { error: string }> {
  let cfg
  try { cfg = razorpayConfig() } catch (e) { return { error: (e as Error).message } }

  const auth = Buffer.from(`${cfg.keyId}:${cfg.keySecret}`).toString('base64')
  const res = await fetch('https://api.razorpay.com/v1/subscriptions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Basic ${auth}`,
    },
    body: JSON.stringify({
      plan_id: input.planId,
      customer_notify: input.customerNotify,
      total_count: input.totalCount,
      notes: input.notes ?? {},
    }),
  })
  const body = (await res.json().catch(() => null)) as
    | { id?: string; status?: string; short_url?: string; error?: { description?: string } }
    | null
  if (!res.ok) return { error: body?.error?.description ?? `${res.status}` }
  if (!body?.id || !body?.status) return { error: 'malformed response' }
  return { id: body.id, status: body.status, short_url: body.short_url }
}
