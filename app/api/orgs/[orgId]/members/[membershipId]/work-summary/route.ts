import { NextResponse } from 'next/server'
import { and, eq, isNull } from 'drizzle-orm'
import { db, schema } from '@/lib/db/client'
import { HttpError, ensureScopeMembership, requireScope } from '@/lib/auth/guards'
import { buildMemberWork, workContextForLlm } from '@/lib/people/work'
import { generateWithFallback } from '@/lib/ai/registry'
import type { ChatMessage } from '@/lib/ai/provider'

export const runtime = 'nodejs'
export const maxDuration = 30

const SYSTEM = `You are MARINA, briefing a manager on ONE teammate's recent engineering work.
Write 2-3 plain sentences a busy manager can read at a glance. Ground every claim ONLY in the
provided data — never invent PRs, people, or numbers. Cover: what they're working on (themes /
notable PRs), their review activity (reviewing others vs. waiting on review), and whether they
look blocked or are progressing. Name specific PRs or people when it adds signal. No praise
inflation, no preamble, no bullet points — just the summary.`

/** On-demand AI narrative over the structured work data. Manager-only. */
export async function GET(
  _req: Request,
  ctx: { params: Promise<{ orgId: string; membershipId: string }> },
) {
  const { orgId: rawO, membershipId: rawM } = await ctx.params
  const orgId = Number(rawO)
  const membershipId = Number(rawM)
  if (!Number.isInteger(orgId) || !Number.isInteger(membershipId)) {
    return NextResponse.json({ error: 'invalid ids' }, { status: 400 })
  }

  try {
    const { scope } = await requireScope(orgId, 'manager')
    const membership = await db.query.memberships.findFirst({
      where: and(
        eq(schema.memberships.id, membershipId),
        eq(schema.memberships.orgId, orgId),
        isNull(schema.memberships.endedAt),
      ),
    })
    if (!membership) return NextResponse.json({ error: 'member not found' }, { status: 404 })
    ensureScopeMembership(scope, membershipId)

    const user = await db.query.users.findFirst({ where: eq(schema.users.id, membership.userId) })
    if (!user) return NextResponse.json({ error: 'user not found' }, { status: 404 })

    const work = await buildMemberWork(orgId, user.id, 14)
    const name = user.name ?? `@${user.login}`

    // Nothing to narrate — don't burn a model call on an empty fortnight.
    const hasSignal =
      work.prs.length > 0 || work.reviewsGiven.length > 0 || work.reviewsReceived.length > 0 || work.commitCount > 0
    if (!hasSignal) {
      return NextResponse.json({
        summary: work.hasGithub
          ? `No GitHub activity for ${name} in the last ${work.windowDays} days — they may be doing non-code work (design, planning, mentoring), or their commits aren't landing in tracked repos.`
          : `${name} hasn't linked GitHub, so their code work is invisible to MARINA.`,
        provider: 'none',
        model: 'none',
        generated: false,
      })
    }

    const messages: ChatMessage[] = [
      { role: 'system', content: SYSTEM },
      { role: 'user', content: workContextForLlm(name, work) },
    ]
    const { text, provider, model } = await generateWithFallback(messages, { temperature: 0.3, maxTokens: 320 })

    return NextResponse.json({ summary: text.trim(), provider, model, generated: true })
  } catch (err) {
    if (err instanceof HttpError) {
      return NextResponse.json({ error: err.message }, { status: err.status })
    }
    console.error('work-summary failed', err)
    return NextResponse.json({ error: err instanceof Error ? err.message : 'internal' }, { status: 500 })
  }
}
