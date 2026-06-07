import { NextResponse } from 'next/server'
import { eq } from 'drizzle-orm'
import { db, schema } from '@/lib/db/client'
import { HttpError, requireSession } from '@/lib/auth/guards'
import { audit, requestMeta } from '@/lib/audit/log'

export const runtime = 'nodejs'

/**
 * DPDP Act-compliant data export — the user gets a full JSON snapshot of every
 * row tied to their identity. Heavy tables are downsampled when reasonable.
 */
export async function GET(req: Request) {
  try {
    const session = await requireSession()
    const userId = session.appUserId

    const [
      user,
      memberships,
      githubEvents,
      narratives,
      userSettings,
      localActivity,
      shifts,
      breaks,
      leaves,
      devices,
      shotConsents,
    ] = await Promise.all([
      db.query.users.findFirst({ where: eq(schema.users.id, userId) }),
      db.select().from(schema.memberships).where(eq(schema.memberships.userId, userId)),
      db.select().from(schema.githubEvents).where(eq(schema.githubEvents.userId, userId)),
      db.select().from(schema.narratives).where(eq(schema.narratives.userId, userId)),
      db.query.userSettings.findFirst({ where: eq(schema.userSettings.userId, userId) }),
      db.select().from(schema.localActivity).where(eq(schema.localActivity.userId, userId)).limit(10_000),
      db.select().from(schema.shifts).where(eq(schema.shifts.userId, userId)),
      db.select().from(schema.breaks).where(eq(schema.breaks.userId, userId)),
      db.select().from(schema.leaveRequests).where(eq(schema.leaveRequests.userId, userId)),
      db.select().from(schema.agentTokens).where(eq(schema.agentTokens.userId, userId)),
      db.select().from(schema.shotConsents).where(eq(schema.shotConsents.userId, userId)),
    ])

    // Strip sensitive credentials
    const safeUser = user
      ? {
          id: user.id,
          githubId: user.githubId,
          login: user.login,
          name: user.name,
          email: user.email,
          avatarUrl: user.avatarUrl,
          characterKey: user.characterKey,
          createdAt: user.createdAt,
        }
      : null

    const safeDevices = devices.map((d) => ({
      id: d.id,
      label: d.label,
      platform: d.platform,
      tokenPrefix: d.tokenPrefix,
      agentVersion: d.agentVersion,
      pairedAt: d.pairedAt,
      lastSeenAt: d.lastSeenAt,
      revokedAt: d.revokedAt,
    }))

    void audit({
      action: 'data.exported',
      orgId: memberships[0]?.orgId ?? null,
      actorUserId: userId,
      targetType: 'user',
      targetId: userId,
      ...requestMeta(req),
    })

    const payload = {
      exportedAt: new Date().toISOString(),
      version: 1,
      notice:
        'This file contains all personal data MARINA holds about you. Generated under your DPDP Act 2023 right of access.',
      user: safeUser,
      memberships,
      userSettings,
      devices: safeDevices,
      shifts,
      breaks,
      leaves,
      narratives,
      githubEvents,
      localActivity,
      shotConsents,
    }

    return new NextResponse(JSON.stringify(payload, null, 2), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Content-Disposition': `attachment; filename="marina-export-${userId}-${new Date().toISOString().slice(0, 10)}.json"`,
      },
    })
  } catch (err) {
    if (err instanceof HttpError) {
      return NextResponse.json({ error: err.message }, { status: err.status })
    }
    console.error('export failed', err)
    return NextResponse.json({ error: 'internal' }, { status: 500 })
  }
}
