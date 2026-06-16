/**
 * One-shot end-to-end test of the real sync path (uses lib/github/app.ts's
 * repaired key handling + lib/github/app-sync.ts). Writes to github_events.
 *   pnpm tsx --env-file=.env.production scripts/gh-app-sync-once.ts 3
 */
import { eq } from 'drizzle-orm'
import { db, schema } from '../lib/db/client'
import { syncOrgViaApp } from '../lib/github/app-sync'

async function main() {
  const orgId = Number(process.argv[2])
  const bindInstallation = process.argv[3] ? Number(process.argv[3]) : null
  if (!Number.isInteger(orgId)) { console.error('usage: gh-app-sync-once.ts <orgId> [installationIdToBind]'); process.exit(1) }
  if (bindInstallation) {
    await db.update(schema.orgs).set({ githubInstallationId: bindInstallation }).where(eq(schema.orgs.id, orgId))
    console.log(`bound org #${orgId} → installation ${bindInstallation}`)
  }
  console.log(`syncing org #${orgId} …`)
  const r = await syncOrgViaApp(orgId)
  console.log(JSON.stringify({
    installationId: r.installationId,
    repos: r.repos,
    inserted: r.inserted,
    updated: r.updated,
    byType: r.byType,
    unmatchedAuthors: r.unmatchedAuthors.slice(0, 20),
    errors: r.errors.slice(0, 10),
  }, null, 2))
}

main().catch((e) => { console.error(e); process.exit(1) })
