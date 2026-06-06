import { NextResponse } from 'next/server'
import { and, eq, gte } from 'drizzle-orm'
import { db, schema } from '@/lib/db/client'
import { HttpError, requireMembership } from '@/lib/auth/guards'
import { buildNarrativeMessages, parseNarrative } from '@/lib/ai/narrative-prompt'
import { generateWithFallback } from '@/lib/ai/registry'

export const runtime = 'nodejs'

export async function POST(
  req: Request,
  ctx: { params: Promise<{ orgId: string; membershipId: string }> }
) {
  const { orgId: orgIdRaw, membershipId: midRaw } = await ctx.params
  const orgId = Number(orgIdRaw)
  const membershipId = Number(midRaw)
  if (!Number.isInteger(orgId) || !Number.isInteger(membershipId)) {
    return NextResponse.json({ error: 'invalid ids' }, { status: 400 })
  }

  const url = new URL(req.url)
  const providerParam = url.searchParams.get('provider')
  const preferred = providerParam === 'groq' || providerParam === 'openai' ? providerParam : undefined

  try {
    await requireMembership(orgId, 'manager')

    const target = await db.query.memberships.findFirst({
      where: and(
        eq(schema.memberships.id, membershipId),
        eq(schema.memberships.orgId, orgId)
      ),
    })
    if (!target) return NextResponse.json({ error: 'membership not found' }, { status: 404 })

    const user = await db.query.users.findFirst({ where: eq(schema.users.id, target.userId) })
    if (!user) return NextResponse.json({ error: 'user missing' }, { status: 404 })

    const periodEnd = new Date()
    const periodStart = new Date(periodEnd.getTime() - 7 * 24 * 60 * 60 * 1000)

    const events = await db
      .select()
      .from(schema.githubEvents)
      .where(and(eq(schema.githubEvents.userId, user.id), gte(schema.githubEvents.occurredAt, periodStart)))

    const messages = buildNarrativeMessages({
      userLogin: user.login,
      periodStart,
      periodEnd,
      events,
    })

    const result = await generateWithFallback(
      messages,
      { responseFormat: 'json', temperature: 0.5 },
      preferred
    )
    const parsed = parseNarrative(result.text)

    const [saved] = await db
      .insert(schema.narratives)
      .values({
        userId: user.id,
        periodStart,
        periodEnd,
        body: parsed.body,
        signal: parsed.signal,
        blockers: parsed.blockers,
        provider: result.provider,
        model: result.model,
      })
      .returning()

    return NextResponse.json({ ok: true, narrative: saved })
  } catch (err) {
    if (err instanceof HttpError) {
      return NextResponse.json({ error: err.message }, { status: err.status })
    }
    console.error('member narrative failed', err)
    return NextResponse.json({ error: 'internal', message: String(err) }, { status: 500 })
  }
}
