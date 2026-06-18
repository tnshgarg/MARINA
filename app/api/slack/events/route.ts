import { NextResponse } from 'next/server'
import { verifySlackRequest } from '@/lib/slack/verify'
import { afterResponse } from '@/lib/after'
import { publishAppHomeFor } from '@/lib/slack/home'
import { handleAssistantMessage } from '@/lib/slack/assistant'

export const runtime = 'nodejs'

/**
 * Slack Events API endpoint. Handles:
 *   - url_verification     → echo the challenge (request-URL handshake)
 *   - app_home_opened      → (re)publish the user's App Home tab
 *   - message (im) / app_mention → "Ask Marina" assistant reply
 *
 * Slack needs a 200 within 3s, so we ack immediately and do the real work in
 * afterResponse(...). Every non-handshake request is signature-verified first.
 */
type SlackEventBody = {
  type?: string
  challenge?: string
  team_id?: string
  event?: {
    type?: string
    tab?: string
    user?: string
    text?: string
    channel_type?: string
    bot_id?: string
    subtype?: string
  }
}

export async function POST(req: Request) {
  const raw = await req.text()
  const check = verifySlackRequest(req.headers, raw)
  if (!check.ok) return NextResponse.json({ error: check.reason }, { status: 401 })

  let body: SlackEventBody
  try {
    body = JSON.parse(raw) as SlackEventBody
  } catch {
    return NextResponse.json({ error: 'bad json' }, { status: 400 })
  }

  if (body.type === 'url_verification') {
    return NextResponse.json({ challenge: body.challenge })
  }

  if (body.type === 'event_callback' && body.event) {
    const teamId = body.team_id ?? ''
    const ev = body.event

    if (ev.type === 'app_home_opened' && ev.tab === 'home' && ev.user) {
      const user = ev.user
      afterResponse(() => publishAppHomeFor(teamId, user), 'slack app_home_opened')
    } else if (ev.type === 'message') {
      // Direct messages only; skip the bot's own posts, edits, and joins.
      if (ev.channel_type === 'im' && !ev.bot_id && !ev.subtype && ev.user) {
        const user = ev.user
        const text = ev.text ?? ''
        afterResponse(() => handleAssistantMessage(teamId, user, text), 'slack assistant dm')
      }
    } else if (ev.type === 'app_mention' && ev.user) {
      const user = ev.user
      const text = stripMention(ev.text ?? '')
      afterResponse(() => handleAssistantMessage(teamId, user, text), 'slack app_mention')
    }
  }

  return NextResponse.json({ ok: true })
}

function stripMention(t: string): string {
  return t.replace(/<@[A-Z0-9]+>/g, '').trim()
}
