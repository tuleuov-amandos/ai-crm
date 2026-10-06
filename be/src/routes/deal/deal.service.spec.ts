import { HttpException, HttpStatus } from '@nestjs/common'
import { AbilityBuilder, createMongoAbility } from '@casl/ability'
import { DealErrorCode } from 'src/common/errors'
import { PrismaService } from 'src/common/services/prisma.service'
import { PrismaClientKnownRequestError } from '../../../generated/prisma-client/internal/prismaNamespace'
import { DealService } from './deal.service'
import { DealRepository } from './deal.repo'
import { CreateDealResSchema, DealCardSchema, GetDealResSchema, UpdateDealResSchema } from './deal.model'

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

// ─── Writes: POST /deals and PATCH /deals/:id/stage switched to PipelineStage ───
// Real DealRepository on an in-memory Prisma: stage lookups honor where/orderBy,
// so tenant scoping and "first open stage by order" are exercised for real.

type Row = Record<string, unknown>

const OTHER_TENANT = 't2'
const writeStage = (id: string, order: number, kind: string, legacyKey: string | null, tenantId = TENANT) => ({
  id,
  tenantId,
  name: id,
  order,
  kind,
  legacyKey,
  createdAt: new Date(Date.UTC(2026, 0, 1, 0, 0, order)),
})
const DEFAULT_WRITE_STAGES = [
  writeStage('s-prospect', 0, 'OPEN', 'PROSPECT'),
  writeStage('s-qualified', 1, 'OPEN', 'QUALIFIED'),
  writeStage('s-proposal', 2, 'OPEN', 'PROPOSAL'),
  writeStage('s-custom', 3, 'OPEN', null),
  writeStage('s-won', 4, 'WON', 'CLOSED_WON'),
  writeStage('s-lost', 5, 'LOST', 'CLOSED_LOST'),
  writeStage('s-foreign', 0, 'OPEN', 'PROSPECT', OTHER_TENANT),
]

const EXISTING_DEAL = {
  id: 'deal-1',
  tenantId: TENANT,
  contactId: 'c1',
  ownerId: ADMIN.userId,
  title: 'Existing',
  value: 100,
  stage: 'QUALIFIED',
  stageId: 's-qualified',
  isPaid: false,
  closeDate: null,
  note: null,
  createdAt: new Date(Date.UTC(2026, 0, 1)),
  updatedAt: new Date(Date.UTC(2026, 0, 1)),
  deletedAt: null,
}

const buildDb = (stages: Row[] = DEFAULT_WRITE_STAGES) => {
  const matches = (row: Row, where: Row) => Object.entries(where).every(([key, value]) => row[key] === value)
  const sortBy = (rows: Row[], orderBy: Record<string, 'asc' | 'desc'>[] = []) =>
    [...rows].sort((a, b) => {
      for (const order of orderBy) {
        const [key, dir] = Object.entries(order)[0]
        const diff = (a[key] as number) < (b[key] as number) ? -1 : (a[key] as number) > (b[key] as number) ? 1 : 0
        if (diff) return dir === 'asc' ? diff : -diff
      }
      return 0
    })
  const pick = (row: Row, select?: Record<string, boolean>) =>
    select ? Object.fromEntries(Object.keys(select).map((key) => [key, row[key]])) : row

  return {
    pipelineStage: {
      findFirst: jest.fn(
        ({
          where,
          orderBy,
          select,
        }: {
          where: Row
          orderBy?: Record<string, 'asc'>[]
          select?: Record<string, boolean>
        }) => {
          const row = sortBy(
            stages.filter((stage) => matches(stage, where)),
            orderBy,
          )[0]
          return Promise.resolve(row ? pick(row, select) : null)
        },
      ),
    },
    deal: {
      findFirst: jest.fn().mockResolvedValue({ ...EXISTING_DEAL }),
      create: jest.fn(({ data }: { data: Row }) =>
        Promise.resolve({
          id: 'deal-new',
          tenantId: TENANT,
          isPaid: false,
          createdAt: new Date(),
          updatedAt: new Date(),
          deletedAt: null,
          ...data,
        }),
      ),
      update: jest.fn(({ data }: { data: Row }) => Promise.resolve({ ...EXISTING_DEAL, ...data })),
    },
  }
}

const fkError = (constraint: string) =>
  new PrismaClientKnownRequestError(`Foreign key constraint violated on the constraint: \`${constraint}\``, {
    code: 'P2003',
    clientVersion: 'test',
  })

const expectInvalidStage = async (call: Promise<unknown>) => {
  const err = await call.catch((e: unknown) => e)
  expect(err).toBeInstanceOf(HttpException)
  expect((err as HttpException).getStatus()).toBe(HttpStatus.UNPROCESSABLE_ENTITY)
  expect(((err as HttpException).getResponse() as { code: string }).code).toBe(DealErrorCode.INVALID_STAGE)
}

describe('DealService writes deals into pipeline stages', () => {
  let db: ReturnType<typeof buildDb>
  let service: DealService
  const redisService = { invalidateTenantCache: jest.fn() }
  const auditLogsService = { logAction: jest.fn() }
  const caslAbilityFactory = { createForUser: jest.fn() }
  const NEW_DEAL = { ownerId: ADMIN.userId, title: 'New deal', value: 50, contactId: 'c1', note: null }

  const build = (stages?: Row[]) => {
    db = buildDb(stages)
    service = new DealService(
      new DealRepository(db as unknown as PrismaService),
      {} as never,
      {} as never,
      {} as never,
      redisService as never,
      auditLogsService as never,
      caslAbilityFactory as never,
      {} as never,
    )
  }

  beforeEach(() => {
    jest.clearAllMocks()
    caslAbilityFactory.createForUser.mockResolvedValue(adminAbility())
    build()
  })

  describe('create (POST /deals)', () => {
    it('without stage or stageId puts the deal into the first open stage', async () => {
      const created = await service.create(TENANT, NEW_DEAL, ADMIN)

      expect(db.deal.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ stageId: 's-prospect', stage: 'PROSPECT' }),
      })
      expect(created).toMatchObject({ stageId: 's-prospect', stage: 'PROSPECT' })
    })

    it('uses the first open stage by order when the tenant reordered its pipeline', async () => {
      // The default stage is older than the custom one moved in front of it.
      build([
        writeStage('s-won', 0, 'WON', 'CLOSED_WON'),
        { ...writeStage('s-prospect', 2, 'OPEN', 'PROSPECT'), createdAt: new Date(Date.UTC(2025, 0, 1)) },
        writeStage('s-custom', 1, 'OPEN', null),
        writeStage('s-foreign', -1, 'OPEN', null, OTHER_TENANT),
      ])

      await service.create(TENANT, NEW_DEAL, ADMIN)

      expect(db.deal.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ stageId: 's-custom', stage: 'PROSPECT' }),
      })
    })

    it('accepts the legacy { stage } format', async () => {
      await service.create(TENANT, { ...NEW_DEAL, stage: 'PROPOSAL' }, ADMIN)

      expect(db.deal.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ stageId: 's-proposal', stage: 'PROPOSAL' }),
      })
    })

    it('accepts { stageId } and writes the legacy stage derived from it', async () => {
      await service.create(TENANT, { ...NEW_DEAL, stageId: 's-won' }, ADMIN)

      expect(db.deal.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ stageId: 's-won', stage: 'CLOSED_WON' }),
      })
    })

    it('rejects stage and stageId together with 422 INVALID_STAGE', async () => {
      await expectInvalidStage(service.create(TENANT, { ...NEW_DEAL, stage: 'PROSPECT', stageId: 's-prospect' }, ADMIN))
      expect(db.deal.create).not.toHaveBeenCalled()
    })

    it("rejects another tenant's stageId with 422 INVALID_STAGE and writes nothing", async () => {
      await expectInvalidStage(service.create(TENANT, { ...NEW_DEAL, stageId: 's-foreign' }, ADMIN))
      expect(db.pipelineStage.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 's-foreign', tenantId: TENANT } }),
      )
      expect(db.deal.create).not.toHaveBeenCalled()
      expect(auditLogsService.logAction).not.toHaveBeenCalled()
      expect(redisService.invalidateTenantCache).not.toHaveBeenCalled()
    })

    it('rejects an unknown legacy stage with 422 INVALID_STAGE', async () => {
      await expectInvalidStage(service.create(TENANT, { ...NEW_DEAL, stage: 'WON' as never }, ADMIN))
      expect(db.deal.create).not.toHaveBeenCalled()
    })

    it('turns a stage foreign key violation (stage deleted concurrently) into 422, not 500', async () => {
      db.deal.create.mockRejectedValueOnce(fkError('Deal_stageId_fkey'))

      await expectInvalidStage(service.create(TENANT, { ...NEW_DEAL, stageId: 's-custom' }, ADMIN))
      expect(auditLogsService.logAction).not.toHaveBeenCalled()
    })

    it('leaves other foreign key violations untouched', async () => {
      const error = fkError('Deal_contactId_fkey')
      db.deal.create.mockRejectedValueOnce(error)

      await expect(service.create(TENANT, NEW_DEAL, ADMIN)).rejects.toBe(error)
    })
  })

  describe('updateDealStage (PATCH /deals/:id/stage)', () => {
    it('legacy { stage } works as before and keeps the audit format', async () => {
      const updated = await service.updateDealStage('deal-1', TENANT, { stage: 'PROPOSAL' }, ADMIN)

      expect(db.deal.update).toHaveBeenCalledWith({
        where: { id: 'deal-1', deletedAt: null },
        data: { stage: 'PROPOSAL', stageId: 's-proposal' },
      })
      expect(updated).toMatchObject({ stage: 'PROPOSAL', stageId: 's-proposal' })
      expect(auditLogsService.logAction).toHaveBeenCalledWith(
        expect.objectContaining({ changes: { stage: { old: 'QUALIFIED', new: 'PROPOSAL' } } }),
      )
      expect(redisService.invalidateTenantCache).toHaveBeenCalledWith(TENANT)
    })

    it.each([
      ['s-won', 'CLOSED_WON'],
      ['s-lost', 'CLOSED_LOST'],
      ['s-custom', 'PROSPECT'],
      ['s-proposal', 'PROPOSAL'],
      ['s-prospect', 'PROSPECT'],
    ])('{ stageId: %s } writes stage %s and logs it in the old audit format', async (stageId, legacy) => {
      await service.updateDealStage('deal-1', TENANT, { stageId }, ADMIN)

      expect(db.deal.update).toHaveBeenCalledWith({
        where: { id: 'deal-1', deletedAt: null },
        data: { stage: legacy, stageId },
      })
      expect(auditLogsService.logAction).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'UPDATE', changes: { stage: { old: 'QUALIFIED', new: legacy } } }),
      )
      expect(redisService.invalidateTenantCache).toHaveBeenCalledWith(TENANT)
    })

    it.each([
      ['another tenant stageId', { stageId: 's-foreign' }],
      ['unknown stageId', { stageId: 'nope' }],
      ['neither stage nor stageId', {}],
      ['both stage and stageId', { stage: 'PROSPECT', stageId: 's-prospect' }],
      ['unknown stage', { stage: 'WON' }],
    ])('rejects %s with 422 INVALID_STAGE and writes nothing', async (_name, body) => {
      await expectInvalidStage(service.updateDealStage('deal-1', TENANT, body, ADMIN))
      expect(db.deal.update).not.toHaveBeenCalled()
      expect(auditLogsService.logAction).not.toHaveBeenCalled()
    })

    it('still answers 404 before validating the stage when the user may not update the deal', async () => {
      caslAbilityFactory.createForUser.mockResolvedValue(noDealAbility())

      const err = await service.updateDealStage('deal-1', TENANT, { stageId: 's-foreign' }, SALES_REP).catch((e) => e)

      expect((err as HttpException).getStatus()).toBe(HttpStatus.NOT_FOUND)
      expect(db.pipelineStage.findFirst).not.toHaveBeenCalled()
    })

    it('turns a stage foreign key violation (stage deleted concurrently) into 422, not 500', async () => {
      db.deal.update.mockRejectedValueOnce(fkError('Deal_stageId_fkey'))

      await expectInvalidStage(service.updateDealStage('deal-1', TENANT, { stageId: 's-custom' }, ADMIN))
      expect(auditLogsService.logAction).not.toHaveBeenCalled()
    })
  })

  describe('update (PATCH /deals/:id)', () => {
    it('cannot change stage or stageId (or other non-editable columns) around the dual write', async () => {
      const body = { title: 'Renamed', stage: 'CLOSED_WON', stageId: 's-won', isPaid: true, tenantId: OTHER_TENANT }

      await service.update('deal-1', TENANT, body, ADMIN)

      expect(db.deal.update).toHaveBeenCalledWith({
        where: { id: 'deal-1', deletedAt: null },
        data: { title: 'Renamed' },
      })
      expect(auditLogsService.logAction).toHaveBeenCalledWith(
        expect.objectContaining({ changes: { title: { old: 'Existing', new: 'Renamed' } } }),
      )
    })

    it('still writes every editable field', async () => {
      const body = { title: 'T', ownerId: 'u2', value: 5, closeDate: '2026-02-01T00:00:00.000Z', note: 'n' }

      await service.update('deal-1', TENANT, body as never, ADMIN)

      expect(db.deal.update).toHaveBeenCalledWith({ where: { id: 'deal-1', deletedAt: null }, data: body })
    })
  })
})

describe('deal responses', () => {
  const row = { ...EXISTING_DEAL, stageId: 's-qualified' }

  it('create/update responses add stageId and keep every old field', () => {
    const parsed = CreateDealResSchema.parse(row)
    expect(parsed).toMatchObject({ stageId: 's-qualified', stage: 'QUALIFIED', title: 'Existing', isPaid: false })
    expect(UpdateDealResSchema.parse({ ...row, stageId: null }).stageId).toBeNull()
  })

  it('GET /deals/:id adds stageId', () => {
    const parsed = GetDealResSchema.parse({
      ...row,
      contact: { id: 'c1', name: 'C', email: null, phone: null, company: null, position: null, city: null },
      owner: { id: 'u1', name: 'U', email: 'u@x' },
      tasks: [],
      activities: [],
      aiSuggestions: [],
    })
    expect(parsed.stageId).toBe('s-qualified')
  })

  it('GET /deals/pipeline cards stay unchanged (no stageId)', () => {
    const parsed = DealCardSchema.parse({
      ...row,
      contact: { id: 'c1', name: 'C', company: null },
      owner: { id: 'u1', name: 'U' },
    })
    expect(parsed).not.toHaveProperty('stageId')
  })
})
