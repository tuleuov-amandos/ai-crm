import { HttpException } from '@nestjs/common'
import { UnrecoverableError } from 'bullmq'
import { AiKeyCipherError, encrypt } from 'src/common/crypto/ai-key-cipher'
import { AiErrorCode } from 'src/common/errors'
import envConfig from 'src/common/config'
import { AiSettingsService } from '../ai-settings/ai-settings.service'
import { AiSettingsRepository } from '../ai-settings/ai-settings.repo'
import { AuditLogsService } from '../audit-logs/audit-logs.service'
import { AiCredential } from './ai.client'
import { AiCredentialSource, createTenantAiClient, toJobFailure } from './tenant-ai-client'

// Provider calls go through a mocked global fetch (no real network); the SDKs
// build their real error classes from the mocked responses.

const mockLogged: unknown[] = []
jest.mock('../../common/logger/root-logger', () => {
  const logger: Record<string, unknown> = {}
  for (const level of ['trace', 'debug', 'info', 'warn', 'error', 'fatal']) {
    logger[level] = (...args: unknown[]) => mockLogged.push({ level, args })
  }
  logger.child = () => logger
  return { rootLogger: logger }
})

const TENANT_A = 'tenant-a'
const TENANT_B = 'tenant-b'
const KEY_A = 'sk-proj-tenant-a-secret-0123456789-AAAA'
const KEY_B = 'sk-ant-tenant-b-secret-0123456789-BBBB'

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

const OPENAI_OK = {
  id: 'chatcmpl-1',
  object: 'chat.completion',
  created: 0,
  model: 'gpt-4o-mini',
  choices: [{ index: 0, finish_reason: 'stop', message: { role: 'assistant', content: 'pong' } }],
}
const ANTHROPIC_OK = {
  id: 'msg_1',
  type: 'message',
  role: 'assistant',
  model: 'claude-haiku-4-5',
  content: [{ type: 'text', text: 'pong' }],
  stop_reason: 'end_turn',
  usage: { input_tokens: 1, output_tokens: 1 },
}
// Providers echo the key back in their error text; the SDKs copy it into error.message.
const echoingError = (key: string) => ({ error: { message: `Incorrect API key provided: ${key}`, type: 'x' } })

let fetchMock: jest.SpyInstance

const lastRequest = () => {
  const [url, init] = fetchMock.mock.calls[fetchMock.mock.calls.length - 1] as [string, RequestInit]
  return { url, headers: new Headers(init.headers), body: JSON.parse(init.body as string) }
}

const rejectionOf = (promise: Promise<unknown>) =>
  promise.then(
    () => {
      throw new Error('expected promise to reject')
    },
    (e: unknown) => e,
  )

const sourceOf = (credentials: Record<string, AiCredential>): AiCredentialSource & { calls: string[] } => {
  const calls: string[] = []
  return {
    calls,
    getDecryptedCredential: (tenantId: string) => {
      calls.push(tenantId)
      return Promise.resolve(credentials[tenantId] ?? null)
    },
  }
}

const NO_RETRIES = { maxRetries: 0 }

beforeEach(() => {
  mockLogged.length = 0
  fetchMock = jest.spyOn(globalThis, 'fetch')
})

afterEach(() => {
  fetchMock.mockRestore()
})

describe('createTenantAiClient: client on the tenant key', () => {
  it.each([
    ['openai', 'https://api.openai.com/v1/chat/completions', OPENAI_OK, envConfig.OPENAI_MODEL],
    ['groq', 'https://api.groq.com/openai/v1/chat/completions', OPENAI_OK, envConfig.GROQ_MODEL],
    ['anthropic', 'https://api.anthropic.com/v1/messages', ANTHROPIC_OK, envConfig.ANTHROPIC_MODEL],
  ] as const)('%s: calls the tenant provider with the tenant key', async (provider, url, okBody, model) => {
    fetchMock.mockResolvedValue(json(200, okBody))
    const source = sourceOf({ [TENANT_A]: { provider, apiKey: KEY_A } })

    const client = await createTenantAiClient(source, TENANT_A, NO_RETRIES)
    const text = await client.complete('hello', { maxTokens: 5 })

    expect(text).toBe('pong')
    const req = lastRequest()
    expect(req.url).toBe(url)
    expect(req.body.model).toBe(model)
    const sentKey = provider === 'anthropic' ? req.headers.get('x-api-key') : req.headers.get('authorization')
    expect(sentKey).toBe(provider === 'anthropic' ? KEY_A : `Bearer ${KEY_A}`)
  })

  it('looks the credential up when the client is created, for that tenant only', async () => {
    const source = sourceOf({ [TENANT_A]: { provider: 'openai', apiKey: KEY_A } })

    await createTenantAiClient(source, TENANT_A)

    expect(source.calls).toEqual([TENANT_A])
    expect(fetchMock).not.toHaveBeenCalled()
  })
})

describe('createTenantAiClient: tenant isolation', () => {
  it("never uses another tenant's key", async () => {
    fetchMock.mockImplementation((_url: string, init: RequestInit) => {
      const headers = new Headers(init.headers)
      return Promise.resolve(headers.get('x-api-key') ? json(200, ANTHROPIC_OK) : json(200, OPENAI_OK))
    })
    const source = sourceOf({
      [TENANT_A]: { provider: 'openai', apiKey: KEY_A },
      [TENANT_B]: { provider: 'anthropic', apiKey: KEY_B },
    })

    const clientA = await createTenantAiClient(source, TENANT_A, NO_RETRIES)
    const clientB = await createTenantAiClient(source, TENANT_B, NO_RETRIES)
    await clientA.complete('a')
    const requestA = lastRequest()
    await clientB.complete('b')
    const requestB = lastRequest()

    expect(requestA.url).toContain('api.openai.com')
    expect(requestA.headers.get('authorization')).toBe(`Bearer ${KEY_A}`)
    expect(JSON.stringify([...requestA.headers])).not.toContain(KEY_B)
    expect(requestB.url).toContain('api.anthropic.com')
    expect(requestB.headers.get('x-api-key')).toBe(KEY_B)
    expect(JSON.stringify([...requestB.headers])).not.toContain(KEY_A)
  })

  it('a tenant without a key does not fall back to the key of a tenant that has one', async () => {
    const source = sourceOf({ [TENANT_A]: { provider: 'openai', apiKey: KEY_A } })

    const error = await rejectionOf(createTenantAiClient(source, TENANT_B))

    expect(error).toBeInstanceOf(HttpException)
    expect((error as HttpException).getStatus()).toBe(400)
    expect(((error as HttpException).getResponse() as { code: string }).code).toBe(AiErrorCode.KEY_NOT_CONFIGURED)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it("the stored key of tenant A cannot be read as tenant B's (real AiSettingsService, cipher bound to the tenant)", async () => {
    const stored = [
      { tenantId: TENANT_A, provider: 'OPENAI', encryptedKey: encrypt(KEY_A, TENANT_A), keyLast4: 'AAAA' },
    ]
    const db = {
      tenantAiCredential: {
        findUnique: ({ where }: { where: { tenantId: string } }) =>
          Promise.resolve(stored.find((row) => row.tenantId === where.tenantId) ?? null),
      },
    }
    const service = new AiSettingsService(new AiSettingsRepository(db as never), {} as AuditLogsService)

    await expect(service.getDecryptedCredential(TENANT_A)).resolves.toEqual({ provider: 'openai', apiKey: KEY_A })
    await expect(service.getDecryptedCredential(TENANT_B)).resolves.toBeNull()

    // A row copied under the other tenant's id fails authentication (AAD = tenantId).
    stored.push({ ...stored[0], tenantId: TENANT_B })
    const error = await rejectionOf(createTenantAiClient(service, TENANT_B))
    expect((error as HttpException).getResponse()).toMatchObject({ code: AiErrorCode.KEY_INVALID })
    expect(JSON.stringify(error)).not.toContain(KEY_A)
  })
})

describe('createTenantAiClient: no key', () => {
  it('rejects with 400 AI_KEY_NOT_CONFIGURED and makes no provider call', async () => {
    const source = sourceOf({})

    const error = (await rejectionOf(createTenantAiClient(source, TENANT_A))) as HttpException

    expect(error).toBeInstanceOf(HttpException)
    expect(error.getStatus()).toBe(400)
    expect(error.getResponse()).toMatchObject({ code: AiErrorCode.KEY_NOT_CONFIGURED })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('an undecryptable stored key (AiKeyCipherError) is reported as AI_KEY_INVALID, without details', async () => {
    const source: AiCredentialSource = {
      getDecryptedCredential: () => Promise.reject(new AiKeyCipherError('cannot decrypt')),
    }

    const error = (await rejectionOf(createTenantAiClient(source, TENANT_A))) as HttpException

    expect(error.getStatus()).toBe(400)
    expect(error.getResponse()).toMatchObject({ code: AiErrorCode.KEY_INVALID })
    expect(error.cause).toBeUndefined()
  })
})

describe('createTenantAiClient: provider errors on a real call', () => {
  const clientFor = (provider: 'openai' | 'anthropic' = 'openai') =>
    createTenantAiClient(sourceOf({ [TENANT_A]: { provider, apiKey: KEY_A } }), TENANT_A, NO_RETRIES)

  it.each([
    ['openai', 401],
    ['openai', 403],
    ['anthropic', 401],
    ['anthropic', 403],
  ] as const)('%s %i -> 400 AI_KEY_INVALID, without the key in the error or logs', async (provider, status) => {
    fetchMock.mockResolvedValue(json(status, echoingError(KEY_A)))
    const client = await clientFor(provider)

    const error = (await rejectionOf(client.complete('hello'))) as HttpException

    expect(error).toBeInstanceOf(HttpException)
    expect(error.getStatus()).toBe(400)
    expect(error.getResponse()).toMatchObject({ code: AiErrorCode.KEY_INVALID })
    expect(error.cause).toBeUndefined()
    expect(JSON.stringify(error.getResponse())).not.toContain(KEY_A)
    expect(error.message).not.toContain(KEY_A)
    expect(JSON.stringify(mockLogged)).not.toContain(KEY_A)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it.each([429, 500, 503, 529])('status %i -> 400 AI_PROVIDER_UNREACHABLE', async (status) => {
    fetchMock.mockResolvedValue(json(status, echoingError(KEY_A)))
    const client = await clientFor()

    const error = (await rejectionOf(client.complete('hello'))) as HttpException

    expect(error.getStatus()).toBe(400)
    expect(error.getResponse()).toMatchObject({ code: AiErrorCode.PROVIDER_UNREACHABLE })
    expect(JSON.stringify(error.getResponse())).not.toContain(KEY_A)
    expect(JSON.stringify(mockLogged)).not.toContain(KEY_A)
  })

  it('network failure -> AI_PROVIDER_UNREACHABLE', async () => {
    fetchMock.mockRejectedValue(new TypeError(`fetch failed for ${KEY_A}`))
    const client = await clientFor()

    const error = (await rejectionOf(client.complete('hello'))) as HttpException

    expect(error.getResponse()).toMatchObject({ code: AiErrorCode.PROVIDER_UNREACHABLE })
    expect(JSON.stringify(error.getResponse())).not.toContain(KEY_A)
    expect(JSON.stringify(mockLogged)).not.toContain(KEY_A)
  })

  it('another 4xx is not blamed on the key: a plain error with the status only, no provider text', async () => {
    fetchMock.mockResolvedValue(json(400, echoingError(KEY_A)))
    const client = await clientFor()

    const error = (await rejectionOf(client.complete('hello'))) as Error

    expect(error).not.toBeInstanceOf(HttpException)
    expect(error.message).toContain('400')
    expect(error.message).not.toContain(KEY_A)
    expect((error as { cause?: unknown }).cause).toBeUndefined()
    expect(JSON.stringify(mockLogged)).not.toContain(KEY_A)
  })
})

describe('toJobFailure: how the worker treats an error (BullMQ retries)', () => {
  const appError = async (setup: () => void) => {
    setup()
    const client = await createTenantAiClient(
      sourceOf({ [TENANT_A]: { provider: 'openai', apiKey: KEY_A } }),
      TENANT_A,
      NO_RETRIES,
    )
    return rejectionOf(client.complete('hello'))
  }

  it('no key: not retried (UnrecoverableError), reason AI_KEY_NOT_CONFIGURED', async () => {
    const error = await rejectionOf(createTenantAiClient(sourceOf({}), TENANT_A))

    const failure = toJobFailure(error)

    expect(failure?.reason).toBe(AiErrorCode.KEY_NOT_CONFIGURED)
    expect(failure?.error).toBeInstanceOf(UnrecoverableError)
    expect(failure?.error.message).toBe(AiErrorCode.KEY_NOT_CONFIGURED)
  })

  it('rejected key (401): not retried, reason AI_KEY_INVALID, no key in the error', async () => {
    const error = await appError(() => fetchMock.mockResolvedValue(json(401, echoingError(KEY_A))))

    const failure = toJobFailure(error)

    expect(failure?.reason).toBe(AiErrorCode.KEY_INVALID)
    expect(failure?.error).toBeInstanceOf(UnrecoverableError)
    expect(JSON.stringify([failure?.error.message, failure?.error.stack])).not.toContain(KEY_A)
  })

  it('provider unreachable (429/5xx/network): retried like before (a plain Error)', async () => {
    const error = await appError(() => fetchMock.mockResolvedValue(json(503, echoingError(KEY_A))))

    const failure = toJobFailure(error)

    expect(failure?.reason).toBe(AiErrorCode.PROVIDER_UNREACHABLE)
    expect(failure?.error).not.toBeInstanceOf(UnrecoverableError)
  })

  it('anything else is not classified', () => {
    expect(toJobFailure(new Error('boom'))).toBeNull()
    expect(toJobFailure(null)).toBeNull()
  })
})
