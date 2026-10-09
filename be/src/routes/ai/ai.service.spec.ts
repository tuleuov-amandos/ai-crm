import { HttpException } from '@nestjs/common'
import { AiErrorCode } from 'src/common/errors'
import { AiService } from './ai.service'
import { aiQueue } from './ai.queue'

// ai.queue opens a Redis connection when imported: stubbed.
jest.mock('./ai.queue', () => ({ aiQueue: { add: jest.fn() } }))

jest.mock('../../common/logger/root-logger', () => {
  const logger: Record<string, unknown> = {}
  for (const level of ['trace', 'debug', 'info', 'warn', 'error', 'fatal']) logger[level] = () => undefined
  logger.child = () => logger
  return { rootLogger: logger }
})

const TENANT_A = 'tenant-a'
const TENANT_B = 'tenant-b'
const KEY_A = 'sk-proj-tenant-a-secret-0123456789-AAAA'

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

const OPENAI_OK = {
  id: 'chatcmpl-1',
  object: 'chat.completion',
  created: 0,
  model: 'gpt-4o-mini',
  choices: [{ index: 0, finish_reason: 'stop', message: { role: 'assistant', content: 'mapped' } }],
}

let fetchMock: jest.SpyInstance
const addMock = (aiQueue as unknown as { add: jest.Mock }).add

// Only tenant A has a key.
const makeService = () => {
  const aiSettings = {
    getDecryptedCredential: jest.fn((tenantId: string) =>
      Promise.resolve(tenantId === TENANT_A ? { provider: 'openai' as const, apiKey: KEY_A } : null),
    ),
    isConfigured: jest.fn((tenantId: string) => Promise.resolve(tenantId === TENANT_A)),
  }
  const prisma = { tenant: { findUnique: jest.fn(() => Promise.resolve({ defaultLocale: 'en' })) } }
  const service = new AiService(prisma as never, aiSettings as never)
  return { service, aiSettings, prisma }
}

const rejectionOf = (promise: Promise<unknown>) =>
  promise.then(
    () => {
      throw new Error('expected promise to reject')
    },
    (e: unknown) => e,
  )

beforeEach(() => {
  fetchMock = jest.spyOn(globalThis, 'fetch')
  addMock.mockReset()
})

afterEach(() => {
  fetchMock.mockRestore()
})

describe('AiService.callModel', () => {
  it("calls the provider with the tenant's key", async () => {
    fetchMock.mockResolvedValue(json(200, OPENAI_OK))
    const { service, aiSettings } = makeService()

    const text = await service.callModel(TENANT_A, 'map these columns', { temperature: 0.1 })

    expect(text).toBe('mapped')
    expect(aiSettings.getDecryptedCredential).toHaveBeenCalledWith(TENANT_A)
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(new Headers(init.headers).get('authorization')).toBe(`Bearer ${KEY_A}`)
  })

  it('a tenant without a key gets 400 AI_KEY_NOT_CONFIGURED and no provider call (no fallback to another tenant)', async () => {
    const { service } = makeService()

    const error = (await rejectionOf(service.callModel(TENANT_B, 'map these columns'))) as HttpException

    expect(error.getStatus()).toBe(400)
    expect(error.getResponse()).toMatchObject({ code: AiErrorCode.KEY_NOT_CONFIGURED })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('a revoked key (provider 401) -> 400 AI_KEY_INVALID', async () => {
    fetchMock.mockResolvedValue(json(401, { error: { message: `bad key ${KEY_A}` } }))
    const { service } = makeService()

    const error = (await rejectionOf(service.callModel(TENANT_A, 'x'))) as HttpException

    expect(error.getStatus()).toBe(400)
    expect(error.getResponse()).toMatchObject({ code: AiErrorCode.KEY_INVALID })
    expect(JSON.stringify(error.getResponse())).not.toContain(KEY_A)
  })
})

describe('AiService.enqueueAnalysis', () => {
  const opts = (tenantId: string) => ({ dealId: 'deal-1', tenantId, userId: 'user-1', meetingNote: 'note' })

  it('without a key: 400 AI_KEY_NOT_CONFIGURED, nothing is queued', async () => {
    const { service } = makeService()

    const error = (await rejectionOf(service.enqueueAnalysis(opts(TENANT_B)))) as HttpException

    expect(error.getStatus()).toBe(400)
    expect(error.getResponse()).toMatchObject({ code: AiErrorCode.KEY_NOT_CONFIGURED })
    expect(addMock).not.toHaveBeenCalled()
  })

  it('with a key: queues the job without the key (and without decrypting it)', async () => {
    const { service, aiSettings } = makeService()

    const jobId = await service.enqueueAnalysis(opts(TENANT_A))

    expect(addMock).toHaveBeenCalledTimes(1)
    const [name, payload] = addMock.mock.calls[0]
    expect(name).toBe('analyze')
    expect(payload).toMatchObject({ jobId, tenantId: TENANT_A, dealId: 'deal-1', locale: 'en' })
    expect(JSON.stringify(addMock.mock.calls[0])).not.toContain(KEY_A)
    expect(aiSettings.getDecryptedCredential).not.toHaveBeenCalled()
  })
})
