import { and, eq, isNull } from 'drizzle-orm'
import { db, schema } from '@/lib/db/client'
import { saveStandup, getTodayStandup, usersWithStandupToday } from '@/lib/standups/save'

/** Smoke test for the standups table + helpers against the dev DB. */
async function main() {
  const m = await db.query.memberships.findFirst({ where: isNull(schema.memberships.endedAt) })
  if (!m) {
    console.log('FAIL no active membership to test with')
    process.exit(1)
  }
  const { orgId, userId } = m
  console.log(`Using org ${orgId}, user ${userId}`)

  // Insert
  await saveStandup({ orgId, userId, yesterday: 'Shipped X', today: 'Plan A', blockers: 'Need creds', source: 'web' })
  const a = await getTodayStandup(userId)
  console.log('after insert:', a)

  // Update-in-place (same user+day → one row, no dup)
  await saveStandup({ orgId, userId, yesterday: 'Shipped X', today: 'Plan B', blockers: '', source: 'slack' })
  const b = await getTodayStandup(userId)
  console.log('after update:', b)

  const set = await usersWithStandupToday(orgId)
  const ok = a?.today === 'Plan A' && b?.today === 'Plan B' && b?.blockers === '' && set.has(userId)
  console.log('usersWithStandupToday has user:', set.has(userId), '| set size:', set.size)

  // Cleanup the test row
  await db.delete(schema.standups).where(and(eq(schema.standups.orgId, orgId), eq(schema.standups.userId, userId)))
  const after = await getTodayStandup(userId)
  console.log('after cleanup:', after)

  console.log(ok && after === null ? '\nPASS standups round-trip' : '\nFAIL standups round-trip')
  process.exit(ok && after === null ? 0 : 1)
}
main().catch((e) => {
  console.error(e)
  process.exit(1)
})
