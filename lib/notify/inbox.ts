import { afterResponse } from '@/lib/after'
import { db, schema } from '@/lib/db/client'

/**
 * Add an in-app notification for a user. Shows up in the bell icon. Wrapped
 * in `after()` so the call doesn't block the request that generated the
 * notification.
 */
export function inbox(input: {
  userId: number
  orgId?: number | null
  kind: string
  title: string
  body?: string | null
  href?: string | null
}): void {
  afterResponse(
    () =>
      db.insert(schema.notifications).values({
        userId: input.userId,
        orgId: input.orgId ?? null,
        kind: input.kind,
        title: input.title,
        body: input.body ?? null,
        href: input.href ?? null,
      }),
    `inbox:${input.kind}`,
  )
}
