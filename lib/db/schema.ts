import { pgTable, serial, text, integer, timestamp, jsonb, index, boolean, uniqueIndex, date, primaryKey } from 'drizzle-orm/pg-core'
import { sql } from 'drizzle-orm'

export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  // GitHub fields — nullable now so email-only users can exist.
  githubId: integer('github_id').unique(),
  login: text('login').notNull(),
  // The employee's GitHub *username* for attribution, captured at invite-accept
  // (or self-set in settings). Distinct from `login` (the in-app @handle, which
  // is email-derived for non-GitHub sign-ins). Because the org installs the
  // GitHub App, this username alone is enough to attribute their commits/PRs —
  // no per-employee OAuth needed. Matched case-insensitively in app-sync.
  githubLogin: text('github_login'),
  name: text('name'),
  email: text('email').unique(),
  emailVerified: timestamp('email_verified', { withTimezone: true }),
  avatarUrl: text('avatar_url'),
  image: text('image'), // NextAuth standard field name (mirror of avatarUrl when present)
  accessToken: text('access_token'),
  characterKey: text('character_key'),
  // GitHub sync state — null = never synced
  lastSyncedAt: timestamp('last_synced_at', { withTimezone: true }),
  lastSyncError: text('last_sync_error'),
  // People-care fields. Birthday is stored as MM-DD (year ignored on purpose
  // — nobody wants to surface age). joinedOn is the actual joining date,
  // used to compute work anniversaries.
  birthdayMmDd: text('birthday_mm_dd'),     // e.g. "07-24"
  joinedOn: text('joined_on'),              // ISO date "2024-01-15"
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
    // Unique so the sync can UPSERT — a PR's status (open→merged) and a review's
    // verdict change over time, and we refresh the existing row instead of
    // either duplicating it or leaving it stale.
    externalIdx: uniqueIndex('github_events_external_uq').on(t.userId, t.type, t.externalId),
  })
)

export const narratives = pgTable(
  'narratives',
  {
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
  },
  (t) => ({
    // Reading "latest narrative for user X" is hot — index for it.
    userCreatedIdx: index('narratives_user_created_idx').on(t.userId, t.createdAt),
  }),
)

export type Plan = 'free' | 'team' | 'scale'

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
  /**
   * IANA timezone identifier (e.g. "Asia/Kolkata"). Used for day-boundary
   * computation so end-of-day work in IST doesn't get bucketed under UTC's
   * tomorrow. Defaults to Asia/Kolkata since MARINA is India-first.
   */
  timezone: text('timezone').notNull().default('Asia/Kolkata'),
  // Billing — plan, seat cap, trial. Stripe/Razorpay IDs nullable until connected.
  plan: text('plan').$type<Plan>().notNull().default('free'),
  seatsPurchased: integer('seats_purchased').notNull().default(5),
  trialEndsAt: timestamp('trial_ends_at', { withTimezone: true }),
  billingProvider: text('billing_provider'), // 'razorpay' | 'stripe' | null
  billingCustomerId: text('billing_customer_id'),
  billingSubscriptionId: text('billing_subscription_id'),
  // AI-cost ceiling per calendar month (cents-of-USD). 0 = no spend allowed.
  monthlyAiBudgetCents: integer('monthly_ai_budget_cents').notNull().default(5000),
  /**
   * Annual paid-leave quota per leave type, in days. Drives the leave-balance
   * UI (remaining = quota − approved-this-year). Null/empty = use
   * DEFAULT_LEAVE_POLICY. HR edits this in Settings → Workspace.
   */
  leavePolicy: jsonb('leave_policy').$type<Record<string, number>>(),
  /**
   * Blended hourly people-cost in INR, used to turn logged hours into a rupee
   * figure in the CEO digest / dashboard. Optional — cost cards hide when null.
   */
  costPerHourInr: integer('cost_per_hour_inr'),
  /**
   * GitHub organisations whose activity the org wants to track. When set,
   * the sync filter EXCLUDES events from any repo whose owner isn't in this
   * list — so an employee's open-source contributions to unrelated orgs
   * stay private. Empty list = track everything (legacy behaviour).
   *
   * Format: lowercased GitHub org/user logins, e.g. ["acme", "acme-labs"].
   */
  trackedGithubOrgs: jsonb('tracked_github_orgs').$type<string[]>().notNull().default([]),
  /**
   * GitHub App installation id for this workspace. When the org admin installs
   * the MARINA GitHub App and selects repos, GitHub gives us an installation
   * we authenticate as (server-side, no per-user token) to read those repos'
   * commits + PRs. This is the RELIABLE path for private org repos.
   */
  githubInstallationId: integer('github_installation_id'),
  /**
   * Slack workspace install state. We support TWO modes side by side:
   *   1. Legacy: `slackWebhookUrl` posts to one channel only (kept for orgs
   *      who configured it before we shipped the OAuth app).
   *   2. Bot install: storing `slackBotToken` unlocks DM-to-user (so a
   *      manager gets pinged personally for a leave request, not just in
   *      the team channel), slash commands, and `users.lookupByEmail` for
   *      auto-resolving every employee's Slack ID with no per-user OAuth.
   *
   * `slackDefaultChannelId` is where org-wide announcements go ("@arjun
   * is on leave today"); per-person events DM the actor directly.
   */
  /**
   * Optional org logo. When set, replaces the brand mark in the sidebar
   * header for this workspace only. Stored as a public URL — either a
   * Vercel Blob URL in production or a /api/uploads/* path in local
   * mode (served by the read-through API route below).
   */
  logoUrl: text('logo_url'),
  slackTeamId: text('slack_team_id'),
  slackTeamName: text('slack_team_name'),
  slackBotToken: text('slack_bot_token'),
  slackBotUserId: text('slack_bot_user_id'),
  slackDefaultChannelId: text('slack_default_channel_id'),
  /** Where standup / scrum posts go. Falls back to slackDefaultChannelId. */
  slackScrumChannelId: text('slack_scrum_channel_id'),
  slackInstalledAt: timestamp('slack_installed_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

/**
 * Workspace role.
 *
 *   admin   — full org access. Can manage members, integrations, billing,
 *             see every team's data. Multiple admins per org is supported
 *             and encouraged (previously this was "owner" — singular).
 *   manager — team-scoped access. Sees only their direct/indirect reports
 *             + members of teams they manage. Cannot see other teams.
 *   lead    — same scope as manager, lighter signalling. Reserved.
 *   member  — self-only. Sees their own dashboard, breaks, deliverables.
 *
 * The DB still has rows with role='owner' from before this rename — the
 * migration in `scripts/db-apply-pending.ts` flips them to 'admin'.
 */
export type Role = 'admin' | 'manager' | 'lead' | 'member'

/**
 * Functional discipline of the person inside the org. Drives which signals
 * the UI surfaces: engineers see commit/PR counts, designers see file-edit
 * activity, sales sees calls/deals, support sees tickets closed, etc.
 *
 * We default everyone to 'other' so legacy memberships still render in a
 * generic but useful way (hours worked, focus time, meetings, deliverables).
 */
export type Discipline =
  | 'engineering'
  | 'design'
  | 'product'
  | 'sales'
  | 'support'
  | 'marketing'
  | 'ops'
  | 'hr'
  | 'finance'
  | 'exec'
  | 'other'

export const DISCIPLINE_LABEL: Record<Discipline, string> = {
  engineering: 'Engineering',
  design: 'Design',
  product: 'Product',
  sales: 'Sales',
  support: 'Customer Support',
  marketing: 'Marketing',
  ops: 'Operations',
  hr: 'People / HR',
  finance: 'Finance',
  exec: 'Leadership',
  other: 'Other',
}

/** What "shipped" means for each discipline. Used as the deliverables label. */
export const DISCIPLINE_DELIVERABLE: Record<Discipline, string> = {
  engineering: 'PRs & commits',
  design: 'designs & reviews',
  product: 'docs & specs',
  sales: 'deals & calls',
  support: 'tickets resolved',
  marketing: 'campaigns & posts',
  ops: 'tasks completed',
  hr: 'cases handled',
  finance: 'reports filed',
  exec: 'decisions logged',
  other: 'deliverables',
}

export const memberships = pgTable(
  'memberships',
  {
    id: serial('id').primaryKey(),
    orgId: integer('org_id').notNull().references(() => orgs.id, { onDelete: 'cascade' }),
    userId: integer('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    role: text('role').$type<Role>().notNull(),
    /**
     * Functional discipline — engineering / design / sales / support / etc.
     * Drives the role-aware UI. Defaults to 'other' for legacy rows.
     */
    discipline: text('discipline').$type<Discipline>().notNull().default('other'),
    /** Optional free-text title — "Senior Frontend", "Account Executive", … */
    jobTitle: text('job_title'),
    /**
     * Granular capabilities the owner has explicitly granted to this person
     * on TOP of their base role. Lets the corporate hierarchy work without
     * giving every manager full owner rights. Owners always have all caps
     * implicitly (we never read this column for them).
     *
     * See `lib/auth/capabilities.ts` for the canonical list.
     */
    extraCaps: jsonb('extra_caps').$type<string[]>().notNull().default([]),
    /**
     * Reporting line — who this person reports to inside the org. Optional;
     * a flat team leaves this null. Drives "your reports" filtered views.
     */
    reportsToMembershipId: integer('reports_to_membership_id'),
    /**
     * Per-employee working days. Bitmap: index 0=Sunday, 6=Saturday. Default
     * Mon–Fri. Drives attendance "weekend vs absent" classification per
     * person instead of org-wide.
     */
    workingDays: jsonb('working_days').$type<boolean[]>().notNull().default([
      false, true, true, true, true, true, false,
    ]),
    /**
     * Slack identity for this employee inside this org's Slack workspace.
     * Resolved automatically via `users.lookupByEmail` after the org installs
     * the bot — the employee never has to do a separate OAuth. Used to DM
     * the actual person (not just the team channel) for events that affect
     * them personally: leave decisions, blocker-help asks, work-anniversary
     * call-outs.
     */
    slackUserId: text('slack_user_id'),
    slackResolvedAt: timestamp('slack_resolved_at', { withTimezone: true }),
    /**
     * When the member was removed (soft-delete). Reads scoped to org should
     * filter events to `occurredAt BETWEEN createdAt AND COALESCE(endedAt, now())`
     * so a user in two orgs doesn't leak data across them.
     */
    endedAt: timestamp('ended_at', { withTimezone: true }),
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
    /**
     * Discipline assigned at invite-time so the new teammate immediately gets
     * the role-appropriate UI on first sign-in. Manager can re-assign later
     * from the Profile tab of the member modal.
     */
    discipline: text('discipline').$type<Discipline>().notNull().default('other'),
    jobTitle: text('job_title'),
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

export type BreakCategory =
  | 'focus'      // heads-down focus, do not disturb
  | 'meeting'    // in a meeting
  | 'blocked'    // waiting on someone / something
  | 'lunch'      // lunch / meal
  | 'errand'     // short personal errand, walking out
  | 'personal'   // generic personal time
  | 'other'

export const BREAK_CATEGORY_LABELS: Record<BreakCategory, string> = {
  focus: 'Focus time',
  meeting: 'In a meeting',
  blocked: 'Blocked / Waiting',
  lunch: 'Lunch / Meal',
  errand: 'Quick errand',
  personal: 'Personal',
  other: 'Other',
}

/**
 * "I'm pausing tracking" entries. End time is null while the pause is
 * ongoing — at most one ongoing pause per user (enforced at the application
 * layer; we treat that as a single source of truth).
 *
 * Categories let us surface *why* — and `waitingOnUserId` / `waitingOnExternal`
 * power the manager's "who's blocked, on whom?" view.
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
    category: text('category').$type<BreakCategory>().notNull().default('other'),
    // When category = 'blocked', who are they waiting on?
    waitingOnUserId: integer('waiting_on_user_id').references(() => users.id, { onDelete: 'set null' }),
    waitingOnExternal: text('waiting_on_external'), // free-text: "Acme client", "Stripe support"
    // Optional: when the user thinks they'll be back ("Back in 30m")
    expectedEndAt: timestamp('expected_end_at', { withTimezone: true }),
    /**
     * Blocker-resolver fields. When a manager resolves a blocker on the
     * employee's behalf (rather than the employee ending it themselves), we
     * stamp who did it, when, with what note, and how. This powers the
     * "average time to unblock" metric and the resolution history thread.
     */
    resolvedByUserId: integer('resolved_by_user_id').references(() => users.id, { onDelete: 'set null' }),
    resolutionNote: text('resolution_note'),
    /** 'unblocked' | 'workaround' | 'cancelled' | 'self' (employee ended). */
    resolutionType: text('resolution_type'),
  },
  (t) => ({
    userActiveIdx: index('breaks_user_active_idx').on(t.userId, t.endedAt),
    orgRecentIdx: index('breaks_org_recent_idx').on(t.orgId, t.startedAt),
    waitingOnIdx: index('breaks_waiting_on_idx').on(t.waitingOnUserId, t.endedAt),
  })
)

/**
 * Discussion thread on a blocker — every nudge, suggestion or status update
 * the manager sends gets logged here so the resolution is auditable and the
 * blocked employee sees the full history when they come back.
 */
export const blockerThread = pgTable(
  'blocker_thread',
  {
    id: serial('id').primaryKey(),
    breakId: integer('break_id').notNull().references(() => breaks.id, { onDelete: 'cascade' }),
    authorUserId: integer('author_user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    kind: text('kind').$type<'nudge' | 'suggestion' | 'note' | 'resolution'>().notNull(),
    body: text('body').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    breakIdx: index('blocker_thread_break_idx').on(t.breakId, t.createdAt),
  }),
)

export type BlockerThreadEntry = typeof blockerThread.$inferSelect
export type NewBlockerThreadEntry = typeof blockerThread.$inferInsert

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
    // Race-condition guard: at most one open shift per user. Partial unique
    // index, only enforces uniqueness when punched_out_at IS NULL. Two
    // simultaneous punch-in requests will now have ONE succeed and the other
    // fail with a unique-violation, instead of creating two open shifts.
    oneOpenPerUser: uniqueIndex('shifts_one_open_per_user_idx')
      .on(t.userId)
      .where(sql`${t.punchedOutAt} IS NULL`),
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
    // SET NULL not CASCADE — DPDP / SOC2 require we retain the decision history
    // after an org is deleted. Trail survives; org reference becomes orphaned.
    orgId: integer('org_id').references(() => orgs.id, { onDelete: 'set null' }),
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

/**
 * Calendar events synced from a user's Google Calendar. We pull the next 7
 * days of events on connect and refresh periodically. Attendance is derived
 * by overlapping the event window with `localActivity` rows where the active
 * app is a known video-call app, or fall back to "self-reported present" via
 * a manual mark.
 */
export const meetings = pgTable(
  'meetings',
  {
    id: serial('id').primaryKey(),
    userId: integer('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    provider: text('provider').notNull().default('google'),
    externalId: text('external_id').notNull(), // Google event id
    calendarId: text('calendar_id').notNull(),
    title: text('title').notNull(),
    description: text('description'),
    location: text('location'),
    conferenceUrl: text('conference_url'), // hangoutLink / Zoom link if surfaced
    startAt: timestamp('start_at', { withTimezone: true }).notNull(),
    endAt: timestamp('end_at', { withTimezone: true }).notNull(),
    organizerEmail: text('organizer_email'),
    attendees: jsonb('attendees').$type<string[]>().notNull().default([]),
    rsvpStatus: text('rsvp_status'), // accepted | tentative | declined | needsAction
    attendedAt: timestamp('attended_at', { withTimezone: true }), // when MARINA confirmed presence
    syncedAt: timestamp('synced_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    userStartIdx: index('meetings_user_start_idx').on(t.userId, t.startAt),
    externalIdx: uniqueIndex('meetings_external_idx').on(t.userId, t.provider, t.externalId),
  }),
)

export type Meeting = typeof meetings.$inferSelect
export type NewMeeting = typeof meetings.$inferInsert

/**
 * Per-day record of which teammates the scrum master has marked "covered"
 * during a live standup. Scoped to (org, day) so each morning's session
 * starts fresh. Coverage doesn't auto-expire — managers can revisit the
 * Scrum page later in the day and pick up where they left off.
 */
export const scrumCoverage = pgTable(
  'scrum_coverage',
  {
    id: serial('id').primaryKey(),
    orgId: integer('org_id').notNull().references(() => orgs.id, { onDelete: 'cascade' }),
    coveredUserId: integer('covered_user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    day: date('day').notNull(),
    coveredByUserId: integer('covered_by_user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    coveredAt: timestamp('covered_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    orgDayUserIdx: uniqueIndex('scrum_coverage_org_day_user_idx').on(t.orgId, t.day, t.coveredUserId),
  }),
)

export type ScrumCoverage = typeof scrumCoverage.$inferSelect
export type NewScrumCoverage = typeof scrumCoverage.$inferInsert

/**
 * Per-org per-month AI spend ledger. Every vision / story / narrative call
 * appends a row. The budget gatekeeper sums the current month and refuses
 * new spend once monthlyAiBudgetCents is reached.
 */
export const aiSpend = pgTable(
  'ai_spend',
  {
    id: serial('id').primaryKey(),
    orgId: integer('org_id').references(() => orgs.id, { onDelete: 'cascade' }),
    userId: integer('user_id').references(() => users.id, { onDelete: 'set null' }),
    kind: text('kind').notNull(), // 'vision' | 'story' | 'narrative' | 'verify_shift'
    provider: text('provider').notNull(),
    model: text('model').notNull(),
    inputTokens: integer('input_tokens').notNull().default(0),
    outputTokens: integer('output_tokens').notNull().default(0),
    imageCount: integer('image_count').notNull().default(0),
    costCents: integer('cost_cents').notNull(), // estimated cost in cents-of-USD
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    orgCreatedIdx: index('ai_spend_org_created_idx').on(t.orgId, t.createdAt),
  }),
)
export type AiSpend = typeof aiSpend.$inferSelect
export type NewAiSpend = typeof aiSpend.$inferInsert

/**
 * In-app notifications for end-users (bell icon). Notifications are also
 * fanned out via Slack/email by lib/notify/send.ts — the inbox is the
 * everybody-gets-this channel that doesn't depend on external integrations.
 */
export const notifications = pgTable(
  'notifications',
  {
    id: serial('id').primaryKey(),
    userId: integer('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    orgId: integer('org_id').references(() => orgs.id, { onDelete: 'cascade' }),
    kind: text('kind').notNull(), // 'leave.decided', 'blocker.pinged', 'break.checkin', ...
    title: text('title').notNull(),
    body: text('body'),
    href: text('href'), // relative URL the bell click should open
    readAt: timestamp('read_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    userCreatedIdx: index('notifications_user_created_idx').on(t.userId, t.createdAt),
    userUnreadIdx: index('notifications_user_unread_idx').on(t.userId, t.readAt),
  }),
)
export type Notification = typeof notifications.$inferSelect
export type NewNotification = typeof notifications.$inferInsert

/**
 * Rate-limit ledger for sensitive endpoints (magic-link issue, pairing-code
 * generate). One row per call; cleanup via cron sweep.
 */
export const rateLimitEvents = pgTable(
  'rate_limit_events',
  {
    id: serial('id').primaryKey(),
    bucket: text('bucket').notNull(), // 'magic_link:<email>', 'pair_code:<userId>', ...
    occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    bucketOccurredIdx: index('rate_limit_bucket_occurred_idx').on(t.bucket, t.occurredAt),
  }),
)

/**
 * Resumable-cursor state for jobs that can't finish in a single Vercel
 * function invocation. Story-generation cron writes its progress here so
 * the next invocation picks up where it left off.
 */
export const jobCursors = pgTable('job_cursors', {
  job: text('job').primaryKey(), // e.g. 'stories:yesterday'
  cursor: text('cursor').notNull(), // opaque JSON
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

export type User = typeof users.$inferSelect
export type NewUser = typeof users.$inferInsert
export type GithubEvent = typeof githubEvents.$inferSelect
export type NewGithubEvent = typeof githubEvents.$inferInsert
export type Narrative = typeof narratives.$inferSelect
export type NewNarrative = typeof narratives.$inferInsert
export type Org = typeof orgs.$inferSelect
export type NewOrg = typeof orgs.$inferInsert
/**
 * Self-reported work items — designers, salespeople, ops folks need a way
 * to log "I shipped X today" since they don't have a GitHub feed. Each row
 * is one deliverable, optionally pointing at a URL (Figma file, Notion doc,
 * deal, ticket). The manager sees these in the Activity tab regardless of
 * the employee's discipline.
 *
 * Verification: the row can pin a screenshot timestamp. The existing screen-
 * monitor pipeline can then cross-check that the user really was on the
 * tool they claimed at that time — non-intrusively, no extra work for the
 * employee.
 */
export const deliverables = pgTable(
  'deliverables',
  {
    id: serial('id').primaryKey(),
    userId: integer('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    orgId: integer('org_id').references(() => orgs.id, { onDelete: 'set null' }),
    title: text('title').notNull(),
    detail: text('detail'),
    url: text('url'),
    /** Free-text, e.g. "design" / "deal" / "ticket" / "doc". Optional. */
    kind: text('kind'),
    /** When the work was actually completed (defaults to row creation time). */
    completedAt: timestamp('completed_at', { withTimezone: true }).notNull().defaultNow(),
    /** Optional pin to a screenshot/shot_analysis at the time of completion. */
    pinnedShotAt: timestamp('pinned_shot_at', { withTimezone: true }),
    verificationStatus: text('verification_status')
      .$type<'unverified' | 'verified' | 'mismatch'>()
      .notNull()
      .default('unverified'),
    verificationNotes: text('verification_notes'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    userCompletedIdx: index('deliverables_user_completed_idx').on(t.userId, t.completedAt),
    orgRecentIdx: index('deliverables_org_recent_idx').on(t.orgId, t.completedAt),
  }),
)

export type Membership = typeof memberships.$inferSelect
export type NewMembership = typeof memberships.$inferInsert
export type Deliverable = typeof deliverables.$inferSelect
export type NewDeliverable = typeof deliverables.$inferInsert

/**
 * Internal meeting scheduled by a manager from inside MARINA. We always
 * store the record so the 1:1 cadence is auditable. When the organiser
 * has Google Calendar connected, we ALSO push the event to Google so
 * both calendars are in sync; otherwise the row is the source of truth
 * and we just notify the attendee in-app.
 */
export const scheduledMeetings = pgTable(
  'scheduled_meetings',
  {
    id: serial('id').primaryKey(),
    orgId: integer('org_id').notNull().references(() => orgs.id, { onDelete: 'cascade' }),
    organiserUserId: integer('organiser_user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    attendeeUserId: integer('attendee_user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    agenda: text('agenda'),
    startAt: timestamp('start_at', { withTimezone: true }).notNull(),
    endAt: timestamp('end_at', { withTimezone: true }).notNull(),
    googleEventId: text('google_event_id'),
    conferenceUrl: text('conference_url'),
    cancelledAt: timestamp('cancelled_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    organiserIdx: index('scheduled_meetings_organiser_idx').on(t.organiserUserId, t.startAt),
    attendeeIdx: index('scheduled_meetings_attendee_idx').on(t.attendeeUserId, t.startAt),
    orgIdx: index('scheduled_meetings_org_idx').on(t.orgId, t.startAt),
  }),
)

export type ScheduledMeeting = typeof scheduledMeetings.$inferSelect
export type NewScheduledMeeting = typeof scheduledMeetings.$inferInsert

/**
 * Early-bird promotional codes. We seed these manually for design partners
 * and the first ~50 organisations who sign up. A code is a short uppercased
 * string ("MARINA50", "FOUNDERS24") and either
 *   - upgrades the redeeming org to a paid plan for `durationDays` days, or
 *   - waives all charges forever (`durationDays = null` = lifetime grant).
 *
 * Codes have a redemption cap (defaults to 1) and an optional hard expiry
 * date after which they can't be redeemed even if seats remain. Each
 * (codeId, orgId) pair is unique — an org can't double-spend the same code.
 */
export const earlyBirdCodes = pgTable(
  'early_bird_codes',
  {
    id: serial('id').primaryKey(),
    code: text('code').notNull().unique(),
    plan: text('plan').$type<Plan>().notNull().default('team'),
    /** Days the grant lasts after redemption. Null = lifetime / "forever". */
    durationDays: integer('duration_days'),
    maxRedemptions: integer('max_redemptions').notNull().default(1),
    usedCount: integer('used_count').notNull().default(0),
    /** Hard expiry — code can't be redeemed after this even if cap not hit. */
    expiresAt: timestamp('expires_at', { withTimezone: true }),
    isActive: boolean('is_active').notNull().default(true),
    notes: text('notes'),
    createdByUserId: integer('created_by_user_id').references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    activeIdx: index('early_bird_codes_active_idx').on(t.isActive, t.expiresAt),
  }),
)

export const earlyBirdRedemptions = pgTable(
  'early_bird_redemptions',
  {
    id: serial('id').primaryKey(),
    codeId: integer('code_id').notNull().references(() => earlyBirdCodes.id, { onDelete: 'cascade' }),
    orgId: integer('org_id').notNull().references(() => orgs.id, { onDelete: 'cascade' }),
    redeemedByUserId: integer('redeemed_by_user_id').notNull().references(() => users.id, { onDelete: 'set null' }),
    grantedPlan: text('granted_plan').$type<Plan>().notNull(),
    /** Null = lifetime; otherwise the moment the grant lapses. */
    grantExpiresAt: timestamp('grant_expires_at', { withTimezone: true }),
    redeemedAt: timestamp('redeemed_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    uniqOrgPerCode: uniqueIndex('early_bird_redemptions_code_org_uniq').on(t.codeId, t.orgId),
    orgIdx: index('early_bird_redemptions_org_idx').on(t.orgId),
  }),
)

export type EarlyBirdCode = typeof earlyBirdCodes.$inferSelect
export type NewEarlyBirdCode = typeof earlyBirdCodes.$inferInsert
export type EarlyBirdRedemption = typeof earlyBirdRedemptions.$inferSelect
export type NewEarlyBirdRedemption = typeof earlyBirdRedemptions.$inferInsert

/**
 * Teams — sub-groups inside an org. Optional structure for HR to organise
 * the team chart without forcing every employee into a tree: a team has a
 * manager (a single membership) and N members (m:n via team_members),
 * and one person can be in multiple teams (eg. Design + Marketing).
 *
 * Membership-level uniqueness (org_id, team_id, membership_id) means we
 * can attach team-scoped permissions in the future without backfilling.
 */
export const teams = pgTable(
  'teams',
  {
    id: serial('id').primaryKey(),
    orgId: integer('org_id').notNull().references(() => orgs.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    description: text('description'),
    /** Manager of this team — the lead. Optional (some teams are flat). */
    managerMembershipId: integer('manager_membership_id'),
    /** Hex color for visual differentiation in the chart. */
    color: text('color'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    orgIdx: index('teams_org_idx').on(t.orgId, t.name),
  }),
)

export const teamMembers = pgTable(
  'team_members',
  {
    id: serial('id').primaryKey(),
    teamId: integer('team_id').notNull().references(() => teams.id, { onDelete: 'cascade' }),
    membershipId: integer('membership_id').notNull().references(() => memberships.id, { onDelete: 'cascade' }),
    addedAt: timestamp('added_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    teamMemberUniq: uniqueIndex('team_members_team_membership_uniq').on(t.teamId, t.membershipId),
    membershipIdx: index('team_members_membership_idx').on(t.membershipId),
  }),
)

export type Team = typeof teams.$inferSelect
export type NewTeam = typeof teams.$inferInsert
export type TeamMember = typeof teamMembers.$inferSelect
export type NewTeamMember = typeof teamMembers.$inferInsert

/**
 * Many-to-many manager assignments. A person can have multiple managers —
 * common in matrixed orgs (e.g. an engineer who reports to both an EM and
 * a TPM, or a product manager who reports to both Product and the
 * business owner of their area).
 *
 * `memberships.reportsToMembershipId` is kept around as a "primary" manager
 * hint (used for things like "who decides my leave" routing), but the chart
 * + reports-to chain UI walks THIS table for the full picture.
 */
export const membershipManagers = pgTable(
  'membership_managers',
  {
    id: serial('id').primaryKey(),
    /** The subordinate. */
    membershipId: integer('membership_id').notNull().references(() => memberships.id, { onDelete: 'cascade' }),
    /** A manager. There can be N rows per `membershipId`. */
    managerMembershipId: integer('manager_membership_id').notNull().references(() => memberships.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    pairUniq: uniqueIndex('membership_managers_pair_uniq').on(t.membershipId, t.managerMembershipId),
    managerIdx: index('membership_managers_manager_idx').on(t.managerMembershipId),
  }),
)

export type MembershipManager = typeof membershipManagers.$inferSelect
export type NewMembershipManager = typeof membershipManagers.$inferInsert

/**
 * Founder-authored in-app announcements. Surfaced as a slim banner above the
 * org sidebar — every authenticated user sees it across every workspace they
 * belong to.
 *
 * Authored via /admin/broadcast. Examples we use this for:
 *   - "Scheduled maintenance Sunday 02:00 UTC"
 *   - "New: One-click Slack install in Integrations"
 *   - "Important: Razorpay verification expiring — re-link your card"
 *
 * Severity drives the colour: info=sage, warn=amber, critical=rose.
 * Audience filters who sees it (`all` covers everyone; `owners` and
 * `managers` filter by RBAC role on EVERY org they're in).
 */
export const announcements = pgTable(
  'announcements',
  {
    id: serial('id').primaryKey(),
    title: text('title').notNull(),
    body: text('body').notNull(),
    severity: text('severity').notNull().default('info'), // 'info' | 'warn' | 'critical'
    audience: text('audience').notNull().default('all'),  // 'all' | 'owners' | 'managers'
    href: text('href'),                                   // optional learn-more URL
    startsAt: timestamp('starts_at', { withTimezone: true }).notNull().defaultNow(),
    endsAt: timestamp('ends_at', { withTimezone: true }),
    createdByUserId: integer('created_by_user_id').references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    activeIdx: index('announcements_active_idx').on(t.startsAt, t.endsAt),
  }),
)
export type Announcement = typeof announcements.$inferSelect
export type NewAnnouncement = typeof announcements.$inferInsert

/**
 * Product analytics — every meaningful action a customer takes.
 *
 * Why a dedicated table (vs reusing audit logs): audit logs are
 * privileged-action focused (decided, revoked, removed). Analytics covers
 * *every* customer interaction — opened the dashboard, viewed a profile,
 * generated a brief, clicked a deliverable, etc. — so we can answer
 * "which features get adoption?" + "where do users drop off?" without
 * mixing concerns.
 *
 * We store enough to do later cohort analysis (orgId, userId, timestamp)
 * but never PII inside `payload` — that's a structured JSON for IDs and
 * counts only. Free-form text from the user never lands here.
 *
 * 90-day rolling retention is enforced by `/api/cron/sweep` (cheap delete
 * by timestamp) so the table stays under control.
 */
export const analyticsEvents = pgTable(
  'analytics_events',
  {
    id: serial('id').primaryKey(),
    orgId: integer('org_id').references(() => orgs.id, { onDelete: 'cascade' }),
    userId: integer('user_id').references(() => users.id, { onDelete: 'set null' }),
    /** A short dotted name like `dashboard.viewed`, `profile.opened`, `brief.regenerated`. */
    kind: text('kind').notNull(),
    /** Structured payload — never free text. e.g. `{ membershipId, fromDate, toDate }` */
    payload: jsonb('payload').$type<Record<string, unknown>>(),
    /** Optional surface where it happened — `web`, `agent`, `slack`. */
    surface: text('surface'),
    sessionId: text('session_id'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    kindCreatedIdx: index('analytics_events_kind_created_idx').on(t.kind, t.createdAt),
    orgCreatedIdx: index('analytics_events_org_created_idx').on(t.orgId, t.createdAt),
  }),
)
export type AnalyticsEvent = typeof analyticsEvents.$inferSelect
export type NewAnalyticsEvent = typeof analyticsEvents.$inferInsert

/**
 * Default annual paid-leave quota (days per type) when an org hasn't set its
 * own `leavePolicy`. Sensible India-first baseline; HR can override per-org.
 */
export const DEFAULT_LEAVE_POLICY: Record<string, number> = {
  casual: 12,
  sick: 12,
  earned: 15,
  // The rest aren't capped by a numeric balance (statutory / case-by-case).
}

/**
 * Attendance regularization requests. An employee disputes an auto-derived
 * "absent" day (worked-but-didn't-punch, on approved travel, system glitch).
 * A manager approves/denies; on approval the attendance computation treats
 * the day as the requested kind.
 */
export const attendanceRegularizations = pgTable(
  'attendance_regularizations',
  {
    id: serial('id').primaryKey(),
    orgId: integer('org_id').notNull().references(() => orgs.id, { onDelete: 'cascade' }),
    userId: integer('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    /** The day being regularized (YYYY-MM-DD). */
    day: date('day').notNull(),
    /** What the employee says the day actually was. */
    requestedKind: text('requested_kind').$type<'present' | 'leave' | 'wfh' | 'holiday'>().notNull().default('present'),
    note: text('note').notNull(),
    status: text('status').$type<'pending' | 'approved' | 'denied'>().notNull().default('pending'),
    decidedByUserId: integer('decided_by_user_id').references(() => users.id, { onDelete: 'set null' }),
    decidedAt: timestamp('decided_at', { withTimezone: true }),
    decidedNote: text('decided_note'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    orgStatusIdx: index('attendance_regularizations_org_status_idx').on(t.orgId, t.status),
    userDayIdx: index('attendance_regularizations_user_day_idx').on(t.userId, t.day),
  }),
)
export type AttendanceRegularization = typeof attendanceRegularizations.$inferSelect
export type NewAttendanceRegularization = typeof attendanceRegularizations.$inferInsert

/**
 * Performance review cycles. HR opens a cycle (e.g. "H1 2026"); MARINA tracks
 * which members have a review on file (a performance report / narrative inside
 * the window). 1:1 cadence is computed separately from scheduledMeetings.
 */
export const reviewCycles = pgTable(
  'review_cycles',
  {
    id: serial('id').primaryKey(),
    orgId: integer('org_id').notNull().references(() => orgs.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    periodStart: date('period_start').notNull(),
    periodEnd: date('period_end').notNull(),
    status: text('status').$type<'open' | 'closed'>().notNull().default('open'),
    createdByUserId: integer('created_by_user_id').references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    orgIdx: index('review_cycles_org_idx').on(t.orgId, t.status),
  }),
)
export type ReviewCycle = typeof reviewCycles.$inferSelect
export type NewReviewCycle = typeof reviewCycles.$inferInsert

/**
 * Stored standups — what each person said yesterday / today / is blocked on.
 * The Slack `/marina standup` writes here (and posts to the scrum channel); the
 * web Scrum page reads it to show "what they're working on today". One row per
 * (user, day) — re-submitting updates it.
 */
export const standups = pgTable(
  'standups',
  {
    id: serial('id').primaryKey(),
    orgId: integer('org_id').notNull().references(() => orgs.id, { onDelete: 'cascade' }),
    userId: integer('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    day: date('day').notNull(),
    yesterday: text('yesterday').notNull().default(''),
    today: text('today').notNull().default(''),
    blockers: text('blockers').notNull().default(''),
    source: text('source').notNull().default('slack'), // 'slack' | 'web'
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    userDayIdx: uniqueIndex('standups_user_day_idx').on(t.userId, t.day),
    orgDayIdx: index('standups_org_day_idx').on(t.orgId, t.day),
  }),
)
export type Standup = typeof standups.$inferSelect
export type NewStandup = typeof standups.$inferInsert
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
