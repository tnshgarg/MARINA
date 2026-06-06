import { NextResponse } from 'next/server'
import { eq } from 'drizzle-orm'
import { db, schema } from '@/lib/db/client'
import { authenticateAgent } from '@/lib/agent/auth'

export const runtime = 'nodejs'

export async function POST(req: Request) {
  const agent = await authenticateAgent(req)
  if (!agent) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  let body: { agentVersion?: string } = {}
  try {
    body = (await req.json().catch(() => ({}))) ?? {}
  } catch {
    body = {}
  }
  if (body.agentVersion && body.agentVersion !== agent.token.agentVersion) {
    void db
      .update(schema.agentTokens)
      .set({ agentVersion: String(body.agentVersion).slice(0, 32) })
      .where(eq(schema.agentTokens.id, agent.token.id))
      .catch((err) => console.error('agentVersion update failed', err))
  }

  const settings = await db.query.userSettings.findFirst({
    where: eq(schema.userSettings.userId, agent.user.id),
  })

  return NextResponse.json({
    ok: true,
    pausedAt: settings?.trackingPausedAt?.toISOString() ?? null,
    windowTitlesEnabled: !!settings?.windowTitlesEnabled,
    sampleIntervalSeconds: settings?.sampleIntervalSeconds ?? 30,
    flushIntervalSeconds: settings?.flushIntervalSeconds ?? 300,
    policyVersion: process.env.MARINA_POLICY_VERSION ?? 'v1',
  })
}
