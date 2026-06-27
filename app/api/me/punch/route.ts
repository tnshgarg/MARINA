import { NextResponse } from 'next/server'
import { auth } from '@/auth'
import { punchIn, punchOut } from '@/lib/shifts/punch'

export const runtime = 'nodejs'

/**
 * Web punch in / out for the signed-in user. Solo employees track their own
 * working time from the browser — no desktop agent required. Reuses the same
 * shift domain logic the agent + Slack use; org is resolved internally (null for
 * a no-org user).
 */
export async function POST(req: Request) {
  const session = await auth()
  if (!session?.appUserId) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  let action = ''
  let summary = ''
  try {
    const body = (await req.json()) as { action?: string; summary?: string }
    action = body.action ?? ''
    summary = (body.summary ?? '').trim().slice(0, 500)
  } catch {
    /* no body */
  }

  if (action === 'in') {
    const r = await punchIn(session.appUserId, null, 'web')
    return NextResponse.json({ ...r })
  }
  if (action === 'out') {
    const r = await punchOut(session.appUserId, summary || 'Wrapped up for the day.', 'web')
    if (!r.ok) return NextResponse.json({ error: r.error }, { status: 400 })
    return NextResponse.json({ ok: true })
  }
  return NextResponse.json({ error: 'bad_action' }, { status: 400 })
}
