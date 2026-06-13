import { NextResponse } from 'next/server'
import { eq } from 'drizzle-orm'
import { db, schema } from '@/lib/db/client'
import { HttpError, requireMembership } from '@/lib/auth/guards'
import { audit, requestMeta } from '@/lib/audit/log'
import { createSubscription, planIdFor, type RazorpayPlanKey } from '@/lib/billing/razorpay'

export const runtime = 'nodejs'

/**
 * Start a subscription for the org. Owner-only. Body: { plan: 'team' | 'scale' }.
 * Returns the Razorpay short_url for the customer to complete payment.
 *
 * The webhook (lib/billing/razorpay) flips orgs.plan + billingSubscriptionId
 * when the first invoice is paid. We don't flip the plan here — until
 * payment lands the org stays on Free.
 */
export async function POST(req: Request, ctx: { params: Promise<{ orgId: string }> }) {
  const { orgId: raw } = await ctx.params
  const orgId = Number(raw)
  if (!Number.isInteger(orgId)) {
    return NextResponse.json({ error: 'invalid orgId' }, { status: 400 })
  }

  try {
    const { session } = await requireMembership(orgId, 'admin')
    const body = (await req.json().catch(() => ({}))) as { plan?: RazorpayPlanKey }
    const plan = body.plan
    if (plan !== 'team' && plan !== 'scale') {
      return NextResponse.json({ error: 'plan must be team or scale' }, { status: 400 })
    }
    const planId = planIdFor(plan)
    if (!planId) {
      return NextResponse.json(
        { error: 'Razorpay plan id not configured for this tier' },
        { status: 503 },
      )
    }

    const org = await db.query.orgs.findFirst({ where: eq(schema.orgs.id, orgId) })
    if (!org) return NextResponse.json({ error: 'org not found' }, { status: 404 })

    const sub = await createSubscription({
      planId,
      customerNotify: 1,
      totalCount: 12,
      notes: {
        orgId: String(orgId),
        orgName: org.name,
      },
    })
    if ('error' in sub) {
      return NextResponse.json({ error: sub.error }, { status: 502 })
    }

    // Store the subscription id immediately so the webhook can find it.
    await db
      .update(schema.orgs)
      .set({
        billingProvider: 'razorpay',
        billingSubscriptionId: sub.id,
      })
      .where(eq(schema.orgs.id, orgId))

    audit({
      action: 'org.settings_changed',
      orgId,
      actorUserId: session.appUserId,
      targetType: 'org',
      targetId: orgId,
      payload: { event: 'subscription_created', plan, subId: sub.id },
      ...requestMeta(req),
    })

    return NextResponse.json({
      ok: true,
      subscriptionId: sub.id,
      status: sub.status,
      paymentUrl: sub.short_url,
    })
  } catch (err) {
    if (err instanceof HttpError) {
      return NextResponse.json({ error: err.message }, { status: err.status })
    }
    console.error('billing/subscribe failed', err)
    return NextResponse.json({ error: 'internal' }, { status: 500 })
  }
}
