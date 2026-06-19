import { and, eq, isNull } from 'drizzle-orm'
import { db, schema } from '@/lib/db/client'
import { inbox } from '@/lib/notify/inbox'
import { getSlackInstall, sendSlackChannel } from '@/lib/slack/client'

/**
 * Give peer recognition. Persists the kudos, notifies the recipient in-app, and
 * (best-effort) broadcasts a card to the org's announcements channel (#all-marina).
 * Filed from Slack or the web — both call this. Validates that both people are
 * active members of the org.
 */
export async function createRecognition(input: {
  orgId: number
  fromUserId: number
  toUserId: number
  message: string
  source?: 'slack' | 'web'
}): Promise<{ ok: true; id: number; toName: string } | { ok: false; error: string }> {
  const message = input.message.trim()
  if (message.length < 2) return { ok: false, error: 'Add a short note about what they did.' }
  if (input.fromUserId === input.toUserId) return { ok: false, error: "You can't recognize yourself." }

  const [fromM, toM] = await Promise.all([
    db.query.memberships.findFirst({
      where: and(
        eq(schema.memberships.orgId, input.orgId),
        eq(schema.memberships.userId, input.fromUserId),
        isNull(schema.memberships.endedAt),
      ),
    }),
    db.query.memberships.findFirst({
      where: and(
        eq(schema.memberships.orgId, input.orgId),
        eq(schema.memberships.userId, input.toUserId),
        isNull(schema.memberships.endedAt),
      ),
    }),
  ])
  if (!fromM) return { ok: false, error: 'You are not a member of this workspace.' }
  if (!toM) return { ok: false, error: 'That teammate is not in this workspace.' }

  const [row] = await db
    .insert(schema.recognitions)
    .values({
      orgId: input.orgId,
      fromUserId: input.fromUserId,
      toUserId: input.toUserId,
      message: message.slice(0, 1000),
      source: input.source ?? 'web',
    })
    .returning({ id: schema.recognitions.id })

  const [from, to] = await Promise.all([
    db.query.users.findFirst({ where: eq(schema.users.id, input.fromUserId) }),
    db.query.users.findFirst({ where: eq(schema.users.id, input.toUserId) }),
  ])
  const fromName = from?.name ?? (from ? `@${from.login}` : 'A teammate')
  const toName = to?.name ?? (to ? `@${to.login}` : 'a teammate')

  // In-app notification to the recipient (in-app only — no email fan-out).
  inbox({
    userId: input.toUserId,
    orgId: input.orgId,
    kind: 'recognition.received',
    title: `${fromName} recognized you`,
    body: message.slice(0, 280),
    href: `/org/${input.orgId}/recognitions`,
  })

  // Broadcast to the announcements channel (best-effort, no-op if none set).
  try {
    const install = await getSlackInstall(input.orgId)
    if (install) {
      await sendSlackChannel(install, {
        text: `Kudos to ${toName} from ${fromName}`,
        blocks: [
          { type: 'section', text: { type: 'mrkdwn', text: `*Kudos to ${toName}*` } },
          { type: 'section', text: { type: 'mrkdwn', text: `> ${message}` } },
          { type: 'context', elements: [{ type: 'mrkdwn', text: `from ${fromName}` }] },
        ],
      })
    }
  } catch {
    /* best-effort — recognition is saved regardless */
  }

  return { ok: true, id: row.id, toName }
}
