import { NextResponse } from 'next/server'
import { eq } from 'drizzle-orm'
import { db, schema } from '@/lib/db/client'
import { HttpError, requireMembership } from '@/lib/auth/guards'
import { audit, requestMeta } from '@/lib/audit/log'
import { holidaysForRegion } from '@/lib/holidays/india'

export const runtime = 'nodejs'

export async function PATCH(req: Request, ctx: { params: Promise<{ orgId: string }> }) {
  const { orgId: raw } = await ctx.params
  const orgId = Number(raw)
  if (!Number.isInteger(orgId)) {
    return NextResponse.json({ error: 'invalid orgId' }, { status: 400 })
  }

  try {
    const { session } = await requireMembership(orgId, 'owner')
    const body = (await req.json().catch(() => ({}))) as {
      name?: string
      slackWebhookUrl?: string | null
      holidayRegion?: string
      avatarMode?: 'hero' | 'photo'
      workdayStartHour?: number
      workdayEndHour?: number
    }

    const patch: Partial<typeof schema.orgs.$inferInsert> = {}
    if (typeof body.name === 'string' && body.name.trim().length > 0) {
      patch.name = body.name.trim().slice(0, 200)
    }
    if (body.slackWebhookUrl === null) {
      patch.slackWebhookUrl = null
    } else if (typeof body.slackWebhookUrl === 'string') {
      const u = body.slackWebhookUrl.trim()
      if (u.length > 0 && !/^https:\/\/hooks\.slack\.com\//.test(u)) {
        return NextResponse.json({ error: 'Slack webhook must start with https://hooks.slack.com/' }, { status: 400 })
      }
      patch.slackWebhookUrl = u.length === 0 ? null : u
    }
    if (typeof body.holidayRegion === 'string') {
      patch.holidayRegion = body.holidayRegion
    }
    if (body.avatarMode === 'hero' || body.avatarMode === 'photo') {
      patch.avatarMode = body.avatarMode
    }
    if (typeof body.workdayStartHour === 'number' && body.workdayStartHour >= 0 && body.workdayStartHour <= 23) {
      patch.workdayStartHour = Math.floor(body.workdayStartHour)
    }
    if (typeof body.workdayEndHour === 'number' && body.workdayEndHour >= 0 && body.workdayEndHour <= 23) {
      patch.workdayEndHour = Math.floor(body.workdayEndHour)
    }

    if (Object.keys(patch).length === 0) {
      return NextResponse.json({ error: 'nothing to update' }, { status: 400 })
    }

    const [updated] = await db.update(schema.orgs).set(patch).where(eq(schema.orgs.id, orgId)).returning()

    // If holiday region changed, re-seed the holidays table for this org.
    if (patch.holidayRegion) {
      const desired = holidaysForRegion(patch.holidayRegion)
      // Wipe + re-insert. Idempotent.
      await db.delete(schema.holidays).where(eq(schema.holidays.orgId, orgId))
      if (desired.length > 0) {
        await db.insert(schema.holidays).values(
          desired.map((h) => ({
            orgId,
            region: h.region,
            date: h.date,
            name: h.name,
            isOptional: false,
          }))
        )
      }
    }

    void audit({
      action: 'org.settings_changed',
      orgId,
      actorUserId: session.appUserId,
      targetType: 'org',
      targetId: orgId,
      payload: patch,
      ...requestMeta(req),
    })

    return NextResponse.json({ ok: true, org: { ...updated, slackWebhookUrl: updated.slackWebhookUrl ? '***' : null } })
  } catch (err) {
    if (err instanceof HttpError) {
      return NextResponse.json({ error: err.message }, { status: err.status })
    }
    console.error('org settings update failed', err)
    return NextResponse.json({ error: 'internal' }, { status: 500 })
  }
}
