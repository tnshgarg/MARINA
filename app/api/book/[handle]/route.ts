import { NextResponse } from 'next/server'
import { eq } from 'drizzle-orm'
import { db, schema } from '@/lib/db/client'
import { sendEmail } from '@/lib/email/send'

export const runtime = 'nodejs'

/**
 * Public booking request — anyone (no account) can request time with a Marina
 * user via their /book/<login> link. Creates a pending request the host
 * accepts/declines from their dashboard, and seeds them as a contact. No auth:
 * this is the public, viral surface.
 */
export async function POST(req: Request, { params }: { params: Promise<{ handle: string }> }) {
  const { handle } = await params
  const host = await db.query.users.findFirst({ where: eq(schema.users.login, handle) })
  if (!host) return NextResponse.json({ error: 'not_found' }, { status: 404 })

  let body: { name?: string; email?: string; proposedAt?: string; note?: string } = {}
  try {
    body = (await req.json()) as typeof body
  } catch {
    /* invalid */
  }
  const name = (body.name ?? '').trim().slice(0, 120)
  const email = (body.email ?? '').trim().slice(0, 160)
  const proposedAt = body.proposedAt ? new Date(body.proposedAt) : null
  const note = body.note ? body.note.trim().slice(0, 500) : null
  if (!name || !email || !email.includes('@') || !proposedAt || isNaN(proposedAt.getTime())) {
    return NextResponse.json({ error: 'missing_fields' }, { status: 400 })
  }

  await db.insert(schema.bookingRequests).values({
    hostUserId: host.id,
    requesterName: name,
    requesterEmail: email,
    proposedAt,
    note,
  })

  // Notify the host (best-effort; no-ops if email isn't configured).
  if (host.email) {
    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://marina.team'
    void sendEmail({
      to: host.email,
      subject: `New meeting request from ${name}`,
      html:
        `<p><strong>${name}</strong> (${email}) requested time with you on ` +
        `<strong>${proposedAt.toLocaleString()}</strong>.</p>` +
        (note ? `<p>&ldquo;${note}&rdquo;</p>` : '') +
        `<p><a href="${appUrl}/dashboard">Open Marina to accept or decline →</a></p>`,
    })
  }

  return NextResponse.json({ ok: true })
}
