import { NextResponse } from 'next/server'
import { db, schema } from '@/lib/db/client'
import { authorizeCron } from '@/lib/cron/auth'
import { notify } from '@/lib/notify/send'
import { todaysCelebrations } from '@/lib/celebrations/dates'

export const runtime = 'nodejs'
export const maxDuration = 120

/**
 * Fires today's birthdays + work anniversaries. notify() broadcasts them to
 * each org's Slack default channel (the only delivery path for celebrations),
 * so we skip orgs without a channel. Schedule daily in the morning.
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
  const orgs = await db.select().from(schema.orgs)
  let fired = 0
  let skipped = 0
  for (const org of orgs) {
    if (!org.slackDefaultChannelId) {
      skipped++
      continue
    }
    const cels = await todaysCelebrations(org.id)
    for (const c of cels) {
      if (c.kind === 'birthday') {
        notify({ kind: 'celebration.birthday', orgId: org.id, actorUserId: c.userId, userName: c.name, userLogin: c.login })
      } else {
        notify({
          kind: 'celebration.anniversary',
          orgId: org.id,
          actorUserId: c.userId,
          userName: c.name,
          userLogin: c.login,
          years: c.years ?? 1,
        })
      }
      fired++
    }
  }
  return NextResponse.json({ ok: true, fired, skipped })
}
