import { NextResponse } from 'next/server'
import { eq } from 'drizzle-orm'
import { db, schema } from '@/lib/db/client'
import { HttpError, requireCapability } from '@/lib/auth/guards'
import { audit, requestMeta } from '@/lib/audit/log'
import { holidaysForRegion, INDIA_REGIONS } from '@/lib/holidays/india'

export const runtime = 'nodejs'

export async function PATCH(req: Request, ctx: { params: Promise<{ orgId: string }> }) {
  const { orgId: raw } = await ctx.params
  const orgId = Number(raw)
  if (!Number.isInteger(orgId)) {
    return NextResponse.json({ error: 'invalid orgId' }, { status: 400 })
  }

  try {
    const body = (await req.json().catch(() => ({}))) as {
      name?: string
      slackWebhookUrl?: string | null
      holidayRegion?: string
      avatarMode?: 'hero' | 'photo'
      workdayStartHour?: number
      workdayEndHour?: number
      trackedGithubOrgs?: string[]
      leavePolicy?: Record<string, number> | null
      costPerHourInr?: number | null
      agentEnabled?: boolean
    }
    // Pick the right capability: integration-touching fields need
    // manage_integrations; everything else (name, region, hours, etc.)
    // needs manage_workspace. Owners always pass either check.
    const touchesIntegrations =
      body.slackWebhookUrl !== undefined || body.trackedGithubOrgs !== undefined
    const { session } = touchesIntegrations
      ? await requireCapability(orgId, 'manage_integrations')
      : await requireCapability(orgId, 'manage_workspace')

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
      // Validate against the known region set — an arbitrary string would wipe
      // the holidays table and reseed it with nothing (holidaysForRegion only
      // matches known regions).
      const validRegion = INDIA_REGIONS.some((r) => r.key === body.holidayRegion)
      if (!validRegion) {
        return NextResponse.json({ error: 'invalid holidayRegion' }, { status: 400 })
      }
      patch.holidayRegion = body.holidayRegion
    }
    if (body.avatarMode === 'hero' || body.avatarMode === 'photo') {
      patch.avatarMode = body.avatarMode
    }
    if (typeof body.agentEnabled === 'boolean') {
      patch.agentEnabled = body.agentEnabled
    }
    if (body.costPerHourInr !== undefined) {
      if (body.costPerHourInr === null) {
        patch.costPerHourInr = null
      } else if (typeof body.costPerHourInr === 'number' && body.costPerHourInr >= 0 && body.costPerHourInr <= 1_000_000) {
        patch.costPerHourInr = Math.floor(body.costPerHourInr)
      } else {
        return NextResponse.json({ error: 'invalid costPerHourInr' }, { status: 400 })
      }
    }
    if (body.leavePolicy !== undefined) {
      if (body.leavePolicy === null) {
        patch.leavePolicy = null
      } else if (typeof body.leavePolicy === 'object' && !Array.isArray(body.leavePolicy)) {
        const allowedTypes = new Set([
          'sick', 'casual', 'earned', 'maternity', 'paternity', 'bereavement', 'compoff', 'unpaid', 'other',
        ])
        const cleaned: Record<string, number> = {}
        for (const [k, v] of Object.entries(body.leavePolicy)) {
          if (!allowedTypes.has(k)) continue
          const n = Number(v)
          if (Number.isInteger(n) && n >= 0 && n <= 365) cleaned[k] = n
        }
        patch.leavePolicy = cleaned
      } else {
        return NextResponse.json({ error: 'invalid leavePolicy' }, { status: 400 })
      }
    }
    if (typeof body.workdayStartHour === 'number' && body.workdayStartHour >= 0 && body.workdayStartHour <= 23) {
      patch.workdayStartHour = Math.floor(body.workdayStartHour)
    }
    if (typeof body.workdayEndHour === 'number' && body.workdayEndHour >= 0 && body.workdayEndHour <= 23) {
      patch.workdayEndHour = Math.floor(body.workdayEndHour)
    }
    if (Array.isArray(body.trackedGithubOrgs)) {
      // Normalize: lower-case, trim, dedupe, allowed chars only, cap at 20.
      const cleaned: string[] = []
      const seen = new Set<string>()
      for (const raw of body.trackedGithubOrgs) {
        if (typeof raw !== 'string') continue
        const o = raw.trim().toLowerCase()
        if (!o) continue
        if (!/^[a-z0-9][a-z0-9-]{0,38}$/.test(o)) continue
        if (seen.has(o)) continue
        seen.add(o)
        cleaned.push(o)
        if (cleaned.length >= 20) break
      }
      patch.trackedGithubOrgs = cleaned
    }

    // If both workday hours are being set (or one is set against an existing
    // value), the start must be before the end or attendance math goes haywire.
    if (patch.workdayStartHour !== undefined && patch.workdayEndHour !== undefined) {
      if (Number(patch.workdayStartHour) >= Number(patch.workdayEndHour)) {
        return NextResponse.json({ error: 'workdayStartHour must be before workdayEndHour' }, { status: 400 })
      }
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
