import { and, eq, isNull } from 'drizzle-orm'
import { db, schema } from '@/lib/db/client'
import { inbox } from '@/lib/notify/inbox'
import { getSlackInstall, sendSlackChannel } from '@/lib/slack/client'

/**
 * Post an org-wide team announcement (distinct from the platform-level founder
 * banner). Persists it, notifies every active member in-app, and (best-effort)
 * broadcasts to the announcements channel (#all-marina). Authored by a
 * manager/admin from the web or `/marina announce` in Slack.
 */
export async function createOrgAnnouncement(input: {
  orgId: number
  authorUserId: number
  title?: string | null
  body: string
  source?: 'slack' | 'web'
}): Promise<{ ok: true; id: number } | { ok: false; error: string }> {
  const body = input.body.trim()
  if (body.length < 2) return { ok: false, error: 'Write something to announce.' }
  const title = (input.title ?? '').trim().slice(0, 140) || null

  const [row] = await db
    .insert(schema.orgAnnouncements)
    .values({ orgId: input.orgId, authorUserId: input.authorUserId, title, body: body.slice(0, 4000) })
    .returning({ id: schema.orgAnnouncements.id })

  const author = await db.query.users.findFirst({ where: eq(schema.users.id, input.authorUserId) })
  const authorName = author?.name ?? (author ? `@${author.login}` : 'A manager')

  // In-app to every active member except the author (in-app only — no email).
  const members = await db
    .select({ userId: schema.memberships.userId })
    .from(schema.memberships)
    .where(and(eq(schema.memberships.orgId, input.orgId), isNull(schema.memberships.endedAt)))
  for (const m of members) {
    if (m.userId === input.authorUserId) continue
    inbox({
      userId: m.userId,
      orgId: input.orgId,
      kind: 'announcement.posted',
      title: title ? `Announcement: ${title}` : 'New announcement',
      body: body.slice(0, 280),
      href: `/org/${input.orgId}/announcements`,
    })
  }

  // Broadcast to the announcements channel (best-effort, no-op if none set).
  try {
    const install = await getSlackInstall(input.orgId)
    if (install) {
      await sendSlackChannel(install, {
        text: title ? `Announcement: ${title}` : 'New announcement',
        blocks: [
          { type: 'section', text: { type: 'mrkdwn', text: `*Announcement${title ? ` — ${title}` : ''}*\n${body}` } },
          { type: 'context', elements: [{ type: 'mrkdwn', text: `posted by ${authorName}` }] },
        ],
      })
    }
  } catch {
    /* best-effort — announcement is saved regardless */
  }

  return { ok: true, id: row.id }
}
