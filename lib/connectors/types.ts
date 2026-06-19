/**
 * Connector / Surface abstraction — Phase 2 foundation.
 *
 * The thesis from the Slack-centric plan: model every integration as a
 * self-contained CONNECTOR over a stable domain core, so Slack, Teams, the web,
 * the agent, and future data integrations (Jira/Linear/Notion) are all
 * *adapters* — added via the registry, not by surgery on core. This file is the
 * contract; `registry.ts` is the (currently descriptor-level) registry.
 *
 *   - kind 'data'    — pulls signal IN (GitHub commits, Calendar meetings)
 *   - kind 'surface' — renders MARINA + takes actions (Slack, Teams, web, agent)
 *
 * Phase 2 grows this from descriptors into live behaviour (auth/sync/render),
 * and converges the existing web/agent routes onto the shared domain helpers
 * (lib/shifts, lib/breaks, lib/leave, lib/deliverables) that the Slack adapter
 * already uses.
 */
export type ConnectorKind = 'data' | 'surface'
export type ConnectorStatus = 'ga' | 'beta' | 'planned'

export type ConnectorDescriptor = {
  /** Stable id: 'github' | 'slack' | 'calendar' | 'teams' | 'web' | 'agent'. */
  id: string
  name: string
  kind: ConnectorKind
  status: ConnectorStatus
  /** One-line description for the integrations hub. */
  summary: string
  /** Env vars the connector needs configured to function at all. */
  requires: string[]
  /** Whether a given org has this connected (omitted = always-on, e.g. web). */
  isConnected?: (orgId: number) => Promise<boolean>
}

export type ConnectorState = ConnectorDescriptor & {
  /** Resolved per-org connection state (undefined for always-on connectors). */
  connected?: boolean
  /** True when every `requires` env var is present in this deployment. */
  configured: boolean
}
