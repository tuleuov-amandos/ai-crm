import { PrismaService } from 'src/common/services/prisma.service'
import { DealRepository } from './deal.repo'

describe('DealRepository dual write of stage + stageId', () => {
  const stageIds: Record<string, string> = {
    PROSPECT: 'stage-prospect',
    QUALIFIED: 'stage-qualified',
    CLOSED_WON: 'stage-won',
  }

  const buildPrisma = () => ({
    pipelineStage: {
      findFirst: jest.fn(({ where }: { where: { legacyKey: string } }) =>
        Promise.resolve(stageIds[where.legacyKey] ? { id: stageIds[where.legacyKey] } : null),
      ),
    },
    deal: {
      create: jest.fn().mockResolvedValue({ id: 'deal-1' }),
      update: jest.fn().mockResolvedValue({ id: 'deal-1' }),
    },
  })

  it('create() writes the default PROSPECT stage together with its stageId', async () => {
    const prisma = buildPrisma()
    const repo = new DealRepository(prisma as unknown as PrismaService)

    await repo.create('tenant-1', { ownerId: 'u1', title: 'Deal', value: 0, contactId: 'c1', note: null })

    expect(prisma.pipelineStage.findFirst).toHaveBeenCalledWith({
      where: { tenantId: 'tenant-1', legacyKey: 'PROSPECT' },
      select: { id: true },
    })
    expect(prisma.deal.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ stage: 'PROSPECT', stageId: 'stage-prospect' }),
    })
  })

  it('create() resolves stageId for an explicit stage', async () => {
    const prisma = buildPrisma()
    const repo = new DealRepository(prisma as unknown as PrismaService)

    await repo.create('tenant-1', {
      ownerId: 'u1',
      title: 'Deal',
      value: 0,
      contactId: 'c1',
      note: null,
      stage: 'QUALIFIED',
    })

    expect(prisma.deal.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ stage: 'QUALIFIED', stageId: 'stage-qualified' }),
    })
  })

  it('updateStage() writes stage and stageId together', async () => {
    const prisma = buildPrisma()
    const repo = new DealRepository(prisma as unknown as PrismaService)

    await repo.updateStage('deal-1', 'tenant-1', 'CLOSED_WON')

    expect(prisma.deal.update).toHaveBeenCalledWith({
      where: { id: 'deal-1', deletedAt: null },
      data: { stage: 'CLOSED_WON', stageId: 'stage-won' },
    })
  })

  it('createWithStage() (Excel import) writes stage and stageId together', async () => {
    const prisma = buildPrisma()
    const repo = new DealRepository(prisma as unknown as PrismaService)

    await repo.createWithStage('tenant-1', {
      ownerId: 'u1',
      title: 'Imported',
      value: 10,
      stage: 'QUALIFIED',
      contactId: 'c1',
    })

    expect(prisma.deal.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ stage: 'QUALIFIED', stageId: 'stage-qualified' }),
    })
  })

  it('refuses to write a deal when the tenant has no stage for the legacy key', async () => {
    const prisma = buildPrisma()
    const repo = new DealRepository(prisma as unknown as PrismaService)

    await expect(repo.updateStage('deal-1', 'tenant-1', 'PROPOSAL')).rejects.toThrow(/PROPOSAL/)
    await expect(
      repo.createWithStage('tenant-1', { ownerId: 'u1', title: 'X', value: 0, stage: 'CLOSED_LOST', contactId: 'c1' }),
    ).rejects.toThrow(/CLOSED_LOST/)
    expect(prisma.deal.update).not.toHaveBeenCalled()
    expect(prisma.deal.create).not.toHaveBeenCalled()
  })
})
