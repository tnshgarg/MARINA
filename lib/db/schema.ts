import { pgTable, serial, text, integer, timestamp, jsonb, index } from 'drizzle-orm/pg-core'

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

export type User = typeof users.$inferSelect
export type NewUser = typeof users.$inferInsert
export type GithubEvent = typeof githubEvents.$inferSelect
export type NewGithubEvent = typeof githubEvents.$inferInsert
export type Narrative = typeof narratives.$inferSelect
export type NewNarrative = typeof narratives.$inferInsert
