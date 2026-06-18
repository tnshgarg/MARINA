import { and, eq, isNull } from 'drizzle-orm'
import { db, schema } from '@/lib/db/client'
import { notify } from '@/lib/notify/send'
import type { BreakCategory } from '@/lib/db/schema'

/**
 * Channel-agnostic break / blocker creation. Mirrors the core of the agent
 * breaks route (end any ongoing break, insert, fire state.blocked notify) so
 * the Slack surface can raise a blocker through the same domain semantics
 * without duplicating notify wiring. The agent/web routes keep their own
 * surface-specific validation; this is the shared action.
 */
export async function createBreak(input: {
  userId: number
  orgId: number
  category: BreakCategory
  reason: string
  waitingOnUserId?: number | null
  waitingOnExternal?: string | null
  expectedEndAt?: Date | null
}): Promise<typeof schema.breaks.$inferSelect> {
  // At most one ongoing break per user.
  await db
    .update(schema.breaks)
    .set({ endedAt: new Date() })
    .where(and(eq(schema.breaks.userId, input.userId), isNull(schema.breaks.endedAt)))

  const reason = (input.reason ?? '').trim().slice(0, 500)
  const [row] = await db
    .insert(schema.breaks)
    .values({
      userId: input.userId,
      orgId: input.orgId,
      reason:
        reason ||
        (input.category === 'blocked'
          ? `Blocked${input.waitingOnExternal ? ` — waiting on ${input.waitingOnExternal}` : ''}`
          : 'Break'),
      category: input.category,
      waitingOnUserId: input.waitingOnUserId ?? null,
      waitingOnExternal: input.waitingOnExternal ?? null,
      expectedEndAt: input.expectedEndAt ?? null,
    })
    .returning()

  if (input.category === 'blocked') {
    const user = await db.query.users.findFirst({ where: eq(schema.users.id, input.userId) })
    notify({
      kind: 'state.blocked',
      orgId: input.orgId,
      actorUserId: input.userId,
      userName: user?.name ?? `@${user?.login ?? 'someone'}`,
      userLogin: user?.login ?? 'someone',
      reason: row.reason,
    })
  }

  return row
}
