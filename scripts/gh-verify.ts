/**
 * GitHub sync verifier. Proves the NEW org-repo discovery actually pulls
 * commits from a (possibly PRIVATE) tracked org — the exact logic the app's
 * sync now uses. Run with a token that can see the org:
 *
 *   GITHUB_TOKEN=ghp_xxx GH_ORG=marina-dummy pnpm tsx scripts/gh-verify.ts
 *
 * A classic PAT needs `repo` + `read:org` scope to see private org repos.
 * The token can be a fine-grained PAT scoped to the marina-dummy org with
 * "Contents: read" + "Metadata: read".
 */
import { Octokit } from '@octokit/rest'

async function main() {
  const token = process.env.GITHUB_TOKEN
  const org = process.env.GH_ORG ?? 'marina-dummy'
  if (!token) {
    console.error('Set GITHUB_TOKEN (classic PAT with repo+read:org, or a fine-grained PAT for the org).')
    process.exit(1)
  }
  const octokit = new Octokit({ auth: token })

  // Who is this token?
  const me = await octokit.users.getAuthenticated()
  console.log(`✓ Authenticated as @${me.data.login}`)

  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()

  // Enumerate the org's repos (incl. private) — same as the app.
  let repos: Array<{ name: string; private?: boolean; pushed_at?: string | null }> = []
  try {
    repos = (await octokit.paginate(octokit.repos.listForOrg, { org, type: 'all', sort: 'pushed', per_page: 100 })) as never
    console.log(`✓ Listed ${repos.length} repos in org "${org}":`, repos.map((r) => `${r.name}${r.private ? ' (private)' : ''}`).join(', ') || '(none)')
  } catch (e) {
    console.log(`· "${org}" is not an org or token can't list it (${(e as Error).message}); trying as a user account…`)
    repos = (await octokit.paginate(octokit.repos.listForUser, { username: org, type: 'all', sort: 'pushed', per_page: 100 })) as never
    console.log(`✓ Listed ${repos.length} repos for user "${org}"`)
  }

  if (repos.length === 0) {
    console.log('\n✗ No repos visible. The token cannot see this org\'s repos.')
    console.log('  Fix in the real app: the org admin must AUTHORIZE the MARINA OAuth app')
    console.log('  (github.com → org → Settings → Third-party Access → grant the app), and the')
    console.log('  user must RECONNECT GitHub so the new `read:org` scope is granted.')
    process.exit(0)
  }

  let total = 0
  for (const r of repos) {
    if (r.pushed_at && new Date(r.pushed_at) < new Date(since)) continue
    try {
      const commits = await octokit.paginate(octokit.repos.listCommits, {
        owner: org,
        repo: r.name,
        since,
        per_page: 100,
      })
      if (commits.length > 0) {
        console.log(`\n  ${org}/${r.name} — ${commits.length} commit(s) in last 30d:`)
        for (const c of commits.slice(0, 10)) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const cc = c as any
          console.log(`    • ${cc.sha.slice(0, 7)}  ${(cc.commit?.message ?? '').split('\n')[0].slice(0, 60)}  — @${cc.author?.login ?? cc.commit?.author?.email}`)
        }
        total += commits.length
      }
    } catch (e) {
      console.log(`    (couldn't read commits for ${r.name}: ${(e as Error).message})`)
    }
  }
  console.log(`\n✓ DONE — ${total} commit(s) the app would track across "${org}". If you see your test-web commit above, the sync works.`)
  process.exit(0)
}

main().catch((e) => {
  console.error('verify failed:', e)
  process.exit(1)
})
