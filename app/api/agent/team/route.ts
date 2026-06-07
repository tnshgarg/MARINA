import { NextResponse } from 'next/server'
import { and, eq, ne } from 'drizzle-orm'
import { db, schema } from '@/lib/db/client'
import { authenticateAgent } from '@/lib/agent/auth'

export const runtime = 'nodejs'

/**
 * Agent-side roster: the list of teammates the operator can mention as
 * "waiting on" in their break dialog. Excludes the operator themselves.
 */
export async function GET(req: Request) {
  const agent = await authenticateAgent(req)
  if (!agent) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const myOrgs = await db
    .select({ orgId: schema.memberships.orgId })
    .from(schema.memberships)
    .where(eq(schema.memberships.userId, agent.user.id))

  if (myOrgs.length === 0) return NextResponse.json({ members: [] })

  // Use the first org — agent currently operates against a single org at a time.
  const orgId = myOrgs[0]!.orgId

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
    .where(and(eq(schema.memberships.orgId, orgId), ne(schema.users.id, agent.user.id)))

  rows.sort((a, b) => (a.name ?? a.login).localeCompare(b.name ?? b.login))

  return NextResponse.json({ orgId, members: rows })
}
