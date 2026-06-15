import { NextResponse } from 'next/server'
import { HttpError, requireCapability } from '@/lib/auth/guards'
import { syncOrgViaApp } from '@/lib/github/app-sync'

export const runtime = 'nodejs'
export const maxDuration = 60

/** Manually pull activity from the org's GitHub App installation. */
export async function POST(req: Request, ctx: { params: Promise<{ orgId: string }> }) {
  const { orgId: raw } = await ctx.params
  const orgId = Number(raw)
  if (!Number.isInteger(orgId)) {
    return NextResponse.json({ error: 'invalid org id' }, { status: 400 })
  }
  try {
    await requireCapability(orgId, 'manage_integrations')
    const result = await syncOrgViaApp(orgId)
    return NextResponse.json({ ok: true, ...result })
  } catch (err) {
    if (err instanceof HttpError) {
      return NextResponse.json({ error: err.message }, { status: err.status })
    }
    console.error('[github-app sync] failed', err)
    return NextResponse.json({ error: err instanceof Error ? err.message : 'internal' }, { status: 500 })
  }
}
