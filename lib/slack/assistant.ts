import { getSlackInstall, sendSlackDm } from '@/lib/slack/client'
import { resolveSlackActor } from '@/lib/slack/identity'
import { roleAtLeast } from '@/lib/auth/guards'
import { getVisibleScope } from '@/lib/auth/scope'
import { chatAboutEmployee } from '@/lib/ai/employee-chat'
import { chatAboutTeam } from '@/lib/ai/team-chat'

/**
 * "Ask Marina" inside Slack. A DM (or @mention) to the bot is treated as a
 * question. Managers/leads get the team-scoped answer (bounded by their
 * visible RBAC scope); members get an answer about their own work only. Reuses
 * the exact same grounded chat engines the web dashboard uses — no new AI.
 */
export async function handleAssistantMessage(
  teamId: string,
  slackUserId: string,
  text: string,
): Promise<void> {
  const question = (text ?? '').trim()
  if (!question) return

  const actor = await resolveSlackActor(teamId, slackUserId)
  if (!actor) return // can't answer for someone we can't identify / scope
  const install = await getSlackInstall(actor.org.id)
  if (!install) return

  try {
    let answer: string
    if (roleAtLeast(actor.membership.role, 'lead')) {
      const scope = await getVisibleScope(actor.org.id, {
        userId: actor.user.id,
        membershipId: actor.membership.id,
        role: actor.membership.role,
      })
      const res = await chatAboutTeam({
        orgId: actor.org.id,
        userIds: [...scope.userIds],
        history: [],
        question,
      })
      answer = res.answer
    } else {
      const res = await chatAboutEmployee({
        orgId: actor.org.id,
        userId: actor.user.id,
        membershipId: actor.membership.id,
        history: [],
        question,
      })
      answer = res.answer
    }
    const trimmed = answer.slice(0, 2900)
    await sendSlackDm(install, slackUserId, {
      text: trimmed,
      blocks: [{ type: 'section', text: { type: 'mrkdwn', text: trimmed } }],
    })
  } catch {
    await sendSlackDm(install, slackUserId, {
      text: "I couldn't get to that just now — try again in a moment.",
    })
  }
}
