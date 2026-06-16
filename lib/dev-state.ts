import { type Column, type SQL, like, not } from 'drizzle-orm'

/**
 * Test mode ("dev_state"). When `NEXT_PUBLIC_MARINA_TEST_MODE=true` (set in dev
 * `.env`, NEVER in production), the app is in test mode: seeded/demo rows are
 * surfaced everywhere (GitHub activity, meetings, etc.) so every feature can be
 * exercised with realistic dummy data. In production the var is unset → false,
 * so demo rows stay hidden and nothing changes. The flag is read at runtime on
 * the server and inlined for the client, so it's a single source of truth.
 */
export function isTestMode(): boolean {
  return process.env.NEXT_PUBLIC_MARINA_TEST_MODE === 'true'
}

/**
 * Drop-in replacement for `not(like(col, 'seed-%'))`: hides demo/seed rows in
 * production, but returns `undefined` in test mode so they show. Drizzle's
 * `and()` ignores `undefined` conditions, so this slots in wherever the old
 * filter lived.
 */
export function hideSeedRows(col: Column): SQL | undefined {
  return isTestMode() ? undefined : not(like(col, 'seed-%'))
}
