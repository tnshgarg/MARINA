import { NextResponse } from 'next/server'
import { eq } from 'drizzle-orm'
import { auth } from '@/auth'
import { db, schema } from '@/lib/db/client'
import { buildReviewPacket, reviewPacketToMarkdown } from '@/lib/brief/review-packet'

export const runtime = 'nodejs'

const ALLOWED_DAYS = new Set([7, 30, 90, 180, 365])

/**
 * Generate the signed-in user's "get credit for your work" review packet over a
 * window. User-scoped — works with or without an org. The window is clamped to
 * a known set so a caller can't ask for an unbounded range.
 */
export async function POST(req: Request) {
  const session = await auth()
  if (!session?.appUserId) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  let days = 90
  try {
    const body = (await req.json()) as { days?: number }
    if (typeof body.days === 'number' && ALLOWED_DAYS.has(body.days)) days = body.days
  } catch {
    /* default 90 */
  }

  const me = await db.query.users.findFirst({ where: eq(schema.users.id, session.appUserId) })
  const name = me?.name ?? (me?.login ? `@${me.login}` : 'You')

  try {
    const packet = await buildReviewPacket(session.appUserId, name, days)
    const markdown = packet.empty ? '' : reviewPacketToMarkdown(packet, name)
    return NextResponse.json({ ok: true, packet, name, markdown })
  } catch (err) {
    console.error('review-packet failed', err)
    return NextResponse.json({ error: 'generation_failed' }, { status: 500 })
  }
}
