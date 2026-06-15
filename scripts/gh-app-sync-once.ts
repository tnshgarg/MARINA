/**
 * One-shot end-to-end test of the real sync path (uses lib/github/app.ts's
 * repaired key handling + lib/github/app-sync.ts). Writes to github_events.
 *   pnpm tsx --env-file=.env.production scripts/gh-app-sync-once.ts 3
 */
import { syncOrgViaApp } from '../lib/github/app-sync'

async function main() {
  const orgId = Number(process.argv[2])
  if (!Number.isInteger(orgId)) { console.error('usage: gh-app-sync-once.ts <orgId>'); process.exit(1) }
  console.log(`syncing org #${orgId} …`)
  const r = await syncOrgViaApp(orgId)
  console.log(JSON.stringify({
    installationId: r.installationId,
    repos: r.repos,
    inserted: r.inserted,
    byType: r.byType,
    unmatchedAuthors: r.unmatchedAuthors.slice(0, 20),
    errors: r.errors.slice(0, 10),
  }, null, 2))
}

main().catch((e) => { console.error(e); process.exit(1) })
