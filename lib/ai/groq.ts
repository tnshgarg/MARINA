import Groq from 'groq-sdk'
import { AIProvider, AIProviderError, ChatMessage, GenerateOpts } from './provider'

export class GroqProvider implements AIProvider {
  name = 'groq' as const
  model: string
  private client: Groq

  constructor(opts: { model?: string } = {}) {
    const apiKey = process.env.GROQ_API_KEY
    if (!apiKey) throw new AIProviderError('groq', 'GROQ_API_KEY is not set')
    this.model = opts.model ?? 'llama-3.3-70b-versatile'
    this.client = new Groq({ apiKey })
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
      throw new AIProviderError('groq', 'generation failed', err)
    }
  }
}
