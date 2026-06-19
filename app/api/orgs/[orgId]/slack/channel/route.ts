import { NextResponse } from 'next/server'
import { eq } from 'drizzle-orm'
import { db, schema } from '@/lib/db/client'
import { HttpError, requireCapability } from '@/lib/auth/guards'
import { getSlackInstall, listChannels } from '@/lib/slack/client'

export const runtime = 'nodejs'

/**
 * Read + set the org's Slack default channel (where the brief, standups,
 * celebrations and digest post). manage_integrations only. This was the missing
 * piece — the channel could previously only be captured during OAuth install.
 */
export async function GET(req: Request, ctx: { params: Promise<{ orgId: string }> }) {
  const orgId = Number((await ctx.params).orgId)
  if (!Number.isInteger(orgId)) return NextResponse.json({ error: 'invalid orgId' }, { status: 400 })
  try {
    await requireCapability(orgId, 'manage_integrations')
    const install = await getSlackInstall(orgId)
    if (!install) return NextResponse.json({ error: 'Slack is not connected' }, { status: 400 })
    const res = await listChannels(install)
    if (!res.ok) return NextResponse.json({ error: res.error }, { status: 502 })
    return NextResponse.json({ channels: res.channels, current: install.defaultChannelId })
  } catch (e) {
    if (e instanceof HttpError) return NextResponse.json({ error: e.message }, { status: e.status })
    throw e
  }
}

export async function POST(req: Request, ctx: { params: Promise<{ orgId: string }> }) {
  const orgId = Number((await ctx.params).orgId)
  if (!Number.isInteger(orgId)) return NextResponse.json({ error: 'invalid orgId' }, { status: 400 })
  try {
    await requireCapability(orgId, 'manage_integrations')
    const install = await getSlackInstall(orgId)
    if (!install) return NextResponse.json({ error: 'Slack is not connected' }, { status: 400 })
    const body = (await req.json().catch(() => ({}))) as { channelId?: string }
    const channelId = typeof body.channelId === 'string' ? body.channelId.trim() : ''
    if (!channelId) return NextResponse.json({ error: 'channelId required' }, { status: 400 })
    await db.update(schema.orgs).set({ slackDefaultChannelId: channelId }).where(eq(schema.orgs.id, orgId))
    return NextResponse.json({ ok: true, channelId })
  } catch (e) {
    if (e instanceof HttpError) return NextResponse.json({ error: e.message }, { status: e.status })
    throw e
  }
}
