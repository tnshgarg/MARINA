import { NextResponse } from 'next/server'
import { and, eq, isNull } from 'drizzle-orm'
import { db, schema } from '@/lib/db/client'
import { authorizeCron } from '@/lib/cron/auth'
import { buildManagerDailyDigest, renderManagerDailyEmail } from '@/lib/digest/daily'
import { sendDigestMail } from '@/lib/email/send'
import { log } from '@/lib/log/log'

export const runtime = 'nodejs'
export const maxDuration = 300

/**
 * Daily manager digest. Sent Tue–Sat at 08:00 IST (02:30 UTC) — Monday's
 * digest is the bigger weekly one. Each manager / owner gets one email per
 * org they're a manager in, summarising the previous day.
 *
 * Skips orgs where every metric is zero (weekend tails, deserted teams) so
 * we don't spam inboxes with "0 / 0 / 0" emails.
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
  let failed = 0

  for (const org of orgs) {
    // Find the owner + every manager. Each gets a digest scoped to their
    // reports (or whole org if no reports-to chain).
    const managers = await db
      .select({ m: schema.memberships, u: schema.users })
      .from(schema.memberships)
      .innerJoin(schema.users, eq(schema.memberships.userId, schema.users.id))
      .where(
        and(
          eq(schema.memberships.orgId, org.id),
          isNull(schema.memberships.endedAt),
        ),
      )
    const targets = managers.filter((row) => row.m.role === 'admin' || row.m.role === 'manager')

    for (const t of targets) {
      if (!t.u.email) {
        skipped++
        continue
      }
      // For an owner or a manager with no direct reports, scope = null
      // (whole org). For a manager with reports, scope to those user ids.
      const reportIds = managers
        .filter((row) => row.m.reportsToMembershipId === t.m.id)
        .map((row) => row.u.id)
      const scope = t.m.role === 'admin' || reportIds.length === 0 ? null : reportIds

      try {
        const digest = await buildManagerDailyDigest({
          managerName: t.u.name ?? `@${t.u.login}`,
          orgId: org.id,
          scope,
        })
        if (!digest) {
          skipped++
          continue
        }
        const { subject, text, html } = renderManagerDailyEmail(digest)
        const r = await sendDigestMail({
          to: t.u.email,
          subject,
          text,
          html,
        })
        if (r.ok) {
          sent++
        } else {
          failed++
          log.warn(`[digest/daily] send failed for org=${org.id} user=${t.u.id}: ${r.error}`)
        }
      } catch (err) {
        failed++
        log.error(`[digest/daily] crash for org=${org.id} user=${t.u.id}: ${err}`)
      }
    }
  }

  return NextResponse.json({
    ok: true,
    sent,
    skipped,
    failed,
    elapsedMs: Date.now() - started,
  })
}
