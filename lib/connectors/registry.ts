import { eq } from 'drizzle-orm'
import { db, schema } from '@/lib/db/client'
import type { ConnectorDescriptor, ConnectorState } from './types'

/**
 * The connector registry. Today it centralises integration metadata + per-org
 * connection state (the seam); Phase 2 grows each descriptor into live
 * auth/sync/render behaviour. Adding an integration = adding a descriptor here,
 * not editing core surfaces.
 */
const orgHas = (pick: (o: typeof schema.orgs.$inferSelect) => unknown) => async (orgId: number) => {
  const o = await db.query.orgs.findFirst({ where: eq(schema.orgs.id, orgId) })
  return !!o && !!pick(o)
}

const CONNECTORS: ConnectorDescriptor[] = [
  {
    id: 'github',
    name: 'GitHub',
    kind: 'data',
    status: 'ga',
    summary: 'Commits, PRs and reviews from your repos (App-based, private repos OK).',
    requires: ['GITHUB_APP_ID', 'GITHUB_APP_PRIVATE_KEY'],
    isConnected: orgHas((o) => o.githubInstallationId),
  },
  {
    id: 'calendar',
    name: 'Google Calendar',
    kind: 'data',
    status: 'ga',
    summary: 'Meetings and attendance signal.',
    requires: ['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET'],
  },
  {
    id: 'slack',
    name: 'Slack',
    kind: 'surface',
    status: 'ga',
    summary: 'Marina inside Slack — App Home, modals, the morning brief, and Ask Marina.',
    requires: ['SLACK_CLIENT_ID', 'SLACK_CLIENT_SECRET'],
    isConnected: orgHas((o) => o.slackBotToken),
  },
  {
    id: 'teams',
    name: 'Microsoft Teams',
    kind: 'surface',
    status: 'planned',
    summary: 'Marina inside Teams — Adaptive Cards over the same core (Phase 3).',
    requires: ['TEAMS_APP_ID', 'TEAMS_APP_PASSWORD'],
  },
  {
    id: 'web',
    name: 'Web',
    kind: 'surface',
    status: 'ga',
    summary: 'The MARINA web dashboard — the system of record and deep views.',
    requires: [],
  },
  {
    id: 'agent',
    name: 'Desktop agent',
    kind: 'surface',
    status: 'ga',
    summary: 'The Mac/Windows menu-bar agent — punch in/out, activity, deliverables.',
    requires: [],
  },
]

export function listConnectors(): ConnectorDescriptor[] {
  return CONNECTORS
}

export function getConnector(id: string): ConnectorDescriptor | null {
  return CONNECTORS.find((c) => c.id === id) ?? null
}

const isConfigured = (requires: string[]) => requires.every((k) => !!process.env[k])

/** Resolve every connector's configured + per-org connected state for the hub. */
export async function connectorStates(orgId: number): Promise<ConnectorState[]> {
  return Promise.all(
    CONNECTORS.map(async (c) => ({
      ...c,
      configured: isConfigured(c.requires),
      connected: c.isConnected ? await c.isConnected(orgId) : undefined,
    })),
  )
}
