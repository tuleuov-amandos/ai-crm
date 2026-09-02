import OpenAI from 'openai'
import Anthropic from '@anthropic-ai/sdk'
import envConfig from '../../common/config'

export interface AiCompletionOptions {
  temperature?: number
  maxTokens?: number
}

/**
 * Provider-agnostic chat client. Callers pass a plain prompt and get back the
 * assistant's text — they never touch a provider SDK's response shape.
 */
export interface AiClient {
  complete(prompt: string, options?: AiCompletionOptions): Promise<string>
}

// OpenAI and Groq share one implementation: Groq is wire-compatible with the
// OpenAI SDK, only the baseURL differs.
function createOpenAiClient(): AiClient {
  const isGroq = envConfig.AI_PROVIDER === 'groq'

  const client = new OpenAI(
    isGroq
      ? {
          apiKey: envConfig.GROQ_API_KEY,
          baseURL: 'https://api.groq.com/openai/v1',
        }
      : {
          apiKey: envConfig.OPENAI_API_KEY,
        },
  )

  const model = isGroq ? envConfig.GROQ_MODEL || 'llama-3.3-70b-versatile' : envConfig.OPENAI_MODEL || 'gpt-4o-mini'

  return {
    async complete(prompt, options) {
      const response = await client.chat.completions.create({
        model,
        messages: [{ role: 'user', content: prompt }],
        temperature: options?.temperature ?? 0.1,
        max_tokens: options?.maxTokens,
      })
      return response.choices[0]?.message?.content || ''
    },
  }
}

function createAnthropicClient(): AiClient {
  const client = new Anthropic({ apiKey: envConfig.ANTHROPIC_API_KEY })
  const model = envConfig.ANTHROPIC_MODEL

  return {
    async complete(prompt, options) {
      // `temperature` is intentionally dropped: the sampling params are rejected
      // (HTTP 400) on the Sonnet 5 / Opus 5 / 4.6+ model families, so passing it
      // through would break the moment ANTHROPIC_MODEL is bumped past Haiku 4.5.
      // `max_tokens` is required by the Messages API — default when unset.
      const response = await client.messages.create({
        model,
        max_tokens: options?.maxTokens ?? 1024,
        messages: [{ role: 'user', content: prompt }],
      })
      return response.content
        .filter((block): block is Anthropic.TextBlock => block.type === 'text')
        .map((block) => block.text)
        .join('')
    },
  }
}

export const aiClient: AiClient = envConfig.AI_PROVIDER === 'anthropic' ? createAnthropicClient() : createOpenAiClient()
