jest.mock('../../instrument', () => ({
  Sentry: { captureException: jest.fn() },
  isConnectionError: jest.fn(),
  captureThrottled: jest.fn(),
}))
jest.mock('../../common/providers/redis.provider', () => ({ createRedis: jest.fn() }))
jest.mock('bullmq', () => ({ Worker: jest.fn(), Queue: jest.fn(), UnrecoverableError: class extends Error {} }))
jest.mock('./ai.sse', () => ({ publishAiEventRemote: jest.fn() }))
jest.mock('./ai.service', () => ({ saveAiResultAtomic: jest.fn() }))
jest.mock('../ai-settings/ai-settings.service', () => ({ AiSettingsService: jest.fn() }))
jest.mock('../ai-settings/ai-settings.repo', () => ({ AiSettingsRepository: jest.fn() }))
jest.mock('../../common/services/prisma.service', () => ({ PrismaService: jest.fn() }))

import { callOpenAiAndParse, loadTenantTimezone } from './ai.processor'
import type { AiClient } from './ai.client'
import type { Logger } from 'pino'
import type { PrismaService } from '../../common/services/prisma.service'

const prismaWith = (findUnique: jest.Mock) => ({ tenant: { findUnique } }) as unknown as PrismaService

const NOW = new Date('2026-10-11T20:30:00Z')
const DATE_LINE = 'Today is 2026-10-12 (Monday), timezone Asia/Almaty.'
const VALID = '{"tasks":[{"title":"Send offer","dueDate":"2026-10-16"}],"emailDraft":"e","summary":"s"}'

function clientReturning(...answers: string[]) {
  const complete = jest.fn()
  answers.forEach((a) => complete.mockResolvedValueOnce(a))
  return { client: { complete } as unknown as AiClient, complete }
}

describe('callOpenAiAndParse current date', () => {
  it('puts today and the company timezone into the main prompt', async () => {
    const { client, complete } = clientReturning(VALID)
    await callOpenAiAndParse(client, 'call until Friday', 'en', 'Asia/Almaty', NOW)
    const prompt = complete.mock.calls[0][0] as string
    expect(prompt).toContain(DATE_LINE)
    expect(prompt).toContain('Return dueDate as YYYY-MM-DD, or null if the note gives no date.')
  })

  it('puts the same line into the retry prompt', async () => {
    const { client, complete } = clientReturning('not json', VALID)
    await callOpenAiAndParse(client, 'call until Friday', 'en', 'Asia/Almaty', NOW)
    expect(complete).toHaveBeenCalledTimes(2)
    expect(complete.mock.calls[1][0]).toContain(DATE_LINE)
  })

  it('falls back to the default timezone when none is given', async () => {
    const { client, complete } = clientReturning(VALID)
    await callOpenAiAndParse(client, 'note', 'en', null, NOW)
    expect(complete.mock.calls[0][0]).toContain(DATE_LINE)
  })
})

describe('loadTenantTimezone', () => {
  const warn = jest.fn()
  const log = { warn } as unknown as Logger

  it('queries the tenant by its id explicitly', async () => {
    const findUnique = jest.fn().mockResolvedValue({ timezone: 'America/New_York' })
    const tz = await loadTenantTimezone(prismaWith(findUnique), 't1', log)
    expect(tz).toBe('America/New_York')
    expect(findUnique).toHaveBeenCalledWith({ where: { id: 't1' }, select: { timezone: true } })
  })

  it('returns null when the tenant is not found', async () => {
    const findUnique = jest.fn().mockResolvedValue(null)
    expect(await loadTenantTimezone(prismaWith(findUnique), 't1', log)).toBeNull()
  })

  it('returns null and warns without leaking the error when the query fails', async () => {
    const findUnique = jest.fn().mockRejectedValue(new Error('db down secret'))
    expect(await loadTenantTimezone(prismaWith(findUnique), 't1', log)).toBeNull()
    expect(warn).toHaveBeenCalledTimes(1)
    expect(JSON.stringify(warn.mock.calls)).not.toContain('secret')
  })
})
