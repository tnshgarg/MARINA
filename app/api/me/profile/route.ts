import { NextResponse } from 'next/server'
import { eq } from 'drizzle-orm'
import { db, schema } from '@/lib/db/client'
import { HttpError, requireSession } from '@/lib/auth/guards'
import { normalizeGithubUsername } from '@/lib/github/username'

export const runtime = 'nodejs'

/** Read the current viewer's people-care fields. */
export async function GET() {
  try {
    const session = await requireSession()
    const me = await db.query.users.findFirst({
      where: eq(schema.users.id, session.appUserId),
    })
    return NextResponse.json({
      birthdayMmDd: me?.birthdayMmDd ?? null,
      joinedOn: me?.joinedOn ?? null,
      githubLogin: me?.githubLogin ?? null,
    })
  } catch (e) {
    if (e instanceof HttpError) {
      return NextResponse.json({ error: e.message }, { status: e.status })
    }
    throw e
  }
}

/**
 * Self-serve profile editor. Lets a signed-in member fill in the people-care
 * fields (birthday + joining date) themselves — without an HR admin having
 * to type each one in.
 *
 * Why a dedicated /api/me endpoint instead of /api/orgs/.../members/.../:
 *   - those routes gate on the `manager` role, which a plain member doesn't
 *     have. Forking the role check there would tangle two concerns.
 *   - this fits the "members own their own data" model: only the signed-in
 *     user can edit their own birthday and join date; HR sees it read-only.
 */
export async function PATCH(req: Request) {
  let body: { birthdayMmDd?: string | null; joinedOn?: string | null; githubLogin?: string | null }
  try {
    body = (await req.json()) ?? {}
  } catch {
    return NextResponse.json({ error: 'invalid json' }, { status: 400 })
  }

  try {
    const session = await requireSession()

    const patch: Record<string, string | null> = {}
    if (body.githubLogin !== undefined) {
      if (body.githubLogin === null || body.githubLogin.trim() === '') {
        patch.githubLogin = null
      } else {
        const normalized = normalizeGithubUsername(body.githubLogin)
        if (!normalized) {
          return NextResponse.json({ error: "That doesn't look like a valid GitHub username." }, { status: 400 })
        }
        patch.githubLogin = normalized
      }
    }
    if (body.birthdayMmDd !== undefined) {
      if (body.birthdayMmDd === null || body.birthdayMmDd === '') {
        patch.birthdayMmDd = null
      } else if (typeof body.birthdayMmDd === 'string' && /^\d{2}-\d{2}$/.test(body.birthdayMmDd)) {
        patch.birthdayMmDd = body.birthdayMmDd
      } else {
        return NextResponse.json({ error: 'birthdayMmDd must be MM-DD' }, { status: 400 })
      }
    }
    if (body.joinedOn !== undefined) {
      if (body.joinedOn === null || body.joinedOn === '') {
        patch.joinedOn = null
      } else if (typeof body.joinedOn === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(body.joinedOn)) {
        patch.joinedOn = body.joinedOn
      } else {
        return NextResponse.json({ error: 'joinedOn must be YYYY-MM-DD' }, { status: 400 })
      }
    }
    if (Object.keys(patch).length === 0) {
      return NextResponse.json({ error: 'nothing to update' }, { status: 400 })
    }

    await db.update(schema.users).set(patch).where(eq(schema.users.id, session.appUserId))
    return NextResponse.json({ ok: true, ...patch })
  } catch (e) {
    if (e instanceof HttpError) {
      return NextResponse.json({ error: e.message }, { status: e.status })
    }
    console.error('PATCH /api/me/profile failed', e)
    return NextResponse.json({ error: 'internal' }, { status: 500 })
  }
}
