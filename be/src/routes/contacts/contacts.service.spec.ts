import { ContactsService } from './contacts.service'
import { BulkImportContactsBodyDto } from './contacts.dto'

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

  it('keeps the old English and Vietnamese words, resolved through the stage with that legacyKey', async () => {
    expect(
      await importStages(['Deal won', 'lost', 'qualified lead', 'Mới', 'Tiềm năng', 'Đề xuất', 'Thắng', 'Thất bại']),
    ).toEqual([
      { stageId: 's-won', stage: 'CLOSED_WON' },
      { stageId: 's-lost', stage: 'CLOSED_LOST' },
      { stageId: 's-qualified', stage: 'QUALIFIED' },
      { stageId: 's-prospect', stage: 'PROSPECT' },
      { stageId: 's-qualified', stage: 'QUALIFIED' },
      { stageId: 's-proposal', stage: 'PROPOSAL' },
      { stageId: 's-won', stage: 'CLOSED_WON' },
      { stageId: 's-lost', stage: 'CLOSED_LOST' },
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
