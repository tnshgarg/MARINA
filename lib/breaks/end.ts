import { and, eq, isNull } from 'drizzle-orm'
import { db, schema } from '@/lib/db/client'

/**
 * End the user's currently-open break / blocker (if any). Channel-agnostic —
 * used by `/marina back`, the App Home "End break" / "Resolve blocker" buttons,
 * and the agent. Returns what happened so the surface can word its reply.
 */
export async function endActiveBreak(
  userId: number,
  opts?: { resolvedByUserId?: number; resolution?: string },
): Promise<{ ended: boolean; wasBlocked: boolean }> {
  const open = await db.query.breaks.findFirst({
    where: and(eq(schema.breaks.userId, userId), isNull(schema.breaks.endedAt)),
  })
  if (!open) return { ended: false, wasBlocked: false }

  const wasBlocked = open.category === 'blocked'
  await db
    .update(schema.breaks)
    .set({
      endedAt: new Date(),
      ...(wasBlocked
        ? {
            resolutionType: opts?.resolution ?? 'self',
            resolvedByUserId: opts?.resolvedByUserId ?? userId,
          }
        : {}),
    })
    .where(eq(schema.breaks.id, open.id))

  return { ended: true, wasBlocked }
}
