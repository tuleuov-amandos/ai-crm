import { HttpException, HttpStatus } from '@nestjs/common'
import { AbilityBuilder, createMongoAbility } from '@casl/ability'
import { DealErrorCode } from 'src/common/errors'
import { DealService } from './deal.service'

// ai.service -> ai.queue opens a Redis connection at import time; not needed here.
jest.mock('../ai/ai.service', () => ({ AiService: class {} }))

// GET /deals/board vs GET /deals/pipeline: same CASL checks and filters (one
// shared private method), board groups by stageId into the tenant's stages.

const TENANT = 't1'
const ADMIN = { userId: 'admin-1', role: 'ADMIN', tenantId: TENANT }
const SALES_REP = { userId: 'rep-1', role: 'SALES_REP', tenantId: TENANT }

const adminAbility = () => {
  const { can, build } = new AbilityBuilder(createMongoAbility)
  can('manage', 'all')
  return build()
}
const salesRepAbility = () => {
  const { can, build } = new AbilityBuilder(createMongoAbility)
  can('read', 'Deal', { ownerId: SALES_REP.userId })
  return build()
}
const noDealAbility = () => new AbilityBuilder(createMongoAbility).build()

const STAGES = [
  { id: 's-prospect', legacyKey: 'PROSPECT', name: 'Лид', color: 'blue', order: 0, kind: 'OPEN', probability: 10 },
  {
    id: 's-qualified',
    legacyKey: 'QUALIFIED',
    name: 'Контакт',
    color: 'purple',
    order: 1,
    kind: 'OPEN',
    probability: 30,
  },
  {
    id: 's-proposal',
    legacyKey: 'PROPOSAL',
    name: 'Предложение',
    color: 'orange',
    order: 2,
    kind: 'OPEN',
    probability: 60,
  },
  { id: 's-won', legacyKey: 'CLOSED_WON', name: 'Выиграно', color: 'green', order: 3, kind: 'WON', probability: 100 },
  { id: 's-lost', legacyKey: 'CLOSED_LOST', name: 'Проиграно', color: 'red', order: 4, kind: 'LOST', probability: 0 },
].map((s) => ({ ...s, tenantId: TENANT, createdAt: new Date(), updatedAt: new Date() }))

const stageIdByKey = Object.fromEntries(STAGES.map((s) => [s.legacyKey, s.id]))

let seq = 0
const deal = (stage: string, ownerId: string, stageId: string | null = stageIdByKey[stage]) => {
  seq += 1
  return {
    id: `d${seq}`,
    tenantId: TENANT,
    contactId: 'c1',
    ownerId,
    title: `Deal ${seq}`,
    value: 100,
    stage,
    stageId,
    isPaid: false,
    closeDate: null,
    note: null,
    createdAt: new Date(Date.UTC(2026, 0, seq)),
    updatedAt: new Date(Date.UTC(2026, 0, seq)),
    deletedAt: null,
    contact: { id: 'c1', name: 'Contact', company: null },
    owner: { id: ownerId, name: ownerId },
  }
}

const DEALS = [
  deal('PROSPECT', 'admin-1'),
  deal('PROSPECT', 'rep-1'),
  deal('QUALIFIED', 'rep-1'),
  deal('PROPOSAL', 'admin-1'),
  deal('CLOSED_WON', 'rep-1'),
  deal('CLOSED_WON', 'admin-1'),
  deal('CLOSED_LOST', 'admin-1'),
  // A deal written without stageId still lands in its legacy column.
  deal('QUALIFIED', 'admin-1', null),
]

describe('DealService board vs pipeline', () => {
  let service: DealService
  const dealRepo = {
    // Emulates the DB-side ownerId filter so visibility is observable.
    findAllByTenant: jest.fn((filters?: { ownerId?: string }) =>
      Promise.resolve(DEALS.filter((d) => !filters?.ownerId || d.ownerId === filters.ownerId)),
    ),
  }
  const pipelineStagesRepo = { findAll: jest.fn().mockResolvedValue(STAGES) }
  const caslAbilityFactory = { createForUser: jest.fn() }

  beforeEach(() => {
    jest.clearAllMocks()
    service = new DealService(
      dealRepo as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      caslAbilityFactory as never,
      pipelineStagesRepo as never,
    )
  })

  it('on the 5 default stages gives the same deals per column as the pipeline per key', async () => {
    caslAbilityFactory.createForUser.mockResolvedValue(adminAbility())

    const pipeline = await service.getPipleline(TENANT, ADMIN, {})
    const board = await service.getBoard(TENANT, ADMIN, {})

    expect(board.map((column) => column.stage.id)).toEqual(STAGES.map((s) => s.id))
    for (const column of board) {
      const key = STAGES.find((s) => s.id === column.stage.id).legacyKey as keyof typeof pipeline
      expect(column.deals.map((d) => d.id)).toEqual(pipeline[key].map((d) => d.id))
    }
    expect(board.flatMap((c) => c.deals)).toHaveLength(DEALS.length)
    expect(pipelineStagesRepo.findAll).toHaveBeenCalledWith(TENANT)
  })

  it('returns the column stage fields and adds stageId to the card', async () => {
    caslAbilityFactory.createForUser.mockResolvedValue(adminAbility())

    const board = await service.getBoard(TENANT, ADMIN, {})

    expect(board[3].stage).toEqual({
      id: 's-won',
      name: 'Выиграно',
      color: 'green',
      order: 3,
      kind: 'WON',
      probability: 100,
    })
    expect(board[3].deals[0]).toMatchObject({ id: 'd5', stageId: 's-won', stage: 'CLOSED_WON' })
  })

  it('SALES_REP sees only own deals on the board, query.ownerId is ignored', async () => {
    caslAbilityFactory.createForUser.mockResolvedValue(salesRepAbility())

    const board = await service.getBoard(TENANT, SALES_REP, { ownerId: 'admin-1' })

    expect(dealRepo.findAllByTenant).toHaveBeenCalledWith({ ownerId: SALES_REP.userId })
    const ids = board.flatMap((c) => c.deals.map((d) => d.ownerId))
    expect(ids.length).toBeGreaterThan(0)
    expect(new Set(ids)).toEqual(new Set([SALES_REP.userId]))
  })

  it('applies the same filters as the pipeline', async () => {
    caslAbilityFactory.createForUser.mockResolvedValue(adminAbility())
    const query = {
      ownerId: 'rep-1',
      dateFrom: '2026-01-01',
      dateTo: '2026-02-01',
      search: 'acme',
      isPaid: 'true' as const,
    }

    await service.getPipleline(TENANT, ADMIN, query)
    await service.getBoard(TENANT, ADMIN, query)

    const expected = { ownerId: 'rep-1', dateFrom: '2026-01-01', dateTo: '2026-02-01', search: 'acme', isPaid: true }
    expect(dealRepo.findAllByTenant).toHaveBeenNthCalledWith(1, expected)
    expect(dealRepo.findAllByTenant).toHaveBeenNthCalledWith(2, expected)
  })

  it('rejects a role without read:Deal with 403, like the pipeline', async () => {
    caslAbilityFactory.createForUser.mockResolvedValue(noDealAbility())

    for (const call of [service.getPipleline(TENANT, SALES_REP, {}), service.getBoard(TENANT, SALES_REP, {})]) {
      const err = await call.catch((e: unknown) => e)
      expect(err).toBeInstanceOf(HttpException)
      expect((err as HttpException).getStatus()).toBe(HttpStatus.FORBIDDEN)
      expect(((err as HttpException).getResponse() as { code: string }).code).toBe(DealErrorCode.FORBIDDEN_LIST)
    }
    expect(dealRepo.findAllByTenant).not.toHaveBeenCalled()
    expect(pipelineStagesRepo.findAll).not.toHaveBeenCalled()
  })
})
