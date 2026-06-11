import { NextResponse } from 'next/server'
import { eq } from 'drizzle-orm'
import { db, schema } from '@/lib/db/client'
import { authorizeCron } from '@/lib/cron/auth'
import { buildWeeklyDigest, renderDigestEmail } from '@/lib/digest/weekly'
import { sendEmail } from '@/lib/email/send'
import { log } from '@/lib/log/log'

export const runtime = 'nodejs'
export const maxDuration = 300

/**
 * Monday morning CEO digest. Generates one digest per org and emails it to
 * the org owner. Run on Mondays at 02:30 UTC (8 AM IST).
 *
 * Owners can opt out via workspace settings (digestEnabled flag — when not set,
 * we default to ON for orgs with > 3 members).
 */
export async function GET(req: Request) {
  if (!authorizeCron(req)) return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  return run()
}
export async function POST(req: Request) {
  if (!authorizeCron(req)) return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  return run()
}

async function run() {
  const started = Date.now()
  const orgs = await db.select().from(schema.orgs)

  let sent = 0
  let skipped = 0
  const errors: Array<{ orgId: number; error: string }> = []

  for (const org of orgs) {
    try {
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
      // Skip near-empty digests for tiny demo orgs (<= 1 member, no activity).
      if (digest.totals.members <= 1 && digest.totals.commits === 0) {
        skipped++
        continue
      }
      const email = renderDigestEmail(digest)
      const result = await sendEmail({
        to: owner.email,
        subject: email.subject,
        html: email.html,
        text: email.text,
      })
      if (!result.ok) throw new Error(result.error ?? 'send failed')
      sent++
    } catch (err) {
      errors.push({ orgId: org.id, error: String(err) })
      log.error('cron.digest.org_failed', { orgId: org.id, err: String(err) })
    }
  }
  log.info('cron.digest.done', { sent, skipped, errors: errors.length })
  return NextResponse.json({
    ok: true,
    sent,
    skipped,
    errors,
    elapsedMs: Date.now() - started,
  })
}
