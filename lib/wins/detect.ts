import type { MemberWork } from '@/lib/people/work'

/**
 * Wins — the "always-on highlight reel". Derived from a person's real,
 * accumulated activity (not a one-shot prompt): the ships that merged, the
 * reviews that unblocked teammates, the work they drove. This is the raw
 * material the career coach reasons over and the brag-doc draws from.
 *
 * v1 derives wins deterministically from MemberWork so it needs no new storage;
 * persistence + manual curation (star / add / dismiss) is the natural next step.
 */
export type WinKind = 'shipped' | 'reviewed' | 'drove' | 'fixed'

export type Win = {
  kind: WinKind
  title: string
  detail: string
  url?: string
  occurredAt?: string
}

const FIX_RE = /\b(fix|fixes|fixed|bug|hotfix|patch|regression|resolve[ds]?)\b/i

export function deriveWins(work: MemberWork): Win[] {
  const wins: Win[] = []

  // Shipped — merged PRs are the clearest "I delivered this".
  const merged = work.prs.filter((p) => p.status === 'merged')
  for (const p of merged.slice(0, 6)) {
    wins.push({
      kind: FIX_RE.test(p.title) ? 'fixed' : 'shipped',
      title: p.title,
      detail: `Merged in ${p.repo}`,
      url: p.url,
      occurredAt: p.occurredAt,
    })
  }

  // Unblocked others — review volume is invisible work that rarely gets credit.
  if (work.reviewsGiven.length >= 3) {
    wins.push({
      kind: 'reviewed',
      title: `Reviewed ${work.reviewsGiven.length} pull requests`,
      detail: 'Unblocked teammates through code review',
    })
  }

  // Drove an area — a sustained commit push on one repo signals ownership.
  const top = work.commitRepos[0]
  if (top && top.count >= 5 && merged.length < 6) {
    wins.push({
      kind: 'drove',
      title: `Drove ${top.repo.split('/').pop() ?? top.repo}`,
      detail: `${top.count} commits — a sustained push`,
    })
  }

  return wins.slice(0, 7)
}
