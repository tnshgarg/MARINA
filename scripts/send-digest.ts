/**
 * Send the founder/CEO weekly digest email to a chosen address, built from a
 * given org (defaults to the demo org so it's never empty). Lets us preview
 * exactly what founders receive.
 *   DIGEST_TO=you@example.com pnpm tsx --env-file=.env scripts/send-digest.ts
 */
import { eq } from 'drizzle-orm'
import { db, schema } from '../lib/db/client'
import { buildWeeklyDigest, renderDigestEmail } from '../lib/digest/weekly'
import { sendDigestMail } from '../lib/email/send'

async function main() {
  const to = process.env.DIGEST_TO || 'thetanishgarg@gmail.com'
  const orgName = process.env.DIGEST_ORG || 'Acme Demo Squad'
  const org = await db.query.orgs.findFirst({ where: eq(schema.orgs.name, orgName) })
  if (!org) throw new Error(`org "${orgName}" not found`)

  const digest = await buildWeeklyDigest(org.id)
  if (!digest) throw new Error('buildWeeklyDigest returned null')

  const email = renderDigestEmail(digest)
  console.log(`Org #${org.id} "${digest.orgName}"`)
  console.log('Subject:', email.subject)
  console.log('Totals:', JSON.stringify(digest.totals))
  console.log('Standouts:', digest.standouts.map((s) => s.user.name ?? `@${s.user.login}`).join(', ') || '(none)')

  const result = await sendDigestMail({ to, subject: email.subject, html: email.html, text: email.text })
  console.log('Send →', to, ':', JSON.stringify(result))
}

main().catch((e) => { console.error(e); process.exit(1) })
