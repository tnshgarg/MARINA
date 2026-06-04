import OpenAI from 'openai'
import { AIProvider, AIProviderError, ChatMessage, GenerateOpts } from './provider'

export class OpenAIProvider implements AIProvider {
  name = 'openai' as const
  model: string
  private client: OpenAI

  constructor(opts: { model?: string } = {}) {
    const apiKey = process.env.OPENAI_API_KEY
    if (!apiKey) throw new AIProviderError('openai', 'OPENAI_API_KEY is not set')
    this.model = opts.model ?? 'gpt-4o-mini'
    this.client = new OpenAI({ apiKey })
  }

  async generate(messages: ChatMessage[], opts: GenerateOpts = {}): Promise<string> {
    try {
      const res = await this.client.chat.completions.create({
        model: this.model,
        messages,
        temperature: opts.temperature ?? 0.6,
        max_tokens: opts.maxTokens ?? 1024,
        response_format: opts.responseFormat === 'json' ? { type: 'json_object' } : undefined,
      })
      return res.choices[0]?.message?.content ?? ''
    } catch (err) {
      throw new AIProviderError('openai', 'generation failed', err)
    }
  }
}
