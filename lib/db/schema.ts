import { pgTable, serial, text, integer, timestamp, jsonb, index, boolean, uniqueIndex, date, primaryKey } from 'drizzle-orm/pg-core'

export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  // GitHub fields — nullable now so email-only users can exist.
  githubId: integer('github_id').unique(),
  login: text('login').notNull(),
  name: text('name'),
  email: text('email').unique(),
  emailVerified: timestamp('email_verified', { withTimezone: true }),
  avatarUrl: text('avatar_url'),
  image: text('image'), // NextAuth standard field name (mirror of avatarUrl when present)
  accessToken: text('access_token'),
  characterKey: text('character_key'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

/* ------------------ NextAuth standard tables (Drizzle adapter) ------------------ */
// Keep these contiguous and named exactly as the adapter expects.

export const accounts = pgTable(
  'account',
  {
    userId: integer('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    type: text('type').notNull(),
    provider: text('provider').notNull(),
    providerAccountId: text('provider_account_id').notNull(),
    refresh_token: text('refresh_token'),
    access_token: text('access_token'),
    expires_at: integer('expires_at'),
    token_type: text('token_type'),
    scope: text('scope'),
    id_token: text('id_token'),
    session_state: text('session_state'),
  },
  (account) => ({
    compoundKey: primaryKey({
      columns: [account.provider, account.providerAccountId],
    }),
  })
)

export const sessions = pgTable('session', {
  sessionToken: text('session_token').notNull().primaryKey(),
  userId: integer('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  expires: timestamp('expires', { withTimezone: true }).notNull(),
})

export const verificationTokens = pgTable(
  'verification_token',
  {
    identifier: text('identifier').notNull(),
    token: text('token').notNull(),
    expires: timestamp('expires', { withTimezone: true }).notNull(),
  },
  (vt) => ({
    compoundKey: primaryKey({ columns: [vt.identifier, vt.token] }),
  })
)

/**
 * Email magic-link sign-in. We hash the token before storage so a DB leak
 * doesn't grant impersonation. 15-minute TTL, single-use.
 */
export const magicLinks = pgTable(
  'magic_links',
  {
    id: serial('id').primaryKey(),
    email: text('email').notNull(),
    tokenHash: text('token_hash').notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    consumedAt: timestamp('consumed_at', { withTimezone: true }),
    requestedIp: text('requested_ip'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    tokenHashIdx: uniqueIndex('magic_links_hash_idx').on(t.tokenHash),
    emailIdx: index('magic_links_email_idx').on(t.email),
  })
)

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
  // Org-wide config
  slackWebhookUrl: text('slack_webhook_url'),
  holidayRegion: text('holiday_region').default('IN'), // ISO + state code: IN, IN-KA, IN-MH, ...
  avatarMode: text('avatar_mode').$type<'hero' | 'photo'>().notNull().default('hero'),
  workdayStartHour: integer('workday_start_hour').notNull().default(9),
  workdayEndHour: integer('workday_end_hour').notNull().default(18),
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

export const screenshots = pgTable(
  'screenshots',
  {
    id: serial('id').primaryKey(),
    userId: integer('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    agentTokenId: integer('agent_token_id').references(() => agentTokens.id, { onDelete: 'set null' }),
    capturedAt: timestamp('captured_at', { withTimezone: true }).notNull(),
    storageKey: text('storage_key'),
    storageDriver: text('storage_driver'),
    displayIndex: integer('display_index').notNull().default(0),
    mime: text('mime').notNull().default('image/jpeg'),
    sizeBytes: integer('size_bytes').notNull().default(0),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (t) => ({
    userCapturedIdx: index('screenshots_user_captured_idx').on(t.userId, t.capturedAt),
    expiresIdx: index('screenshots_expires_idx').on(t.expiresAt),
  })
)

export type ShotAppCategory = 'ide' | 'design' | 'comms' | 'browser_work' | 'browser_personal' | 'media' | 'unknown'
export type ShotWorkLabel = 'work' | 'non_work' | 'ambiguous'
export type ShotContentHint =
  | 'code_editing'
  | 'design_canvas'
  | 'reading_docs'
  | 'chat'
  | 'video_streaming'
  | 'social_media'
  | 'static_idle'
  | 'other'

export const shotAnalyses = pgTable(
  'shot_analyses',
  {
    id: serial('id').primaryKey(),
    screenshotId: integer('screenshot_id').notNull().unique().references(() => screenshots.id, { onDelete: 'cascade' }),
    userId: integer('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    workAppLabel: text('work_app_label').$type<ShotWorkLabel>().notNull(),
    appCategory: text('app_category').$type<ShotAppCategory>().notNull(),
    visibleContentHint: text('visible_content_hint').$type<ShotContentHint>().notNull(),
    confidence: integer('confidence').notNull().default(0),
    progressScore: integer('progress_score').notNull().default(0),
    provider: text('provider').notNull(),
    model: text('model').notNull(),
    rawJson: jsonb('raw_json'),
    analyzedAt: timestamp('analyzed_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    userAnalyzedIdx: index('shot_analyses_user_analyzed_idx').on(t.userId, t.analyzedAt),
  })
)

export const shotConsents = pgTable('shot_consents', {
  id: serial('id').primaryKey(),
  userId: integer('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  consentedAt: timestamp('consented_at', { withTimezone: true }).notNull().defaultNow(),
  agentVersion: text('agent_version'),
  policyVersion: text('policy_version').notNull(),
  ip: text('ip'),
})

export type DailyState =
  | 'High'
  | 'Steady'
  | 'Blocked'
  | 'Disengaged'
  | 'PossiblyDummying'
  | 'NoData'

export const dailyStates = pgTable(
  'daily_states',
  {
    id: serial('id').primaryKey(),
    userId: integer('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    day: text('day').notNull(), // YYYY-MM-DD UTC
    state: text('state').$type<DailyState>().notNull(),
    outputCount: integer('output_count').notNull().default(0),
    onlineSeconds: integer('online_seconds').notNull().default(0),
    focusWorkRatio: integer('focus_work_ratio').notNull().default(0), // 0..100
    staticIdleRuns: integer('static_idle_runs').notNull().default(0),
    reason: text('reason').notNull().default(''),
    computedAt: timestamp('computed_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    userDayIdx: uniqueIndex('daily_states_user_day_idx').on(t.userId, t.day),
  })
)

/**
 * Active "I'm taking a break" entries. End time is null while the break is
 * ongoing — at most one ongoing break per user (enforced at the application
 * layer; we treat that as a single source of truth).
 */
export const breaks = pgTable(
  'breaks',
  {
    id: serial('id').primaryKey(),
    userId: integer('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    orgId: integer('org_id').references(() => orgs.id, { onDelete: 'set null' }),
    startedAt: timestamp('started_at', { withTimezone: true }).notNull().defaultNow(),
    endedAt: timestamp('ended_at', { withTimezone: true }),
    reason: text('reason').notNull(),
  },
  (t) => ({
    userActiveIdx: index('breaks_user_active_idx').on(t.userId, t.endedAt),
    orgRecentIdx: index('breaks_org_recent_idx').on(t.orgId, t.startedAt),
  })
)

export type LeaveStatus = 'pending' | 'approved' | 'denied' | 'cancelled'
export type LeaveType =
  | 'sick'
  | 'casual'
  | 'earned'
  | 'maternity'
  | 'paternity'
  | 'bereavement'
  | 'compoff'
  | 'unpaid'
  | 'other'

export const LEAVE_TYPE_LABELS: Record<LeaveType, string> = {
  sick: 'Sick Leave',
  casual: 'Casual Leave',
  earned: 'Earned / Privileged Leave',
  maternity: 'Maternity Leave',
  paternity: 'Paternity Leave',
  bereavement: 'Bereavement Leave',
  compoff: 'Compensatory Off',
  unpaid: 'Unpaid Leave',
  other: 'Other',
}

export type ShiftVerificationStatus = 'unverified' | 'verified' | 'suspect' | 'skipped'

/**
 * A shift is one "punched-in" session per employee per day. The agent enables
 * tracking only between punchedInAt and punchedOutAt. The work summary at
 * punch-out is verified against the actual telemetry by the AI provider.
 */
export const shifts = pgTable(
  'shifts',
  {
    id: serial('id').primaryKey(),
    userId: integer('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    orgId: integer('org_id').references(() => orgs.id, { onDelete: 'set null' }),
    punchedInAt: timestamp('punched_in_at', { withTimezone: true }).notNull().defaultNow(),
    punchedInVia: text('punched_in_via').notNull().default('agent'), // 'agent' | 'web'
    punchedOutAt: timestamp('punched_out_at', { withTimezone: true }),
    punchedOutVia: text('punched_out_via'),
    workSummary: text('work_summary'),
    verificationStatus: text('verification_status')
      .$type<ShiftVerificationStatus>()
      .notNull()
      .default('unverified'),
    /** 0-100, AI's confidence that summary matches telemetry */
    verificationScore: integer('verification_score'),
    verificationNotes: text('verification_notes'),
    verificationProvider: text('verification_provider'),
    verifiedAt: timestamp('verified_at', { withTimezone: true }),
  },
  (t) => ({
    userActiveIdx: index('shifts_user_active_idx').on(t.userId, t.punchedOutAt),
    orgRecentIdx: index('shifts_org_recent_idx').on(t.orgId, t.punchedInAt),
  })
)

/**
 * Audit log for every privileged action performed in the org. Enterprise
 * customers will demand a trail. We keep it append-only.
 */
export type StoryScene = {
  startAt: string
  endAt: string
  kind: 'shift_start' | 'shift_end' | 'meeting' | 'coding' | 'design' | 'comms' | 'reading' | 'browsing' | 'media' | 'break' | 'leave' | 'idle' | 'mixed' | 'unknown'
  label: string
  detail?: string
  evidence: {
    topApp?: string | null
    activeSeconds?: number
    idleSeconds?: number
    githubEvents?: number
    screenshotLabels?: Record<string, number>
    breakReason?: string
  }
}

/**
 * AI-generated story for a single user-day. Combines screenshots, local
 * activity, shifts, breaks, leaves, and GitHub events into an ordered
 * timeline of scenes + a prose narrative.
 */
export const dailyStories = pgTable(
  'daily_stories',
  {
    id: serial('id').primaryKey(),
    userId: integer('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    day: date('day').notNull(),
    narrative: text('narrative').notNull(),
    scenes: jsonb('scenes').$type<StoryScene[]>().notNull(),
    provider: text('provider').notNull(),
    model: text('model').notNull(),
    generatedAt: timestamp('generated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    userDayIdx: uniqueIndex('daily_stories_user_day_idx').on(t.userId, t.day),
  })
)

export const auditLogs = pgTable(
  'audit_logs',
  {
    id: serial('id').primaryKey(),
    orgId: integer('org_id').references(() => orgs.id, { onDelete: 'cascade' }),
    actorUserId: integer('actor_user_id').references(() => users.id, { onDelete: 'set null' }),
    action: text('action').notNull(), // e.g. 'leave.decided', 'member.removed'
    targetType: text('target_type'),  // 'user' | 'membership' | 'leave' | 'device' | 'org'
    targetId: integer('target_id'),
    payload: jsonb('payload'),
    ip: text('ip'),
    userAgent: text('user_agent'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    orgRecentIdx: index('audit_logs_org_recent_idx').on(t.orgId, t.createdAt),
    actionIdx: index('audit_logs_action_idx').on(t.action),
  })
)

/**
 * Public holiday calendar — per region. We pre-seed India national + major state
 * holidays so customers can flip a switch to enable them.
 */
export const holidays = pgTable(
  'holidays',
  {
    id: serial('id').primaryKey(),
    orgId: integer('org_id').references(() => orgs.id, { onDelete: 'cascade' }),
    region: text('region').notNull().default('IN'),
    date: date('date').notNull(),
    name: text('name').notNull(),
    isOptional: boolean('is_optional').notNull().default(false),
  },
  (t) => ({
    orgDateIdx: index('holidays_org_date_idx').on(t.orgId, t.date),
    regionDateIdx: index('holidays_region_date_idx').on(t.region, t.date),
  })
)

/**
 * Leave / time-off requests. Status starts at 'pending'. Owner/manager of the
 * org decides; cancellation is the employee themselves (only while pending).
 */
export const leaveRequests = pgTable(
  'leave_requests',
  {
    id: serial('id').primaryKey(),
    userId: integer('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    orgId: integer('org_id').notNull().references(() => orgs.id, { onDelete: 'cascade' }),
    startDate: date('start_date').notNull(), // inclusive
    endDate: date('end_date').notNull(),     // inclusive
    leaveType: text('leave_type').$type<LeaveType>().notNull().default('casual'),
    reason: text('reason').notNull(),
    status: text('status').$type<LeaveStatus>().notNull().default('pending'),
    decidedAt: timestamp('decided_at', { withTimezone: true }),
    decidedBy: integer('decided_by').references(() => users.id, { onDelete: 'set null' }),
    decidedNote: text('decided_note'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    orgStatusIdx: index('leave_requests_org_status_idx').on(t.orgId, t.status),
    userIdx: index('leave_requests_user_idx').on(t.userId),
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
export type Screenshot = typeof screenshots.$inferSelect
export type NewScreenshot = typeof screenshots.$inferInsert
export type ShotAnalysis = typeof shotAnalyses.$inferSelect
export type NewShotAnalysis = typeof shotAnalyses.$inferInsert
export type ShotConsent = typeof shotConsents.$inferSelect
export type NewShotConsent = typeof shotConsents.$inferInsert
export type DailyStateRow = typeof dailyStates.$inferSelect
export type NewDailyStateRow = typeof dailyStates.$inferInsert
export type Break = typeof breaks.$inferSelect
export type NewBreak = typeof breaks.$inferInsert
export type LeaveRequest = typeof leaveRequests.$inferSelect
export type NewLeaveRequest = typeof leaveRequests.$inferInsert
export type Shift = typeof shifts.$inferSelect
export type NewShift = typeof shifts.$inferInsert
export type DailyStory = typeof dailyStories.$inferSelect
export type NewDailyStory = typeof dailyStories.$inferInsert
export type AuditLog = typeof auditLogs.$inferSelect
export type NewAuditLog = typeof auditLogs.$inferInsert
export type Holiday = typeof holidays.$inferSelect
export type NewHoliday = typeof holidays.$inferInsert
