import OpenAI from 'openai'
import { AIProviderError } from './provider'
import type { ShotAppCategory, ShotContentHint, ShotWorkLabel } from '@/lib/db/schema'

export type VisionAnalysis = {
  appCategory: ShotAppCategory
  workAppLabel: ShotWorkLabel
  visibleContentHint: ShotContentHint
  confidence: number // 0..1
}

export type VisionAnalysisResult = {
  analysis: VisionAnalysis
  provider: string
  model: string
  raw: unknown
}

export interface VisionProvider {
  name: string
  model: string
  analyze(image: { bytes: Buffer; mime: string }): Promise<VisionAnalysisResult>
}

const PROMPT = `You are analyzing a workplace screenshot from a productivity tool.

Return strict JSON matching exactly:
{
  "appCategory": "ide" | "design" | "comms" | "browser_work" | "browser_personal" | "media" | "unknown",
  "workAppLabel": "work" | "non_work" | "ambiguous",
  "visibleContentHint": "code_editing" | "design_canvas" | "reading_docs" | "chat" | "video_streaming" | "social_media" | "static_idle" | "other",
  "confidence": <number between 0 and 1>
}

Rules:
- "ide" covers VS Code, IntelliJ, Xcode, terminals/REPLs with code visible.
- "design" covers Figma, Sketch, Photoshop.
- "comms" covers Slack, Teams, Discord, email clients with chat-like UI.
- "browser_work" covers GitHub, Jira, Linear, docs, internal tools, Stack Overflow.
- "browser_personal" covers social media in a browser, shopping, personal email.
- "media" covers YouTube, Netflix, Spotify, Twitch playing video/audio.
- "static_idle" specifically for desktops with no visible app activity (empty desktop, lock-screen-adjacent, fullscreen screensaver, the same paused state).
- "workAppLabel" should err on "ambiguous" when unsure, never invent.
- Do not include any screen contents, names, or text beyond these labels.
- Return only the JSON object — no prose, no markdown fences.`

export class OpenAIVisionProvider implements VisionProvider {
  name = 'openai'
  model: string
  private client: OpenAI

  constructor(opts: { model?: string } = {}) {
    const apiKey = process.env.OPENAI_API_KEY
    if (!apiKey) throw new AIProviderError('openai', 'OPENAI_API_KEY is not set')
    this.model = opts.model ?? 'gpt-4o-mini'
    this.client = new OpenAI({ apiKey })
  }

  async analyze({ bytes, mime }: { bytes: Buffer; mime: string }): Promise<VisionAnalysisResult> {
    const dataUrl = `data:${mime};base64,${bytes.toString('base64')}`
    let res
    try {
      res = await this.client.chat.completions.create({
        model: this.model,
        temperature: 0.1,
        max_tokens: 200,
        response_format: { type: 'json_object' },
        messages: [
          {
            role: 'system',
            content: 'You output only valid JSON matching the user-provided schema. No prose.',
          },
          {
            role: 'user',
            content: [
              { type: 'text', text: PROMPT },
              { type: 'image_url', image_url: { url: dataUrl, detail: 'low' } },
            ],
          },
        ],
      })
    } catch (err) {
      throw new AIProviderError('openai-vision', 'vision call failed', err)
    }

    const text = res.choices[0]?.message?.content ?? '{}'
    const parsed = parseAnalysis(text)
    return {
      analysis: parsed,
      provider: this.name,
      model: this.model,
      raw: text,
    }
  }
}

const VALID_CATEGORIES: ShotAppCategory[] = [
  'ide',
  'design',
  'comms',
  'browser_work',
  'browser_personal',
  'media',
  'unknown',
]
const VALID_WORK: ShotWorkLabel[] = ['work', 'non_work', 'ambiguous']
const VALID_HINTS: ShotContentHint[] = [
  'code_editing',
  'design_canvas',
  'reading_docs',
  'chat',
  'video_streaming',
  'social_media',
  'static_idle',
  'other',
]

function parseAnalysis(text: string): VisionAnalysis {
  let obj: Record<string, unknown> = {}
  try {
    obj = JSON.parse(text) as Record<string, unknown>
  } catch {
    obj = {}
  }

  const appCategory = VALID_CATEGORIES.includes(obj.appCategory as ShotAppCategory)
    ? (obj.appCategory as ShotAppCategory)
    : 'unknown'
  const workAppLabel = VALID_WORK.includes(obj.workAppLabel as ShotWorkLabel)
    ? (obj.workAppLabel as ShotWorkLabel)
    : 'ambiguous'
  const visibleContentHint = VALID_HINTS.includes(obj.visibleContentHint as ShotContentHint)
    ? (obj.visibleContentHint as ShotContentHint)
    : 'other'
  let confidence = typeof obj.confidence === 'number' ? obj.confidence : 0
  if (!Number.isFinite(confidence)) confidence = 0
  confidence = Math.max(0, Math.min(1, confidence))

  return { appCategory, workAppLabel, visibleContentHint, confidence }
}

let cached: VisionProvider | null = null

export function getVisionProvider(): VisionProvider {
  if (cached) return cached
  cached = new OpenAIVisionProvider()
  return cached
}

/**
 * Heuristic progress score: compares two consecutive analyses without an LLM call.
 * Returns 0..1.
 */
export function progressScore(
  previous: Pick<VisionAnalysis, 'appCategory' | 'visibleContentHint' | 'workAppLabel'> | null,
  current: Pick<VisionAnalysis, 'appCategory' | 'visibleContentHint' | 'workAppLabel'>
): number {
  const curHint: ShotContentHint = current.visibleContentHint
  const prevHint: ShotContentHint | null = previous?.visibleContentHint ?? null

  // Two consecutive static_idle frames is the strongest dummying signal.
  if (curHint === 'static_idle') {
    return prevHint === 'static_idle' ? 0 : 0.1
  }
  if (!previous) return current.workAppLabel === 'work' ? 1 : 0.5
  if (previous.appCategory !== current.appCategory) return 0.7
  if (
    prevHint === curHint &&
    (curHint === 'code_editing' || curHint === 'design_canvas')
  ) {
    return 1
  }
  return 0.6
}
