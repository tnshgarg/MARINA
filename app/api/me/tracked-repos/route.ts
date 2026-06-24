import { NextResponse } from 'next/server'
import { eq } from 'drizzle-orm'
import { auth } from '@/auth'
import { db, schema } from '@/lib/db/client'

export const runtime = 'nodejs'

/** The user's tracked-repos allowlist (empty = include everything in reports). */
export async function GET() {
  const session = await auth()
  if (!session?.appUserId) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const s = await db.query.userSettings.findFirst({ where: eq(schema.userSettings.userId, session.appUserId) })
  return NextResponse.json({ ok: true, repos: s?.trackedRepos ?? [] })
}

export async function POST(req: Request) {
  const session = await auth()
  if (!session?.appUserId) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  let repos: string[] = []
  try {
    const body = (await req.json()) as { repos?: unknown }
    if (Array.isArray(body.repos)) repos = body.repos.map((r) => String(r).trim()).filter(Boolean).slice(0, 50)
  } catch {
    /* invalid */
  }

  await db
    .insert(schema.userSettings)
    .values({ userId: session.appUserId, trackedRepos: repos })
    .onConflictDoUpdate({ target: schema.userSettings.userId, set: { trackedRepos: repos, updatedAt: new Date() } })
  return NextResponse.json({ ok: true, repos })
}
