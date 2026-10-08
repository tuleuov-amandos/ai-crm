import { ContactsService } from './contacts.service'
import { BulkImportContactsBodyDto } from './contacts.dto'
import { GetContactResSchema } from './contacts.model'
import { ContactsRepository } from './contacts.repo'

// ai.service -> ai.queue opens a Redis connection at import time; not needed here.
jest.mock('../ai/ai.service', () => ({ AiService: class {} }))

// Excel import: the deal stage text is matched against the tenant's pipeline
// stages, read once per import.

const TENANT = 't1'

const stage = (id: string, name: string, order: number, kind: string, legacyKey: string | null) => ({
  id,
  tenantId: TENANT,
  name,
  order,
  kind,
  legacyKey,
  color: 'blue',
  probability: 10,
  createdAt: new Date(),
  updatedAt: new Date(),
})

// Ordered like PipelineStagesRepository.findAll (order, then createdAt). The
// tenant moved a custom stage in front of the defaults.
const STAGES = [
  stage('s-new', 'Новая заявка', 0, 'OPEN', null),
  stage('s-prospect', 'Лид', 1, 'OPEN', 'PROSPECT'),
  stage('s-qualified', 'Контакт установлен', 2, 'OPEN', 'QUALIFIED'),
  stage('s-proposal', 'Предложение', 3, 'OPEN', 'PROPOSAL'),
  stage('s-won', 'Выиграно', 4, 'WON', 'CLOSED_WON'),
  stage('s-lost', 'Проиграно', 5, 'LOST', 'CLOSED_LOST'),
]

describe('ContactsService.bulkImport deal stage matching', () => {
  let service: ContactsService
  let seq = 0
  const contactRepository = {
    prismaService: { user: { findMany: jest.fn().mockResolvedValue([]) } },
    findByEmailOrPhone: jest.fn().mockResolvedValue(null),
    create: jest.fn(() => {
      seq += 1
      return Promise.resolve({ id: `c${seq}`, name: `Contact ${seq}` })
    }),
  }
  const dealRepository = {
    createWithStage: jest.fn((data: Record<string, unknown>) => Promise.resolve({ id: 'd', ...data })),
  }
  const pipelineStagesRepo = { findAll: jest.fn() }

  const importStages = async (dealStages: (string | null | undefined)[], stages = STAGES) => {
    pipelineStagesRepo.findAll.mockResolvedValue(stages)
    const body = {
      contacts: dealStages.map((dealStage, i) => ({ name: `Contact ${i}`, dealTitle: `Deal ${i}`, dealStage })),
    } as BulkImportContactsBodyDto
    await service.bulkImport(TENANT, 'u1', body)
    return dealRepository.createWithStage.mock.calls.map(([data]) => ({ stageId: data.stageId, stage: data.stage }))
  }

  beforeEach(() => {
    jest.clearAllMocks()
    service = new ContactsService(
      contactRepository as never,
      { invalidateTenantCache: jest.fn() } as never,
      { logAction: jest.fn() } as never,
      {} as never,
      dealRepository as never,
      {} as never,
      pipelineStagesRepo as never,
    )
  })

  it('matches a stage name ignoring case and surrounding spaces', async () => {
    expect(await importStages(['  контакт УСТАНОВЛЕН ', 'новая заявка'])).toEqual([
      { stageId: 's-qualified', stage: 'QUALIFIED' },
      { stageId: 's-new', stage: 'PROSPECT' },
    ])
  })

  it('maps the Russian «Выиграно» to the WON stage instead of PROSPECT', async () => {
    expect(await importStages(['Выиграно', 'проиграно'])).toEqual([
      { stageId: 's-won', stage: 'CLOSED_WON' },
      { stageId: 's-lost', stage: 'CLOSED_LOST' },
    ])
  })

  it('matches a legacyKey ignoring case', async () => {
    expect(await importStages(['closed_won', 'Proposal', 'QUALIFIED'])).toEqual([
      { stageId: 's-won', stage: 'CLOSED_WON' },
      { stageId: 's-proposal', stage: 'PROPOSAL' },
      { stageId: 's-qualified', stage: 'QUALIFIED' },
    ])
  })

  it('keeps the old English words, resolved through the stage with that legacyKey', async () => {
    expect(await importStages(['Deal won', 'lost', 'qualified lead', 'new prospect', 'proposal sent'])).toEqual([
      { stageId: 's-won', stage: 'CLOSED_WON' },
      { stageId: 's-lost', stage: 'CLOSED_LOST' },
      { stageId: 's-qualified', stage: 'QUALIFIED' },
      { stageId: 's-prospect', stage: 'PROSPECT' },
      { stageId: 's-proposal', stage: 'PROPOSAL' },
    ])
  })

  it('puts unknown or empty text into the first open stage', async () => {
    expect(await importStages(['что-то непонятное', '', null, undefined])).toEqual([
      { stageId: 's-new', stage: 'PROSPECT' },
      { stageId: 's-new', stage: 'PROSPECT' },
      { stageId: 's-new', stage: 'PROSPECT' },
      { stageId: 's-new', stage: 'PROSPECT' },
    ])
  })

  it('falls back to the first open stage when an old word maps to a legacyKey the tenant has no stage for', async () => {
    const withoutProposal = STAGES.filter((s) => s.legacyKey !== 'PROPOSAL')

    expect(await importStages(['proposal'], withoutProposal)).toEqual([{ stageId: 's-new', stage: 'PROSPECT' }])
  })

  it('reads the tenant stages once per import, not once per row', async () => {
    await importStages(['Лид', 'won', 'xyz', 'closed_lost'])

    expect(pipelineStagesRepo.findAll).toHaveBeenCalledTimes(1)
    expect(pipelineStagesRepo.findAll).toHaveBeenCalledWith(TENANT)
    expect(dealRepository.createWithStage).toHaveBeenCalledTimes(4)
  })
})

describe('ContactsService.getContactById deals', () => {
  const now = new Date()
  const deal = (id: string, stageId: string | null) => ({
    id,
    title: `Deal ${id}`,
    stage: 'PROSPECT',
    stageId,
    value: '1000',
    deletedAt: null,
    archivedAt: null as Date | null,
  })
  const contact = {
    id: 'c1',
    tenantId: TENANT,
    ownerId: 'u1',
    name: 'Contact',
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
    deals: [deal('d1', 's-new'), deal('d2', null)],
    activities: [],
  }
  const user = { userId: 'u1', role: 'ADMIN', tenantId: TENANT }

  it('returns the deals with stageId (custom stage and null) from the service', async () => {
    const service = new ContactsService(
      { findOne: jest.fn().mockResolvedValue(contact) } as never,
      {} as never,
      {} as never,
      { createForUser: jest.fn().mockResolvedValue({ cannot: () => false }) } as never,
      {} as never,
      {} as never,
      {} as never,
    )

    const res = await service.getContactById('c1', TENANT, user)

    expect(res.deals.map((d) => d.stageId)).toEqual(['s-new', null])
  })

  it('keeps stageId in the GET /contacts/:id response schema, next to the legacy stage', () => {
    const res = GetContactResSchema.parse(contact)

    expect(res.deals.map(({ stage, stageId }) => ({ stage, stageId }))).toEqual([
      { stage: 'PROSPECT', stageId: 's-new' },
      { stage: 'PROSPECT', stageId: null },
    ])
  })

  it('keeps archived deals in GET /contacts/:id and carries archivedAt', () => {
    const archivedAt = new Date(Date.UTC(2026, 5, 1))
    const res = GetContactResSchema.parse({
      ...contact,
      deals: [deal('d1', 's-new'), { ...deal('d2', null), archivedAt }],
    })

    expect(res.deals.map((d) => [d.id, d.archivedAt])).toEqual([
      ['d1', null],
      ['d2', archivedAt],
    ])
    expect(JSON.parse(JSON.stringify(res)).deals[1].archivedAt).toBe('2026-06-01T00:00:00.000Z')
  })

  it('does not filter the contact deals by archivedAt in the repository', async () => {
    const findFirst = jest.fn().mockResolvedValue(null)
    const repo = new ContactsRepository({ contact: { findFirst } } as never)

    await repo.findOne('c1')

    expect(findFirst.mock.calls[0][0].include.deals).toEqual({ where: { deletedAt: null } })
  })
})
