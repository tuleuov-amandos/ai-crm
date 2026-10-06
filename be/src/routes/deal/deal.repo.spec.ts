import { PrismaService } from 'src/common/services/prisma.service'
import { DealRepository } from './deal.repo'

// The service resolves the PipelineStage (stageId + legacy stage) before any
// write; the repository writes both columns together and looks nothing up.
describe('DealRepository dual write of stage + stageId', () => {
  const buildPrisma = () => ({
    pipelineStage: {
      findFirst: jest.fn().mockResolvedValue({ id: 'stage-x', kind: 'OPEN', legacyKey: null }),
    },
    deal: {
      create: jest.fn().mockResolvedValue({ id: 'deal-1' }),
      update: jest.fn().mockResolvedValue({ id: 'deal-1' }),
    },
  })

  it('create() writes the resolved stage together with its stageId', async () => {
    const prisma = buildPrisma()
    const repo = new DealRepository(prisma as unknown as PrismaService)

    await repo.create(
      { ownerId: 'u1', title: 'Deal', value: 0, contactId: 'c1', note: null },
      { stageId: 'stage-custom', stage: 'PROSPECT' },
    )

    expect(prisma.pipelineStage.findFirst).not.toHaveBeenCalled()
    expect(prisma.deal.create).toHaveBeenCalledWith({
      data: {
        ownerId: 'u1',
        title: 'Deal',
        value: 0,
        stage: 'PROSPECT',
        stageId: 'stage-custom',
        contactId: 'c1',
        closeDate: null,
        note: null,
      },
    })
  })

  it('create() never writes stage or stageId taken from the body', async () => {
    const prisma = buildPrisma()
    const repo = new DealRepository(prisma as unknown as PrismaService)

    await repo.create(
      { ownerId: 'u1', title: 'Deal', value: 0, contactId: 'c1', note: null, stage: 'QUALIFIED', stageId: 'foreign' },
      { stageId: 'stage-won', stage: 'CLOSED_WON' },
    )

    expect(prisma.deal.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ stage: 'CLOSED_WON', stageId: 'stage-won' }),
    })
  })

  it('updateStage() writes stage and stageId together', async () => {
    const prisma = buildPrisma()
    const repo = new DealRepository(prisma as unknown as PrismaService)

    await repo.updateStage('deal-1', { stageId: 'stage-won', stage: 'CLOSED_WON' })

    expect(prisma.pipelineStage.findFirst).not.toHaveBeenCalled()
    expect(prisma.deal.update).toHaveBeenCalledWith({
      where: { id: 'deal-1', deletedAt: null },
      data: { stage: 'CLOSED_WON', stageId: 'stage-won' },
    })
  })

  it('createWithStage() (Excel import) writes the stage it was given without looking it up again', async () => {
    const prisma = buildPrisma()
    const repo = new DealRepository(prisma as unknown as PrismaService)

    await repo.createWithStage({
      ownerId: 'u1',
      title: 'Imported',
      value: 10,
      stage: 'QUALIFIED',
      stageId: 'stage-qualified',
      contactId: 'c1',
    })

    expect(prisma.pipelineStage.findFirst).not.toHaveBeenCalled()
    expect(prisma.deal.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ stage: 'QUALIFIED', stageId: 'stage-qualified' }),
    })
  })

  it('findStageById() only finds a stage of the given tenant', async () => {
    const prisma = buildPrisma()
    const repo = new DealRepository(prisma as unknown as PrismaService)

    await repo.findStageById('tenant-1', 'stage-x')

    expect(prisma.pipelineStage.findFirst).toHaveBeenCalledWith({
      where: { id: 'stage-x', tenantId: 'tenant-1' },
      select: { id: true, kind: true, legacyKey: true },
    })
  })
})
