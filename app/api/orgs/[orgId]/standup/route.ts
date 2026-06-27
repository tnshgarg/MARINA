import { NextResponse } from 'next/server'
import { and, eq, inArray, isNull } from 'drizzle-orm'
import { db, schema } from '@/lib/db/client'
import { HttpError, requireMembership } from '@/lib/auth/guards'
import { saveStandup, standupBlocks } from '@/lib/standups/save'
import { getSlackInstall, sendSlackChannel } from '@/lib/slack/client'

export const runtime = 'nodejs'

/**
 * File today's standup from the web (parity with the Slack modal). Any active
 * member files their own. Persists the row and, like Slack, posts it to the
 * scrum channel (best-effort).
 */
export async function POST(req: Request, ctx: { params: Promise<{ orgId: string }> }) {
  const orgId = Number((await ctx.params).orgId)
  if (!Number.isInteger(orgId)) return NextResponse.json({ error: 'invalid orgId' }, { status: 400 })
  try {
    const { session } = await requireMembership(orgId, 'member')
    const body = (await req.json().catch(() => ({}))) as { yesterday?: string; today?: string; blockers?: string; mentions?: number[] }
    const yesterday = (body.yesterday ?? '').trim()
    const today = (body.today ?? '').trim()
    const blockers = (body.blockers ?? '').trim()
    if (!today) return NextResponse.json({ error: "Add what you're working on today." }, { status: 400 })

    // Keep only mentions that are real active teammates in this org.
    let mentions: number[] = []
    if (Array.isArray(body.mentions) && body.mentions.length > 0) {
      const ids = body.mentions.filter((n) => Number.isInteger(n))
      if (ids.length > 0) {
        const valid = await db
          .select({ userId: schema.memberships.userId })
          .from(schema.memberships)
          .where(and(eq(schema.memberships.orgId, orgId), isNull(schema.memberships.endedAt), inArray(schema.memberships.userId, ids)))
        mentions = valid.map((v) => v.userId)
      }
    }

    await saveStandup({ orgId, userId: session.appUserId, yesterday, today, blockers, source: 'web', mentions })

    // Parity with Slack: post to the scrum channel (best-effort).
    try {
      const install = await getSlackInstall(orgId)
      const target = install?.scrumChannelId ?? install?.defaultChannelId ?? null
      if (install && target) {
        const me = await db.query.users.findFirst({ where: eq(schema.users.id, session.appUserId) })
        const name = me?.name ?? (me ? `@${me.login}` : 'A teammate')
        await sendSlackChannel(install, {
          text: `${name}'s standup`,
          blocks: standupBlocks(name, { yesterday, today, blockers }),
          channel: target,
        })
      }
    } catch {
      /* best-effort — standup is saved regardless */
    }

    return NextResponse.json({ ok: true })
  } catch (e) {
    if (e instanceof HttpError) return NextResponse.json({ error: e.message }, { status: e.status })
    throw e
  }
}
