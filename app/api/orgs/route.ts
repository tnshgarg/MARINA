import { NextResponse } from 'next/server'
import { db, schema } from '@/lib/db/client'
import { HttpError, requireSession } from '@/lib/auth/guards'

export const runtime = 'nodejs'

export async function POST(req: Request) {
  try {
    const session = await requireSession()
    const { name } = (await req.json()) as { name?: string }
    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      return NextResponse.json({ error: 'name required' }, { status: 400 })
    }

    const [org] = await db
      .insert(schema.orgs)
      .values({ name: name.trim().slice(0, 200), ownerId: session.appUserId })
      .returning()

    await db.insert(schema.memberships).values({
      orgId: org.id,
      userId: session.appUserId,
      role: 'owner',
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
