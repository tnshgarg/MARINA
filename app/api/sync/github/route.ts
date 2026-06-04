import { NextResponse } from 'next/server'
import { auth } from '@/auth'
import { syncUserActivity } from '@/lib/github/sync'

export const runtime = 'nodejs'

export async function POST() {
  const session = await auth()
  if (!session?.appUserId || !session.accessToken || !session.login) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  try {
    const result = await syncUserActivity(session.appUserId, session.login, session.accessToken, 7)
    return NextResponse.json({ ok: true, ...result })
  } catch (err) {
    console.error('sync failed', err)
    return NextResponse.json({ error: 'sync failed', message: String(err) }, { status: 500 })
  }
}
