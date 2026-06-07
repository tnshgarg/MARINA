import { NextResponse } from 'next/server'
import { and, eq, ne } from 'drizzle-orm'
import { db, schema } from '@/lib/db/client'
import { HttpError, requireMembership } from '@/lib/auth/guards'

export const runtime = 'nodejs'

/**
 * Lightweight member directory for in-app autocompletes (break "waiting on"
 * picker, mentions, etc). Returns up to 25 matching teammates excluding the
 * viewer themselves.
 */
export async function GET(req: Request, ctx: { params: Promise<{ orgId: string }> }) {
  const { orgId: raw } = await ctx.params
  const orgId = Number(raw)
  if (!Number.isInteger(orgId)) {
    return NextResponse.json({ error: 'invalid orgId' }, { status: 400 })
  }

  try {
    const { session } = await requireMembership(orgId, 'member')
    const url = new URL(req.url)
    const q = (url.searchParams.get('q') ?? '').trim().toLowerCase()

    const rows = await db
      .select({
        userId: schema.users.id,
        login: schema.users.login,
        name: schema.users.name,
        avatarUrl: schema.users.avatarUrl,
        characterKey: schema.users.characterKey,
      })
      .from(schema.memberships)
      .innerJoin(schema.users, eq(schema.memberships.userId, schema.users.id))
      .where(and(eq(schema.memberships.orgId, orgId), ne(schema.users.id, session.appUserId)))

    const filtered = q
      ? rows.filter((r) =>
          r.login.toLowerCase().includes(q) ||
          (r.name ?? '').toLowerCase().includes(q),
        )
      : rows

    // Stable ranking — exact-prefix on login first, then name match, then alpha
    filtered.sort((a, b) => {
      if (q) {
        const aPrefix = a.login.toLowerCase().startsWith(q) ? 0 : 1
        const bPrefix = b.login.toLowerCase().startsWith(q) ? 0 : 1
        if (aPrefix !== bPrefix) return aPrefix - bPrefix
      }
      return (a.name ?? a.login).localeCompare(b.name ?? b.login)
    })

    return NextResponse.json({ members: filtered.slice(0, 25) })
  } catch (err) {
    if (err instanceof HttpError) {
      return NextResponse.json({ error: err.message }, { status: err.status })
    }
    console.error('members/search failed', err)
    return NextResponse.json({ error: 'internal' }, { status: 500 })
  }
}
