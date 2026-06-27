import { and, eq, isNull } from 'drizzle-orm'
import { db, schema } from '@/lib/db/client'
import { syncUserActivity } from './sync'
import { syncOrgViaApp } from './app-sync'

/**
 * Auto-sync helpers — the glue that makes GitHub data refresh *across the whole
 * product*, not just when someone hits a "Sync" button or generates a packet.
 *
 * Two paths, both staleness-gated so read pages can fire them on every load
 * without hammering GitHub:
 *   · syncGithubForUser  — the signed-in employee's OWN activity (their OAuth
 *     token). Powers their dashboard 7-day stats.
 *   · ensureOrgGithubFresh — the org-wide GitHub App sync (attributes every
 *     member's commits/PRs/reviews). This is what carries an employee's
 *     activity to their MANAGER without each employee syncing themselves.
 */

const MS_PER_MIN = 60 * 1000

/**
 * Union of every active org's tracked-GitHub-orgs allowlist for a user. An
 * empty result means "no filter" (track all repos) — which happens if the user
 * has no orgs, or ANY of their orgs tracks everything. Mirrors the logic the
 * manual self-sync route used before it was centralised here.
 */
export async function trackedOrgsForUser(userId: number): Promise<string[]> {
  const memberships = await db
    .select({ orgId: schema.memberships.orgId })
    .from(schema.memberships)
    .where(and(eq(schema.memberships.userId, userId), isNull(schema.memberships.endedAt)))

  if (memberships.length === 0) return []
  const tracked: string[] = []
  for (const m of memberships) {
    const org = await db.query.orgs.findFirst({ where: eq(schema.orgs.id, m.orgId) })
    const list = (org as { trackedGithubOrgs?: string[] } | undefined)?.trackedGithubOrgs ?? []
    if (list.length === 0) return [] // any "track everything" org → no filter
    tracked.push(...list)
  }
  return Array.from(new Set(tracked))
}

export type UserSyncOutcome =
  | { ran: true; inserted: number }
  | { ran: false; reason: 'fresh' | 'no_token' }

/**
 * Sync one user's own GitHub activity via their OAuth token. Skips when the
 * user synced within `maxAgeMins` (so a page can call this on every load) and
 * when the user hasn't connected GitHub. Safe to call from `afterResponse`.
 */
export async function syncGithubForUser(
  userId: number,
  login: string,
  opts: { daysBack?: number; maxAgeMins?: number } = {},
): Promise<UserSyncOutcome> {
  const { daysBack = 7, maxAgeMins } = opts

  const me = await db.query.users.findFirst({ where: eq(schema.users.id, userId) })
  if (!me?.accessToken) return { ran: false, reason: 'no_token' }

  if (maxAgeMins != null && me.lastSyncedAt) {
    const ageMin = (Date.now() - me.lastSyncedAt.getTime()) / MS_PER_MIN
    if (ageMin < maxAgeMins) return { ran: false, reason: 'fresh' }
  }

  const filter = await trackedOrgsForUser(userId)
  const res = await syncUserActivity(userId, login, me.accessToken, daysBack, filter)
  return { ran: true, inserted: res.inserted }
}

export type OrgSyncOutcome =
  | { ran: true; inserted: number; updated: number }
  | { ran: false; reason: 'fresh' | 'no_installation' }

/**
 * Refresh an org's GitHub activity via its App installation, debounced by
 * `orgs.githubSyncedAt`. No-op when the org has no installation. This is the
 * reliable manager-facing path — call it (via `afterResponse`) whenever a
 * manager opens a team / org / member view so their numbers are never stale.
 */
export async function ensureOrgGithubFresh(
  orgId: number,
  opts: { daysBack?: number; maxAgeMins?: number } = {},
): Promise<OrgSyncOutcome> {
  const { daysBack = 30, maxAgeMins = 30 } = opts

  const org = await db.query.orgs.findFirst({ where: eq(schema.orgs.id, orgId) })
  const installationId = (org as { githubInstallationId?: number | null } | undefined)?.githubInstallationId ?? null
  if (!installationId) return { ran: false, reason: 'no_installation' }

  const syncedAt = (org as { githubSyncedAt?: Date | null } | undefined)?.githubSyncedAt ?? null
  if (syncedAt) {
    const ageMin = (Date.now() - syncedAt.getTime()) / MS_PER_MIN
    if (ageMin < maxAgeMins) return { ran: false, reason: 'fresh' }
  }

  const res = await syncOrgViaApp(orgId, daysBack)
  return { ran: true, inserted: res.inserted, updated: res.updated }
}
