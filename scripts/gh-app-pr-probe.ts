/**
 * Read-only probe: confirms PR status + review extraction works against real
 * GitHub data via the App installation. No DB writes. Scans repos until it finds
 * a few PRs, printing the derived status and each PR's reviewers + verdicts.
 *   pnpm tsx --env-file=.env scripts/gh-app-pr-probe.ts
 */
import { installationOctokit, listAppInstallations } from '../lib/github/app'

async function main() {
  const insts = await listAppInstallations()
  if (insts.length === 0) { console.log('No installations.'); return }
  console.log(`installation id=${insts[0].id} account=${insts[0].account}`)
  const octokit = await installationOctokit(insts[0].id)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const repos: any[] = await octokit.paginate(octokit.apps.listReposAccessibleToInstallation, { per_page: 100 })

  let found = 0
  const LIMIT = 8
  for (const r of repos) {
    if (found >= LIMIT) break
    let prs
    try {
      prs = (await octokit.pulls.list({ owner: r.owner.login, repo: r.name, state: 'all', sort: 'updated', direction: 'desc', per_page: 5 })).data
    } catch { continue }
    for (const p of prs) {
      if (found >= LIMIT) break
      found++
      const status = p.draft ? 'draft' : p.merged_at ? 'merged' : p.state === 'closed' ? 'closed' : 'open'
      console.log(`\nPR ${r.full_name}#${p.number}  status=${status}  author=${p.user?.login}`)
      console.log(`   "${p.title}"`)
      const reviews = (await octokit.pulls.listReviews({ owner: r.owner.login, repo: r.name, pull_number: p.number, per_page: 100 })).data
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const byReviewer = new Map<string, string>()
      for (const rv of reviews) {
        if (rv.user?.login && rv.user.login !== p.user?.login) byReviewer.set(rv.user.login, rv.state)
      }
      console.log('   reviewers:', [...byReviewer.entries()].map(([u, s]) => `${u}:${s}`).join(', ') || '(none)')
    }
  }
  if (found === 0) console.log('\nNo PRs found across the installation\'s repos (all solo-commit projects).')
  else console.log(`\nProbed ${found} PR(s).`)
}

main().catch((e) => { console.error(e); process.exit(1) })
