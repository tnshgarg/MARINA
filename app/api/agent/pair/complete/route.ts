import { NextResponse } from 'next/server'
import { and, eq, gt, isNull } from 'drizzle-orm'
import { db, schema } from '@/lib/db/client'
import {
  generateAgentToken,
  hashPairingCode,
  normalizePairingCode,
} from '@/lib/agent/auth'

export const runtime = 'nodejs'

type Body = {
  code?: string
  label?: string
  platform?: string
  agentVersion?: string
}

export async function POST(req: Request) {
  let body: Body
  try {
    body = (await req.json()) as Body
  } catch {
    return NextResponse.json({ error: 'invalid json' }, { status: 400 })
  }

  const normalized = normalizePairingCode(body.code ?? '')
  if (normalized.length !== 8) {
    return NextResponse.json({ error: 'code must be 8 characters' }, { status: 400 })
  }
  const label = (body.label ?? 'Mac').toString().slice(0, 80) || 'Mac'
  const platform = (body.platform ?? 'darwin').toString().slice(0, 16) || 'darwin'
  const agentVersion = body.agentVersion ? String(body.agentVersion).slice(0, 32) : null

  const hash = hashPairingCode(normalized)

  try {
    // Find a matching pairing code that's unconsumed and unexpired.
    const code = await db.query.pairingCodes.findFirst({
      where: and(
        eq(schema.pairingCodes.codeHash, hash),
        isNull(schema.pairingCodes.consumedAt),
        gt(schema.pairingCodes.expiresAt, new Date())
      ),
    })
    if (!code) {
      return NextResponse.json({ error: 'invalid or expired code' }, { status: 410 })
    }

    const user = await db.query.users.findFirst({ where: eq(schema.users.id, code.userId) })
    if (!user) {
      return NextResponse.json({ error: 'user not found' }, { status: 404 })
    }

    const { plaintext, hash: tokenHash, prefix } = generateAgentToken()

    // Atomic-ish: mark code consumed first, then create token. If creating the
    // token fails we accept the code is consumed — better than letting the same
    // code create multiple tokens. The user can request a new code in seconds.
    await db
      .update(schema.pairingCodes)
      .set({ consumedAt: new Date() })
      .where(eq(schema.pairingCodes.id, code.id))

    const [token] = await db
      .insert(schema.agentTokens)
      .values({
        userId: user.id,
        tokenHash,
        tokenPrefix: prefix,
        label,
        platform,
        agentVersion: agentVersion ?? undefined,
        lastSeenAt: new Date(),
      })
      .returning()

    // Ensure the user has a settings row so pause/heartbeat work immediately.
    await db
      .insert(schema.userSettings)
      .values({
        userId: user.id,
        consentAt: new Date(),
        consentAgentVersion: agentVersion ?? undefined,
        consentPolicyVersion: process.env.MARINA_POLICY_VERSION ?? 'v1',
      })
      .onConflictDoUpdate({
        target: schema.userSettings.userId,
        set: {
          // Refresh consent timestamp when a new device pairs (proves explicit re-acceptance).
          consentAt: new Date(),
          consentAgentVersion: agentVersion ?? undefined,
          updatedAt: new Date(),
        },
      })

    return NextResponse.json({
      ok: true,
      token: plaintext,
      tokenPrefix: prefix,
      device: {
        id: token.id,
        label: token.label,
        platform: token.platform,
      },
      user: {
        id: user.id,
        login: user.login,
        name: user.name,
        email: user.email,
      },
      config: {
        sampleIntervalSeconds: 30,
        flushIntervalSeconds: 300,
        windowTitlesEnabled: false,
      },
    })
  } catch (err) {
    console.error('pair/complete failed', err)
    return NextResponse.json({ error: 'internal' }, { status: 500 })
  }
}
