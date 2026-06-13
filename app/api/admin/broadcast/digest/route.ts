import { NextResponse } from 'next/server'
import { eq } from 'drizzle-orm'
import { db, schema } from '@/lib/db/client'
import { isAdminSession } from '@/lib/auth/admin'
import { buildWeeklyDigest, renderDigestEmail } from '@/lib/digest/weekly'
import { buildManagerDailyDigest, renderManagerDailyEmail } from '@/lib/digest/daily'
import { sendDigestMail } from '@/lib/email/send'

export const runtime = 'nodejs'
export const maxDuration = 60

/**
 * Trigger a digest send for one org or all orgs, on-demand.
 *
 * Body: { kind: 'weekly' | 'daily', orgId?: number }
 *
 * - kind='weekly' → CEO weekly digest (Monday brief), sent to org owner
 * - kind='daily'  → Manager daily digest, sent to every manager+ in the org
 *
 * Without `orgId`, fans out across every org. With it, sends to that org only.
 *
 * Uses the same build/render helpers the crons use so the email body stays
 * identical — handy for previewing what next Monday's digest will look like.
 */
export async function POST(req: Request) {
  if (!(await isAdminSession())) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  }
  let body: { kind?: 'weekly' | 'daily'; orgId?: number }
  try {
    body = (await req.json()) ?? {}
  } catch {
    return NextResponse.json({ error: 'invalid json' }, { status: 400 })
  }
  const kind = body.kind === 'daily' ? 'daily' : 'weekly'

  const orgs = body.orgId
    ? await db.select().from(schema.orgs).where(eq(schema.orgs.id, body.orgId))
    : await db.select().from(schema.orgs)

  let sent = 0
  let skipped = 0
  const errors: Array<{ orgId: number; error: string }> = []

  for (const org of orgs) {
    try {
      if (kind === 'weekly') {
        const owner = await db.query.users.findFirst({
          where: eq(schema.users.id, org.ownerId),
        })
        if (!owner?.email) {
          skipped++
          continue
        }
        const digest = await buildWeeklyDigest(org.id)
        if (!digest) {
          skipped++
          continue
        }
        const email = renderDigestEmail(digest)
        await sendDigestMail({
          to: owner.email,
          subject: `${email.subject} (manual)`,
          html: email.html,
          text: email.text,
        })
        sent++
      } else {
        // Daily — send to every manager+ in the org
        const managers = await db
          .select({ user: schema.users })
          .from(schema.memberships)
          .innerJoin(schema.users, eq(schema.memberships.userId, schema.users.id))
          .where(eq(schema.memberships.orgId, org.id))

        const eligible = managers.filter((m) =>
          ['owner', 'manager', 'lead'].includes(
            (m as { role?: string }).role ?? 'member',
          ) && !!m.user.email,
        )
        if (eligible.length === 0) {
          skipped++
          continue
        }
        for (const m of eligible) {
          if (!m.user.email) continue
          const managerName = m.user.name ?? m.user.login ?? 'there'
          const digest = await buildManagerDailyDigest({
            managerName,
            orgId: org.id,
            scope: null,
          })
          if (!digest) continue
          const email = renderManagerDailyEmail(digest)
          await sendDigestMail({
            to: m.user.email,
            subject: `${email.subject} (manual)`,
            html: email.html,
            text: email.text,
          })
        }
        sent++
      }
    } catch (e) {
      errors.push({ orgId: org.id, error: e instanceof Error ? e.message : String(e) })
    }
  }

  return NextResponse.json({
    ok: true,
    kind,
    orgsAttempted: orgs.length,
    sent,
    skipped,
    failed: errors.length,
    errors: errors.slice(0, 10),
  })
}
