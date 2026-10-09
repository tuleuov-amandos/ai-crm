import { HttpException } from '@nestjs/common'
import { AiErrorCode } from 'src/common/errors'
import envConfig from 'src/common/config'
import { AI_KEY_VALIDATION_TIMEOUT_MS, createAiClient, validateAiKey } from './ai.client'

// Every provider call goes through a mocked global fetch: no real network.
// The SDKs build their real error classes from the mocked responses, so the
// tests also cover what the SDK puts into its error messages.

const mockLogged: unknown[] = []
jest.mock('../../common/logger/root-logger', () => {
  const logger: Record<string, unknown> = {}
  for (const level of ['trace', 'debug', 'info', 'warn', 'error', 'fatal']) {
    logger[level] = (...args: unknown[]) => mockLogged.push({ level, args })
  }
  logger.child = () => logger
  return { rootLogger: logger }
})

const KEY = 'sk-tenant-secret-key-0123456789-WXYZ'

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

const OPENAI_OK = {
  id: 'chatcmpl-1',
  object: 'chat.completion',
  created: 0,
  model: 'gpt-4o-mini',
  choices: [{ index: 0, message: { role: 'assistant', content: 'p' }, finish_reason: 'length' }],
}

const ANTHROPIC_OK = {
  id: 'msg_1',
  type: 'message',
  role: 'assistant',
  model: 'claude-haiku-4-5',
  content: [{ type: 'text', text: 'p' }],
  stop_reason: 'max_tokens',
  usage: { input_tokens: 1, output_tokens: 1 },
}

// Provider error bodies echo the key back, like OpenAI's real
// "Incorrect API key provided: sk-...". The SDK copies this text into
// error.message, which is why that message must never reach a log or a response.
const PROVIDER_ERROR = {
  type: 'error',
  error: { type: 'authentication_error', message: `Incorrect API key provided: ${KEY}`, code: 'invalid_api_key' },
}

let fetchMock: jest.SpyInstance

const lastRequest = () => {
  const [url, init] = fetchMock.mock.calls[fetchMock.mock.calls.length - 1] as [string, RequestInit]
  return { url: String(url), headers: new Headers(init.headers), body: JSON.parse(init.body as string) }
}

const rejectionOf = async (promise: Promise<unknown>) => {
  const error: unknown = await promise.then(
    () => {
      throw new Error('expected promise to reject')
    },
    (e: unknown) => e,
  )
  expect(error).toBeInstanceOf(HttpException)
  return error as HttpException
}

const expectNoKey = (value: unknown) => {
  const text = JSON.stringify(value)
  expect(text).not.toContain(KEY)
  expect(text).not.toContain(KEY.slice(-4))
  expect(text).not.toContain(KEY.slice(0, 12))
}

const expectSafeError = (error: HttpException, code: AiErrorCode) => {
  expect(error.getStatus()).toBe(400)
  expect((error.getResponse() as { code: string }).code).toBe(code)
  expectNoKey(error.getResponse())
  expect(error.message).not.toContain(KEY)
  expect(error.cause).toBeUndefined()
  expectNoKey(mockLogged)
}

beforeEach(() => {
  mockLogged.length = 0
  fetchMock = jest.spyOn(globalThis, 'fetch')
})

afterEach(() => {
  fetchMock.mockRestore()
  jest.useRealTimers()
})

describe('createAiClient', () => {
  it.each([
    ['openai', 'https://api.openai.com/v1/chat/completions', envConfig.OPENAI_MODEL],
    ['groq', 'https://api.groq.com/openai/v1/chat/completions', envConfig.GROQ_MODEL],
  ] as const)('%s: sends the tenant key and the default model', async (provider, url, model) => {
    fetchMock.mockResolvedValue(json(200, OPENAI_OK))

    const text = await createAiClient({ provider, apiKey: KEY }).complete('hello', { maxTokens: 7 })

    expect(text).toBe('p')
    const req = lastRequest()
    expect(req.url).toBe(url)
    expect(req.headers.get('authorization')).toBe(`Bearer ${KEY}`)
    expect(req.body).toMatchObject({ model, max_tokens: 7, messages: [{ role: 'user', content: 'hello' }] })
  })

  it('anthropic: sends the tenant key and the default model', async () => {
    fetchMock.mockResolvedValue(json(200, ANTHROPIC_OK))

    const text = await createAiClient({ provider: 'anthropic', apiKey: KEY }).complete('hello', { maxTokens: 7 })

    expect(text).toBe('p')
    const req = lastRequest()
    expect(req.url).toBe('https://api.anthropic.com/v1/messages')
    expect(req.headers.get('x-api-key')).toBe(KEY)
    expect(req.headers.get('authorization')).toBeNull()
    expect(req.body).toMatchObject({ model: envConfig.ANTHROPIC_MODEL, max_tokens: 7 })
  })
})

describe('validateAiKey', () => {
  it.each([
    ['openai', OPENAI_OK],
    ['groq', OPENAI_OK],
    ['anthropic', ANTHROPIC_OK],
  ] as const)('%s: resolves for a working key with a minimal call', async (provider, okBody) => {
    fetchMock.mockResolvedValue(json(200, okBody))

    await expect(validateAiKey(provider, KEY)).resolves.toBeUndefined()

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(lastRequest().body.max_tokens).toBe(1)
  })

  it.each([
    ['openai', 401],
    ['openai', 403],
    ['groq', 401],
    ['anthropic', 401],
    ['anthropic', 403],
  ] as const)('%s %i -> AI_KEY_INVALID, without the key in the error or logs', async (provider, status) => {
    fetchMock.mockResolvedValue(json(status, PROVIDER_ERROR))

    const error = await rejectionOf(validateAiKey(provider, KEY))

    expectSafeError(error, AiErrorCode.KEY_INVALID)
    // No retries for a rejected key.
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it.each([
    ['openai', 429],
    ['openai', 500],
    ['groq', 503],
    ['anthropic', 529],
    ['anthropic', 429],
  ] as const)('%s %i -> AI_PROVIDER_UNREACHABLE, no retries', async (provider, status) => {
    fetchMock.mockResolvedValue(json(status, PROVIDER_ERROR))

    const error = await rejectionOf(validateAiKey(provider, KEY))

    expectSafeError(error, AiErrorCode.PROVIDER_UNREACHABLE)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it.each(['openai', 'anthropic'] as const)('%s: network failure -> AI_PROVIDER_UNREACHABLE', async (provider) => {
    fetchMock.mockRejectedValue(new TypeError(`fetch failed for ${KEY}`))

    const error = await rejectionOf(validateAiKey(provider, KEY))

    expectSafeError(error, AiErrorCode.PROVIDER_UNREACHABLE)
  })

  it.each(['openai', 'anthropic'] as const)(
    '%s: times out after AI_KEY_VALIDATION_TIMEOUT_MS -> AI_PROVIDER_UNREACHABLE',
    async (provider) => {
      jest.useFakeTimers()
      fetchMock.mockImplementation(
        (_url: string, init: RequestInit) =>
          new Promise((_resolve, reject) => {
            init.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')))
          }),
      )

      const pending = validateAiKey(provider, KEY).then(
        () => null,
        (e: unknown) => e,
      )
      await jest.advanceTimersByTimeAsync(AI_KEY_VALIDATION_TIMEOUT_MS - 1)
      let settled = false
      void pending.then(() => (settled = true))
      await Promise.resolve()
      expect(settled).toBe(false)

      await jest.advanceTimersByTimeAsync(2)
      const error = (await pending) as HttpException

      expect(error).toBeInstanceOf(HttpException)
      expectSafeError(error, AiErrorCode.PROVIDER_UNREACHABLE)
      expect(AI_KEY_VALIDATION_TIMEOUT_MS).toBe(10_000)
    },
  )

  it('other 4xx (e.g. 404 model not available for this key) -> AI_KEY_INVALID', async () => {
    fetchMock.mockResolvedValue(json(404, PROVIDER_ERROR))

    const error = await rejectionOf(validateAiKey('openai', KEY))

    expectSafeError(error, AiErrorCode.KEY_INVALID)
  })

  it('logs the failure with provider and status only', async () => {
    fetchMock.mockResolvedValue(json(401, PROVIDER_ERROR))

    await rejectionOf(validateAiKey('openai', KEY))

    expect(mockLogged).toEqual([
      {
        level: 'warn',
        args: [expect.objectContaining({ event: 'ai_key.validation_failed', provider: 'openai', status: 401 })],
      },
    ])
  })
})
