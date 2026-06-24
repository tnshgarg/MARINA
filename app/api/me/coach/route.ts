import { NextResponse } from 'next/server'
import { eq } from 'drizzle-orm'
import { auth } from '@/auth'
import { db, schema } from '@/lib/db/client'
import { buildCareerAssessment } from '@/lib/coach/assess'

export const runtime = 'nodejs'

/**
 * The career coach for the signed-in user — grounded in their own longitudinal
 * activity. User-scoped, works with or without an org.
 */
export async function POST() {
  const session = await auth()
  if (!session?.appUserId) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }
  const me = await db.query.users.findFirst({ where: eq(schema.users.id, session.appUserId) })
  const name = me?.name ?? (me?.login ? `@${me.login}` : 'You')

  try {
    const result = await buildCareerAssessment(session.appUserId, name)
    return NextResponse.json({ ok: true, ...result })
  } catch (err) {
    console.error('coach failed', err)
    return NextResponse.json({ error: 'coach_failed' }, { status: 500 })
  }
}
