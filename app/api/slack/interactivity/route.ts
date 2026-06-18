import { NextResponse } from 'next/server'
import { verifySlackRequest } from '@/lib/slack/verify'
import { handleInteractivity, type InteractionPayload } from '@/lib/slack/interactions'

export const runtime = 'nodejs'

/**
 * Slack Interactivity endpoint — block_actions (buttons), view_submission
 * (modal submits), and shortcuts. Slack POSTs `payload=<json>` form-encoded.
 * Signature-verified; responds within 3s (modal opens use the trigger_id).
 */
export async function POST(req: Request) {
  const raw = await req.text()
  const check = verifySlackRequest(req.headers, raw)
  if (!check.ok) return NextResponse.json({ error: check.reason }, { status: 401 })

  const params = new URLSearchParams(raw)
  const payloadRaw = params.get('payload')
  if (!payloadRaw) return NextResponse.json({ error: 'no payload' }, { status: 400 })

  try {
    const payload = JSON.parse(payloadRaw) as InteractionPayload
    return await handleInteractivity(payload)
  } catch {
    return NextResponse.json({ error: 'bad payload' }, { status: 400 })
  }
}
