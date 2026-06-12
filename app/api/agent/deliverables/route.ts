import { NextResponse } from 'next/server'
import { authenticateAgent } from '@/lib/agent/auth'
import { checkLimit, rateLimitHeaders } from '@/lib/agent/rate-limit'
import { createDeliverable } from '@/lib/deliverables/create'

export const runtime = 'nodejs'

/**
 * Desktop-agent endpoint for self-logging deliverables.
 *
 * This is the agent-side counterpart to `/api/me/deliverables`. Both use the
 * shared `createDeliverable()` helper so validation, dedupe and screenshot
 * pinning behave identically across surfaces.
 *
 * Why a separate endpoint? Auth is different:
 *   - Web      → session cookie (NextAuth)
 *   - Agent    → bearer token (`Authorization: Bearer <agent-token>`)
 *
 * Request:
 *   POST /api/agent/deliverables
 *   Authorization: Bearer <agent-token>
 *   Content-Type: application/json
 *
 *   {
 *     "title": "Shipped onboarding redesign v2",
 *     "url":   "https://figma.com/file/abc"       // optional
 *   }
 *
 * Success response:
 *   200 OK
 *   {
 *     "ok": true,
 *     "deliverable": {
 *       "id": 42,
 *       "title": "Shipped onboarding redesign v2",
 *       "url":  "https://figma.com/file/abc",
 *       "kind": null,
 *       "completedAt":   "2026-06-11T14:32:00.000Z",
 *       "pinnedShotAt":  "2026-06-11T14:32:00.000Z",
 *       "verificationStatus": "unverified"
 *     }
 *   }
 *
 * The agent uses `pinnedShotAt` to display "pinned for verification at HH:MM"
 * in its success toast, which is the human-readable signal that the screen
 * was captured at log time for honest cross-checking.
 *
 * Error responses:
 *   400 — title too short (<10 chars) or URL malformed
 *   401 — bad/missing agent token
 *   409 — duplicate within 4 hours, returns `duplicateOf: <id>`
 *   429 — rate-limited (agent should back off)
 */
export async function POST(req: Request) {
  const agent = await authenticateAgent(req)
  if (!agent) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  // Reuse the heartbeat rate-limit bucket — deliverable logs are similar in
  // shape (small, infrequent). If we see abuse we can split it out.
  const limit = checkLimit('heartbeat', agent.token.id)
  if (!limit.ok) {
    return NextResponse.json(
      { error: 'rate limited' },
      { status: 429, headers: rateLimitHeaders(limit) },
    )
  }

  const body = (await req.json().catch(() => ({}))) as {
    title?: string
    url?: string | null
    kind?: string | null
    detail?: string | null
  }

  const result = await createDeliverable({
    userId: agent.user.id,
    title: body.title ?? '',
    url: body.url ?? null,
    kind: body.kind ?? null,
    detail: body.detail ?? null,
    // The agent always uses "now" — the user hit the hotkey at this moment.
    // Not exposing completedAt prevents back-dated logs from the agent.
  })

  if (!result.ok) {
    return NextResponse.json(
      { error: result.error, duplicateOf: result.duplicateOf },
      { status: result.status, headers: rateLimitHeaders(limit) },
    )
  }
  return NextResponse.json(
    { ok: true, deliverable: result.deliverable },
    { headers: rateLimitHeaders(limit) },
  )
}
