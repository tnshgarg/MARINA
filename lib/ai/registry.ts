import { AIProvider, AIProviderError, ChatMessage, GenerateOpts } from './provider'
import { GroqProvider } from './groq'
import { OpenAIProvider } from './openai'

type ProviderName = 'groq' | 'openai'

let cache: Partial<Record<ProviderName, AIProvider>> = {}

export function getProvider(name?: ProviderName): AIProvider {
  const resolved: ProviderName = name ?? ((process.env.DEFAULT_AI_PROVIDER as ProviderName) || 'groq')
  if (cache[resolved]) return cache[resolved]!
  const provider: AIProvider = resolved === 'openai' ? new OpenAIProvider() : new GroqProvider()
  cache[resolved] = provider
  return provider
}

export async function generateWithFallback(
  messages: ChatMessage[],
  opts: GenerateOpts = {},
  preferred?: ProviderName
): Promise<{ text: string; provider: string; model: string }> {
  const primary = preferred ?? ((process.env.DEFAULT_AI_PROVIDER as ProviderName) || 'groq')
  const fallback: ProviderName = primary === 'groq' ? 'openai' : 'groq'

  for (const name of [primary, fallback]) {
    try {
      const provider = getProvider(name)
      const text = await provider.generate(messages, opts)
      if (text.trim().length === 0) continue
      return { text, provider: provider.name, model: provider.model }
    } catch (err) {
      if (err instanceof AIProviderError && err.message.includes('is not set')) {
        // missing API key for this provider — try the other one silently
        continue
      }
      console.error('AI provider failed, trying fallback', err)
    }
  }
  throw new Error('All AI providers failed or are not configured')
}
