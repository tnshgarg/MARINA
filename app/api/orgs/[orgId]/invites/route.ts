import { NextResponse } from 'next/server'
import { randomBytes } from 'crypto'
import { and, desc, eq, isNull } from 'drizzle-orm'
import { db, schema } from '@/lib/db/client'
import { HttpError, requireMembership } from '@/lib/auth/guards'
import { sendInviteEmail } from '@/lib/email/send'
import type { Role } from '@/lib/db/schema'

export const runtime = 'nodejs'

const INVITE_TTL_DAYS = 7

export async function GET(req: Request, ctx: { params: Promise<{ orgId: string }> }) {
  const { orgId: orgIdRaw } = await ctx.params
  const orgId = Number(orgIdRaw)
  if (!Number.isInteger(orgId)) {
    return NextResponse.json({ error: 'invalid orgId' }, { status: 400 })
  }

  try {
    await requireMembership(orgId, 'manager')
    const rows = await db
      .select()
      .from(schema.invites)
      .where(and(eq(schema.invites.orgId, orgId), isNull(schema.invites.acceptedAt)))
      .orderBy(desc(schema.invites.createdAt))
    return NextResponse.json({ invites: rows })
  } catch (err) {
    return errorResponse(err)
  }

  // suppress unused-var on req when only inspecting params
  void req
}

export async function POST(req: Request, ctx: { params: Promise<{ orgId: string }> }) {
  const { orgId: orgIdRaw } = await ctx.params
  const orgId = Number(orgIdRaw)
  if (!Number.isInteger(orgId)) {
    return NextResponse.json({ error: 'invalid orgId' }, { status: 400 })
  }

  try {
    const { session } = await requireMembership(orgId, 'manager')
    const { email, role } = (await req.json()) as { email?: string; role?: string }

    if (!email || typeof email !== 'string' || !email.includes('@')) {
      return NextResponse.json({ error: 'valid email required' }, { status: 400 })
    }
    const normalizedEmail = email.trim().toLowerCase()
    if (!isAllowedRole(role)) {
      return NextResponse.json({ error: 'role must be member or manager' }, { status: 400 })
    }

    const org = await db.query.orgs.findFirst({ where: eq(schema.orgs.id, orgId) })
    if (!org) return NextResponse.json({ error: 'org not found' }, { status: 404 })

    const token = randomBytes(32).toString('base64url')
    const expiresAt = new Date(Date.now() + INVITE_TTL_DAYS * 24 * 60 * 60 * 1000)

    const [invite] = await db
      .insert(schema.invites)
      .values({
        orgId,
        email: normalizedEmail,
        role: role as Role,
        token,
        invitedBy: session.appUserId,
        expiresAt,
      })
      .returning()

    const inviteUrl = buildInviteUrl(req, token)
    const sendResult = await sendInviteEmail({
      to: normalizedEmail,
      inviteUrl,
      orgName: org.name,
      inviterLogin: session.login,
      role: invite.role,
    })

    return NextResponse.json({ ok: true, invite, inviteUrl, email: sendResult })
  } catch (err) {
    return errorResponse(err)
  }
}

function isAllowedRole(r: unknown): r is Role {
  return r === 'member' || r === 'manager'
}

function buildInviteUrl(req: Request, token: string): string {
  const base = process.env.NEXT_PUBLIC_APP_URL || new URL(req.url).origin
  return `${base.replace(/\/$/, '')}/invite/${token}`
}

function errorResponse(err: unknown) {
  if (err instanceof HttpError) {
    return NextResponse.json({ error: err.message }, { status: err.status })
  }
  console.error('invites route failed', err)
  return NextResponse.json({ error: 'internal', message: String(err) }, { status: 500 })
}
