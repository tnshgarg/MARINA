import { pgTable, serial, text, integer, timestamp, jsonb, index, boolean, uniqueIndex } from 'drizzle-orm/pg-core'

export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  githubId: integer('github_id').notNull().unique(),
  login: text('login').notNull(),
  name: text('name'),
  email: text('email'),
  avatarUrl: text('avatar_url'),
  accessToken: text('access_token'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

export const githubEvents = pgTable(
  'github_events',
  {
    id: serial('id').primaryKey(),
    userId: integer('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    type: text('type').$type<'commit' | 'pr_opened' | 'pr_reviewed' | 'issue_closed'>().notNull(),
    repo: text('repo').notNull(),
    title: text('title').notNull(),
    url: text('url').notNull(),
    externalId: text('external_id').notNull(),
    occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull(),
    raw: jsonb('raw'),
  },
  (t) => ({
    userOccurredIdx: index('github_events_user_occurred_idx').on(t.userId, t.occurredAt),
    externalIdx: index('github_events_external_idx').on(t.userId, t.type, t.externalId),
  })
)

export const narratives = pgTable('narratives', {
  id: serial('id').primaryKey(),
  userId: integer('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  periodStart: timestamp('period_start', { withTimezone: true }).notNull(),
  periodEnd: timestamp('period_end', { withTimezone: true }).notNull(),
  body: text('body').notNull(),
  signal: text('signal').$type<'High' | 'Steady' | 'Low' | 'Blocked'>().notNull(),
  blockers: jsonb('blockers').$type<string[]>().notNull().default([]),
  provider: text('provider').notNull(),
  model: text('model').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

export const orgs = pgTable('orgs', {
  id: serial('id').primaryKey(),
  name: text('name').notNull(),
  ownerId: integer('owner_id').notNull().references(() => users.id, { onDelete: 'restrict' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

export type Role = 'owner' | 'manager' | 'member'

export const memberships = pgTable(
  'memberships',
  {
    id: serial('id').primaryKey(),
    orgId: integer('org_id').notNull().references(() => orgs.id, { onDelete: 'cascade' }),
    userId: integer('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    role: text('role').$type<Role>().notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    orgUserIdx: index('memberships_org_user_idx').on(t.orgId, t.userId),
    userIdx: index('memberships_user_idx').on(t.userId),
  })
)

export const invites = pgTable(
  'invites',
  {
    id: serial('id').primaryKey(),
    orgId: integer('org_id').notNull().references(() => orgs.id, { onDelete: 'cascade' }),
    email: text('email').notNull(),
    role: text('role').$type<Role>().notNull(),
    token: text('token').notNull().unique(),
    invitedBy: integer('invited_by').notNull().references(() => users.id, { onDelete: 'set null' }),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    acceptedAt: timestamp('accepted_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    orgIdx: index('invites_org_idx').on(t.orgId),
    emailIdx: index('invites_email_idx').on(t.email),
  })
)

export const userSettings = pgTable('user_settings', {
  userId: integer('user_id')
    .primaryKey()
    .references(() => users.id, { onDelete: 'cascade' }),
  trackingPausedAt: timestamp('tracking_paused_at', { withTimezone: true }),
  windowTitlesEnabled: boolean('window_titles_enabled').notNull().default(false),
  consentAt: timestamp('consent_at', { withTimezone: true }),
  consentAgentVersion: text('consent_agent_version'),
  consentPolicyVersion: text('consent_policy_version'),
  sampleIntervalSeconds: integer('sample_interval_seconds').notNull().default(30),
  flushIntervalSeconds: integer('flush_interval_seconds').notNull().default(300),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

export const agentTokens = pgTable(
  'agent_tokens',
  {
    id: serial('id').primaryKey(),
    userId: integer('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    tokenHash: text('token_hash').notNull(),
    tokenPrefix: text('token_prefix').notNull(),
    label: text('label').notNull(),
    platform: text('platform').notNull().default('darwin'),
    agentVersion: text('agent_version'),
    pairedAt: timestamp('paired_at', { withTimezone: true }).notNull().defaultNow(),
    lastSeenAt: timestamp('last_seen_at', { withTimezone: true }),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
  },
  (t) => ({
    userIdx: index('agent_tokens_user_idx').on(t.userId),
    tokenHashIdx: uniqueIndex('agent_tokens_hash_idx').on(t.tokenHash),
  })
)

export const pairingCodes = pgTable(
  'pairing_codes',
  {
    id: serial('id').primaryKey(),
    userId: integer('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    codeHash: text('code_hash').notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    consumedAt: timestamp('consumed_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    codeHashIdx: uniqueIndex('pairing_codes_hash_idx').on(t.codeHash),
    userIdx: index('pairing_codes_user_idx').on(t.userId),
  })
)

/**
 * Aggregated activity batch from the agent. The agent samples every 30s and
 * batches into ~5-minute windows before uploading; one row = one window.
 */
export const localActivity = pgTable(
  'local_activity',
  {
    id: serial('id').primaryKey(),
    userId: integer('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    agentTokenId: integer('agent_token_id').references(() => agentTokens.id, { onDelete: 'set null' }),
    windowStart: timestamp('window_start', { withTimezone: true }).notNull(),
    windowEnd: timestamp('window_end', { withTimezone: true }).notNull(),
    activeApp: text('active_app').notNull(),
    activeSeconds: integer('active_seconds').notNull(),
    idleSeconds: integer('idle_seconds').notNull(),
    sampleCount: integer('sample_count').notNull(),
    windowTitle: text('window_title'),
  },
  (t) => ({
    userStartIdx: index('local_activity_user_start_idx').on(t.userId, t.windowStart),
  })
)

export type User = typeof users.$inferSelect
export type NewUser = typeof users.$inferInsert
export type GithubEvent = typeof githubEvents.$inferSelect
export type NewGithubEvent = typeof githubEvents.$inferInsert
export type Narrative = typeof narratives.$inferSelect
export type NewNarrative = typeof narratives.$inferInsert
export type Org = typeof orgs.$inferSelect
export type NewOrg = typeof orgs.$inferInsert
export type Membership = typeof memberships.$inferSelect
export type NewMembership = typeof memberships.$inferInsert
export type Invite = typeof invites.$inferSelect
export type NewInvite = typeof invites.$inferInsert
export type UserSettings = typeof userSettings.$inferSelect
export type NewUserSettings = typeof userSettings.$inferInsert
export type AgentToken = typeof agentTokens.$inferSelect
export type NewAgentToken = typeof agentTokens.$inferInsert
export type PairingCode = typeof pairingCodes.$inferSelect
export type NewPairingCode = typeof pairingCodes.$inferInsert
export type LocalActivity = typeof localActivity.$inferSelect
export type NewLocalActivity = typeof localActivity.$inferInsert
