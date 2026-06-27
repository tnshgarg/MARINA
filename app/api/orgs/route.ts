import { NextResponse } from 'next/server'
import { and, eq, isNull } from 'drizzle-orm'
import { db, schema } from '@/lib/db/client'
import { HttpError, requireSession } from '@/lib/auth/guards'

export const runtime = 'nodejs'

export async function POST(req: Request) {
  try {
    const session = await requireSession()
    const { name, agentEnabled } = (await req.json()) as { name?: string; agentEnabled?: boolean }
    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      return NextResponse.json({ error: 'name required' }, { status: 400 })
    }

    // One account = one workspace. If this user already belongs to a workspace
    // (created or joined, via any sign-in method), they can't create another.
    const existing = await db.query.memberships.findFirst({
      where: and(
        eq(schema.memberships.userId, session.appUserId),
        isNull(schema.memberships.endedAt),
      ),
    })
    if (existing) {
      return NextResponse.json(
        {
          error:
            'Your account is already part of a workspace. Each account can belong to only one workspace.',
        },
        { status: 409 },
      )
    }

    const [org] = await db
      .insert(schema.orgs)
      .values({
        name: name.trim().slice(0, 200),
        ownerId: session.appUserId,
        // Desktop agent is on hold, so new workspaces default to WEB PUNCH
        // (agentEnabled = false). The flag stays for when the agent ships.
        agentEnabled: typeof agentEnabled === 'boolean' ? agentEnabled : false,
      })
      .returning()

    await db.insert(schema.memberships).values({
      orgId: org.id,
      userId: session.appUserId,
      role: 'admin',
    })

    return NextResponse.json({ ok: true, org })
  } catch (err) {
    return errorResponse(err)
  }
}

function errorResponse(err: unknown) {
  if (err instanceof HttpError) {
    return NextResponse.json({ error: err.message }, { status: err.status })
  }
  console.error('orgs POST failed', err)
  return NextResponse.json({ error: 'internal', message: String(err) }, { status: 500 })
}
