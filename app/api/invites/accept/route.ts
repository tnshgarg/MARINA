import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { and, eq, isNull, ne } from 'drizzle-orm'
import { db, schema } from '@/lib/db/client'
import { HttpError, requireSession } from '@/lib/auth/guards'
import { seatCapError } from '@/lib/billing/seats'

export const runtime = 'nodejs'

export async function POST(req: Request) {
  try {
    const session = await requireSession()
    const { token } = (await req.json()) as { token?: string }
    if (!token || typeof token !== 'string') {
      return NextResponse.json({ error: 'token required' }, { status: 400 })
    }

    const invite = await db.query.invites.findFirst({
      where: and(eq(schema.invites.token, token), isNull(schema.invites.acceptedAt)),
    })
    if (!invite) return NextResponse.json({ error: 'invite not found or already used' }, { status: 404 })
    if (invite.expiresAt.getTime() < Date.now()) {
      return NextResponse.json({ error: 'invite expired' }, { status: 410 })
    }

    // SECURITY: an invite is addressed to a specific email. Without this check
    // anyone who obtains the link (forwarded email, leaked URL) could redeem it
    // on their own unrelated account and join the org as the granted role.
    const me = await db.query.users.findFirst({
      where: eq(schema.users.id, session.appUserId),
    })
    const inviteEmail = invite.email?.trim().toLowerCase()
    const myEmail = me?.email?.trim().toLowerCase()
    if (!inviteEmail || !myEmail || inviteEmail !== myEmail) {
      return NextResponse.json(
        { error: 'This invite was sent to a different email address. Sign in with that address to accept it.' },
        { status: 403 },
      )
    }

    // Enforce the seat cap at accept time too (not just at invite creation) —
    // pending invites created before a downgrade, or accepted concurrently,
    // would otherwise push the org past its plan.
    const capError = await seatCapError(invite.orgId)
    if (capError) return NextResponse.json({ error: capError }, { status: 409 })

    const inviteDiscipline = (invite as { discipline?: string }).discipline ?? 'other'
    const inviteJobTitle = (invite as { jobTitle?: string | null }).jobTitle ?? null

    // An active membership means they're already in — no-op. A soft-deleted
    // (endedAt-set) membership from a prior removal must be REACTIVATED rather
    // than left dead (otherwise a re-invited ex-member silently stays out).
    // One account = one workspace: refuse if the user is already active in a
    // DIFFERENT org. Keyed on appUserId, so it's the same regardless of whether
    // they signed in via GitHub / Google / magic-link.
    const otherActive = await db.query.memberships.findFirst({
      where: and(
        eq(schema.memberships.userId, session.appUserId),
        isNull(schema.memberships.endedAt),
        ne(schema.memberships.orgId, invite.orgId),
      ),
    })
    if (otherActive) {
      return NextResponse.json(
        {
          error:
            'Your account already belongs to another workspace. Each account can be in only one — leave it first to accept this invite.',
        },
        { status: 409 },
      )
    }

    const existingAny = await db.query.memberships.findFirst({
      where: and(
        eq(schema.memberships.orgId, invite.orgId),
        eq(schema.memberships.userId, session.appUserId),
      ),
    })

    if (!existingAny) {
      await db.insert(schema.memberships).values({
        orgId: invite.orgId,
        userId: session.appUserId,
        role: invite.role,
        discipline: inviteDiscipline as never,
        jobTitle: inviteJobTitle,
      })
    } else if (existingAny.endedAt) {
      await db
        .update(schema.memberships)
        .set({ endedAt: null, role: invite.role })
        .where(eq(schema.memberships.id, existingAny.id))
    }

    await db
      .update(schema.invites)
      .set({ acceptedAt: new Date() })
      .where(eq(schema.invites.id, invite.id))

    // Clear the pending-invite cookie now that we've accepted.
    try {
      const jar = await cookies()
      jar.delete('marina_pending_invite')
    } catch {
      // ignore
    }

    return NextResponse.json({ ok: true, orgId: invite.orgId })
  } catch (err) {
    if (err instanceof HttpError) {
      return NextResponse.json({ error: err.message }, { status: err.status })
    }
    console.error('invite accept failed', err)
    return NextResponse.json({ error: 'internal' }, { status: 500 })
  }
}
