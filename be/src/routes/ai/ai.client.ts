import OpenAI from 'openai'
import Anthropic from '@anthropic-ai/sdk'
import envConfig from '../../common/config'
import { AiErrorCode, AppException } from '../../common/errors'
import { rootLogger } from '../../common/logger/root-logger'

const log = rootLogger.child({ context: 'AiClient' })

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

export type AiProviderName = 'openai' | 'groq' | 'anthropic'

const GROQ_BASE_URL = 'https://api.groq.com/openai/v1'

// OpenAI and Groq share one implementation: Groq is wire-compatible with the
// OpenAI SDK, only the baseURL differs.
function createOpenAiClient(options: ConstructorParameters<typeof OpenAI>[0], model: string): AiClient {
  const client = new OpenAI(options)

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

function createAnthropicClient(options: ConstructorParameters<typeof Anthropic>[0], model: string): AiClient {
  const client = new Anthropic(options)

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

// ─── Clients on a company's own key ─────────────────────────────────────────

export interface AiCredential {
  provider: AiProviderName
  apiKey: string
}

export interface AiClientRequestOptions {
  /** Per-request timeout in the SDK; the SDK default (10 min) when unset. */
  timeoutMs?: number
  /** SDK retries on 408/409/429/5xx and network errors; the SDK default (2) when unset. */
  maxRetries?: number
}

/**
 * Client on a company's key, with the platform's fixed model for the provider.
 *
 * Nothing is taken from the environment besides the model: the base URL is
 * pinned and OPENAI_ORG_ID / OPENAI_PROJECT_ID / ANTHROPIC_AUTH_TOKEN /
 * *_BASE_URL / *_LOG, which the SDKs otherwise read on their own, are
 * overridden, so a company key is sent only to its provider, with no
 * platform credential next to it, and is never dumped by SDK debug logging.
 */
export function createAiClient({ provider, apiKey }: AiCredential, options: AiClientRequestOptions = {}): AiClient {
  const common = {
    apiKey,
    logLevel: 'warn' as const,
    ...(options.timeoutMs !== undefined ? { timeout: options.timeoutMs } : {}),
    ...(options.maxRetries !== undefined ? { maxRetries: options.maxRetries } : {}),
  }

  if (provider === 'anthropic') {
    return createAnthropicClient(
      { ...common, authToken: null, baseURL: 'https://api.anthropic.com' },
      envConfig.ANTHROPIC_MODEL,
    )
  }
  const openAiOptions = { ...common, organization: null, project: null }
  return provider === 'groq'
    ? createOpenAiClient({ ...openAiOptions, baseURL: GROQ_BASE_URL }, envConfig.GROQ_MODEL)
    : createOpenAiClient({ ...openAiOptions, baseURL: 'https://api.openai.com/v1' }, envConfig.OPENAI_MODEL)
}

export const AI_KEY_VALIDATION_TIMEOUT_MS = 10_000

// HTTP status of a provider SDK error; both SDKs set `status` on APIError and
// leave it undefined for connection errors and timeouts.
export const statusOf = (error: unknown) => {
  const status = (error as { status?: unknown } | null)?.status
  return typeof status === 'number' ? status : undefined
}

/**
 * Checks a company key with one minimal call (1 output token, no retries,
 * AI_KEY_VALIDATION_TIMEOUT_MS). Resolves when the provider accepted it.
 *
 * Throws AppException (400):
 * - AI_KEY_INVALID: 401/403, or another 4xx (bad request, model not available
 *   for this key): retrying with the same key will not help.
 * - AI_PROVIDER_UNREACHABLE: no HTTP status (network error, timeout), 429, 5xx.
 *
 * The SDK's error is dropped on purpose: providers echo the key back in their
 * error text (OpenAI: "Incorrect API key provided: sk-...") and the SDKs copy
 * it into error.message. Only the status and the error class name are logged,
 * and the AppException carries no cause.
 */
export async function validateAiKey(provider: AiProviderName, apiKey: string): Promise<void> {
  const client = createAiClient({ provider, apiKey }, { timeoutMs: AI_KEY_VALIDATION_TIMEOUT_MS, maxRetries: 0 })
  try {
    await client.complete('ping', { maxTokens: 1, temperature: 0 })
  } catch (error) {
    const status = statusOf(error)
    const unreachable = status === undefined || status === 429 || status >= 500
    log.warn({
      event: 'ai_key.validation_failed',
      provider,
      status: status ?? null,
      errorName: error instanceof Error ? error.constructor.name : typeof error,
      result: unreachable ? AiErrorCode.PROVIDER_UNREACHABLE : AiErrorCode.KEY_INVALID,
    })
    throw unreachable
      ? AppException.badRequest(
          AiErrorCode.PROVIDER_UNREACHABLE,
          'The AI provider could not check the key, try again later',
        )
      : AppException.badRequest(AiErrorCode.KEY_INVALID, 'The AI provider rejected the API key')
  }
}
