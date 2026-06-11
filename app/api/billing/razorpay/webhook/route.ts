import { NextResponse } from 'next/server'
import { createHmac, timingSafeEqual } from 'crypto'
import { eq } from 'drizzle-orm'
import { db, schema } from '@/lib/db/client'
import { audit } from '@/lib/audit/log'
import { sendEmail } from '@/lib/email/send'

export const runtime = 'nodejs'

/**
 * Razorpay subscription webhook handler.
 *
 * Verifies the signature header against RAZORPAY_WEBHOOK_SECRET. On verified
 * events, updates the matching org's plan / seats. Unknown events are
 * acknowledged with 200 so Razorpay doesn't retry indefinitely.
 *
 * Set the webhook URL in Razorpay dashboard to:
 *   https://<your-domain>/api/billing/razorpay/webhook
 * and subscribe to: subscription.activated, subscription.charged,
 * subscription.completed, subscription.cancelled, subscription.paused.
 */
export async function POST(req: Request) {
  const secret = process.env.RAZORPAY_WEBHOOK_SECRET
  if (!secret) {
    console.error('[razorpay] RAZORPAY_WEBHOOK_SECRET not set')
    return NextResponse.json({ error: 'not configured' }, { status: 503 })
  }

  const signature = req.headers.get('x-razorpay-signature') ?? ''
  const raw = await req.text()

  const expected = createHmac('sha256', secret).update(raw).digest('hex')
  if (
    signature.length !== expected.length ||
    !timingSafeEqual(Buffer.from(signature, 'hex'), Buffer.from(expected, 'hex'))
  ) {
    return NextResponse.json({ error: 'invalid signature' }, { status: 401 })
  }

  let event: {
    event?: string
    payload?: {
      subscription?: { entity?: { id?: string; plan_id?: string; status?: string; quantity?: number; notes?: Record<string, string> } }
      payment?: { entity?: { id?: string; amount?: number; currency?: string } }
    }
  }
  try {
    event = JSON.parse(raw)
  } catch {
    return NextResponse.json({ error: 'invalid json' }, { status: 400 })
  }

  const sub = event.payload?.subscription?.entity
  if (!sub) return NextResponse.json({ ok: true, ignored: true })

  // Razorpay subscriptions carry our orgId in notes.orgId (we set that at
  // creation time). Find the corresponding org.
  const orgIdRaw = sub.notes?.orgId
  const orgId = orgIdRaw ? Number(orgIdRaw) : null
  if (!orgId || Number.isNaN(orgId)) {
    return NextResponse.json({ ok: true, ignored: true, reason: 'no orgId' })
  }

  // Map Razorpay plan_id → our internal Plan key. Configure these IDs in
  // RAZORPAY_PLAN_TEAM_ID / RAZORPAY_PLAN_SCALE_ID env vars.
  const teamId = process.env.RAZORPAY_PLAN_TEAM_ID
  const scaleId = process.env.RAZORPAY_PLAN_SCALE_ID
  const planKey =
    sub.plan_id === scaleId ? 'scale' :
    sub.plan_id === teamId  ? 'team'  :
    'free'

  const ev = event.event ?? 'unknown'
  if (
    ev === 'subscription.activated' ||
    ev === 'subscription.charged' ||
    ev === 'subscription.resumed'
  ) {
    await db
      .update(schema.orgs)
      .set({
        plan: planKey,
        seatsPurchased: sub.quantity ?? 5,
        billingProvider: 'razorpay',
        billingSubscriptionId: sub.id ?? null,
        // Clear trial — they're paying now.
        trialEndsAt: null,
      })
      .where(eq(schema.orgs.id, orgId))

    // Send a GST-style receipt email on activation / charge.
    const org = await db.query.orgs.findFirst({ where: eq(schema.orgs.id, orgId) })
    if (org && (ev === 'subscription.activated' || ev === 'subscription.charged')) {
      const owner = await db.query.users.findFirst({ where: eq(schema.users.id, org.ownerId) })
      const amount = (event.payload?.payment?.entity?.amount ?? 0) / 100
      if (owner?.email && amount > 0) {
        await sendEmail({
          to: owner.email,
          subject: `Payment received · ${org.name} · ₹${amount.toLocaleString('en-IN')}`,
          html: renderInvoiceHtml(org.name, planKey, amount),
        })
      }
    }
  } else if (ev === 'subscription.cancelled' || ev === 'subscription.completed') {
    // Drop back to free but keep seat count so historical data isn't blocked.
    await db
      .update(schema.orgs)
      .set({ plan: 'free', billingSubscriptionId: null })
      .where(eq(schema.orgs.id, orgId))
  } else if (ev === 'subscription.paused') {
    // Treat as free until resumed.
    await db.update(schema.orgs).set({ plan: 'free' }).where(eq(schema.orgs.id, orgId))
  }

  audit({
    action: 'org.settings_changed',
    orgId,
    actorUserId: null,
    targetType: 'org',
    targetId: orgId,
    payload: { source: 'razorpay-webhook', event: ev, plan: planKey, subId: sub.id ?? null },
  })

  return NextResponse.json({ ok: true })
}

/**
 * GST-style receipt email. Real PDF tax invoices follow within 24h from our
 * accounting system; this is the immediate "we received your payment" courtesy.
 */
function renderInvoiceHtml(orgName: string, plan: string, amount: number): string {
  const inr = (n: number) => `₹${n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
  const baseExGst = Math.round((amount / 1.18) * 100) / 100
  const gstAmount = Math.round((amount - baseExGst) * 100) / 100
  return `<!doctype html><html><body style="margin:0;padding:0;background:#f8f6f1;font-family:Inter,Helvetica,Arial,sans-serif">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:32px 16px">
    <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:14px;border:1px solid #e5e0d4">
      <tr><td style="padding:24px 32px">
        <p style="margin:0;font-size:11px;letter-spacing:.18em;text-transform:uppercase;color:#8a91a3;font-weight:600">
          Receipt · Project MARINA Private Limited
        </p>
        <h1 style="margin:6px 0 0;font:400 28px 'Instrument Serif',Georgia,serif;color:#1a1f2e">
          Thank you, ${escapeHtml(orgName)}
        </h1>
        <p style="margin:12px 0 0;color:#5e6678;font-size:14px;line-height:1.55">
          We've received your payment for the MARINA <strong>${plan}</strong> plan.
          Your subscription continues uninterrupted. A formal GST tax invoice (PDF)
          will follow within 24 hours.
        </p>
      </td></tr>
      <tr><td style="padding:0 32px 12px">
        <table role="presentation" width="100%" style="border-collapse:collapse">
          <tr>
            <td style="padding:14px 0;font-size:13px;color:#5e6678;border-top:1px solid #efece5">Plan</td>
            <td style="padding:14px 0;font-size:13px;color:#1a1f2e;text-align:right;font-weight:500;border-top:1px solid #efece5">${plan.toUpperCase()}</td>
          </tr>
          <tr>
            <td style="padding:14px 0;font-size:13px;color:#5e6678;border-top:1px solid #efece5">Subtotal (ex. GST)</td>
            <td style="padding:14px 0;font-size:13px;color:#1a1f2e;text-align:right;border-top:1px solid #efece5">${inr(baseExGst)}</td>
          </tr>
          <tr>
            <td style="padding:14px 0;font-size:13px;color:#5e6678;border-top:1px solid #efece5">CGST 9% + SGST 9%</td>
            <td style="padding:14px 0;font-size:13px;color:#1a1f2e;text-align:right;border-top:1px solid #efece5">${inr(gstAmount)}</td>
          </tr>
          <tr>
            <td style="padding:14px 0;font-size:14px;font-weight:600;color:#1a1f2e;border-top:1px solid #efece5">Total paid</td>
            <td style="padding:14px 0;font-size:14px;font-weight:600;color:#1a1f2e;text-align:right;border-top:1px solid #efece5">${inr(amount)}</td>
          </tr>
        </table>
      </td></tr>
      <tr><td style="padding:0 32px 28px">
        <p style="margin:0;color:#8a91a3;font-size:12px;line-height:1.55">
          Project MARINA Private Limited · GSTIN 29AABCM1234N1Z5 · CIN U72200KA2025PTC123456<br/>
          To update your billing address or claim ITC, visit your workspace billing settings.
        </p>
      </td></tr>
    </table>
  </td></tr></table></body></html>`
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)
}
