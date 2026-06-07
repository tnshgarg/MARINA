import { NextResponse } from 'next/server'
import { eq } from 'drizzle-orm'
import { db, schema } from '@/lib/db/client'
import { HttpError, requireSession } from '@/lib/auth/guards'
import { audit, requestMeta } from '@/lib/audit/log'

export const runtime = 'nodejs'

/**
 * DPDP Act-compliant account erasure. Cascades through all dependent tables
 * via the schema's onDelete: cascade. The user is then signed out client-side.
 *
 * The org's owner cannot delete their account if they're the sole owner — they
 * must transfer ownership first. (Future work: transfer flow. For now we refuse.)
 */
export async function DELETE(req: Request) {
  try {
    const session = await requireSession()
    const userId = session.appUserId

    // Owner-protection: refuse if user is the sole owner of any org with > 1 member.
    const ownedOrgs = await db.select().from(schema.orgs).where(eq(schema.orgs.ownerId, userId))
    for (const org of ownedOrgs) {
      const members = await db
        .select({ count: schema.memberships.id })
        .from(schema.memberships)
        .where(eq(schema.memberships.orgId, org.id))
      if (members.length > 1) {
        return NextResponse.json(
          {
            error: `You're the sole owner of "${org.name}". Transfer ownership or remove other members before deleting your account.`,
          },
          { status: 409 }
        )
      }
    }

    void audit({
      action: 'account.deleted',
      orgId: ownedOrgs[0]?.id ?? null,
      actorUserId: userId,
      targetType: 'user',
      targetId: userId,
      ...requestMeta(req),
    })

    // Delete owned orgs first (cascades through memberships, invites, etc.)
    for (const org of ownedOrgs) {
      await db.delete(schema.orgs).where(eq(schema.orgs.id, org.id))
    }

    // Then the user row — cascades through users.id FK on every other table.
    await db.delete(schema.users).where(eq(schema.users.id, userId))

    return NextResponse.json({ ok: true, deleted: true })
  } catch (err) {
    if (err instanceof HttpError) {
      return NextResponse.json({ error: err.message }, { status: err.status })
    }
    console.error('account deletion failed', err)
    return NextResponse.json({ error: 'internal' }, { status: 500 })
  }
}
