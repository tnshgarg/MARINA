import { NextResponse } from 'next/server'
import { eq } from 'drizzle-orm'
import { db, schema } from '@/lib/db/client'
import { HttpError, requireSession } from '@/lib/auth/guards'
import { isCharacterKey } from '@/lib/characters/data'

export const runtime = 'nodejs'

export async function POST(req: Request) {
  try {
    const session = await requireSession()
    const body = (await req.json().catch(() => ({}))) as { characterKey?: string }
    const characterKey = body.characterKey
    if (!characterKey || !isCharacterKey(characterKey)) {
      return NextResponse.json({ error: 'unknown character' }, { status: 400 })
    }

    // Use returning() so we can confirm a row was actually updated. If the user
    // session points at a deleted user, this prevents a silent "ok but
    // characterKey still null" situation that loops the client back to /pick.
    const updated = await db
      .update(schema.users)
      .set({ characterKey })
      .where(eq(schema.users.id, session.appUserId))
      .returning({ id: schema.users.id, characterKey: schema.users.characterKey })

    if (updated.length === 0) {
      return NextResponse.json(
        { error: 'Your account was not found. Sign out and back in.' },
        { status: 404 }
      )
    }

    return NextResponse.json({ ok: true, characterKey: updated[0].characterKey })
  } catch (err) {
    if (err instanceof HttpError) {
      return NextResponse.json({ error: err.message }, { status: err.status })
    }
    console.error('character POST failed', err)
    return NextResponse.json({ error: 'internal' }, { status: 500 })
  }
}
