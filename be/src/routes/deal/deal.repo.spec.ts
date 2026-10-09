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

// Archive only hides deals from the board: the filter is opt-in, so the
// pipeline (and every other caller) still reads archived deals.
describe('DealRepository archive', () => {
  const buildPrisma = () => ({
    deal: {
      findMany: jest.fn().mockResolvedValue([]),
      updateMany: jest.fn().mockResolvedValue({ count: 2 }),
    },
  })

  it('findAllByTenant() skips archived deals only when asked to', async () => {
    const prisma = buildPrisma()
    const repo = new DealRepository(prisma as unknown as PrismaService)

    await repo.findAllByTenant({ excludeArchived: true })
    await repo.findAllByTenant({})
    await repo.findAllByTenant()

    expect(prisma.deal.findMany.mock.calls[0][0].where).toEqual({ deletedAt: null, archivedAt: null })
    expect(prisma.deal.findMany.mock.calls[1][0].where).toEqual({ deletedAt: null })
    expect(prisma.deal.findMany.mock.calls[2][0].where).toEqual({ deletedAt: null })
  })

  it('findAllByTenant() selects phone, address and city of the contact for the board cards', async () => {
    const prisma = buildPrisma()
    const repo = new DealRepository(prisma as unknown as PrismaService)

    await repo.findAllByTenant()

    expect(prisma.deal.findMany.mock.calls[0][0].include.contact).toEqual({
      select: { id: true, name: true, company: true, phone: true, address: true, city: true },
    })
  })

  it('archiveMany() updates only live, not yet archived deals of the tenant', async () => {
    const prisma = buildPrisma()
    const repo = new DealRepository(prisma as unknown as PrismaService)

    const result = await repo.archiveMany('tenant-1', ['d1', 'd2'])

    expect(result).toEqual({ count: 2 })
    expect(prisma.deal.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ['d1', 'd2'] }, tenantId: 'tenant-1', deletedAt: null, archivedAt: null },
      data: { archivedAt: expect.any(Date) },
    })
  })

  it('unarchiveMany() updates only archived live deals of the tenant', async () => {
    const prisma = buildPrisma()
    const repo = new DealRepository(prisma as unknown as PrismaService)

    await repo.unarchiveMany('tenant-1', ['d1'])

    expect(prisma.deal.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ['d1'] }, tenantId: 'tenant-1', deletedAt: null, archivedAt: { not: null } },
      data: { archivedAt: null },
    })
  })

  it('archiveMany() / unarchiveMany() add the owner condition when given one', async () => {
    const prisma = buildPrisma()
    const repo = new DealRepository(prisma as unknown as PrismaService)

    await repo.archiveMany('tenant-1', ['d1'], { ownerId: 'rep-1' })
    await repo.unarchiveMany('tenant-1', ['d1'], { ownerId: 'rep-1' })

    expect(prisma.deal.updateMany.mock.calls[0][0].where).toMatchObject({ ownerId: 'rep-1' })
    expect(prisma.deal.updateMany.mock.calls[1][0].where).toMatchObject({ ownerId: 'rep-1' })
  })
})
