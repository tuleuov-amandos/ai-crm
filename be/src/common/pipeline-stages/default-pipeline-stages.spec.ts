import {
  DEFAULT_PIPELINE_STAGES,
  createDefaultStages,
  findFirstOpenStage,
  legacyDealStageFor,
  resolveStageIdByLegacyKey,
} from './default-pipeline-stages'

type StageClient = Parameters<typeof resolveStageIdByLegacyKey>[0]

describe('default pipeline stages', () => {
  it('defines the five legacy stages with the same order, probability, kind and color as the backfill migration', () => {
    expect(DEFAULT_PIPELINE_STAGES).toEqual([
      { legacyKey: 'PROSPECT', name: 'Лид', order: 0, probability: 10, color: 'blue', kind: 'OPEN' },
      { legacyKey: 'QUALIFIED', name: 'Контакт установлен', order: 1, probability: 30, color: 'purple', kind: 'OPEN' },
      { legacyKey: 'PROPOSAL', name: 'Предложение', order: 2, probability: 60, color: 'orange', kind: 'OPEN' },
      { legacyKey: 'CLOSED_WON', name: 'Выиграно', order: 3, probability: 100, color: 'green', kind: 'WON' },
      { legacyKey: 'CLOSED_LOST', name: 'Проиграно', order: 4, probability: 0, color: 'red', kind: 'LOST' },
    ])
  })

  describe('createDefaultStages', () => {
    it('creates all default stages for the given tenant with an explicit tenantId', async () => {
      const tx = { pipelineStage: { createMany: jest.fn().mockResolvedValue({ count: 5 }) } }

      await createDefaultStages(tx as unknown as StageClient, 'tenant-1')

      expect(tx.pipelineStage.createMany).toHaveBeenCalledTimes(1)
      const { data } = tx.pipelineStage.createMany.mock.calls[0][0]
      expect(data).toHaveLength(5)
      expect(data.every((s: { tenantId: string }) => s.tenantId === 'tenant-1')).toBe(true)
      expect(data.map((s: { legacyKey: string }) => s.legacyKey)).toEqual([
        'PROSPECT',
        'QUALIFIED',
        'PROPOSAL',
        'CLOSED_WON',
        'CLOSED_LOST',
      ])
    })
  })

  describe('resolveStageIdByLegacyKey', () => {
    it('looks up the stage by tenantId and legacyKey and returns its id', async () => {
      const client = { pipelineStage: { findFirst: jest.fn().mockResolvedValue({ id: 'stage-won' }) } }

      await expect(resolveStageIdByLegacyKey(client as unknown as StageClient, 'tenant-1', 'CLOSED_WON')).resolves.toBe(
        'stage-won',
      )
      expect(client.pipelineStage.findFirst).toHaveBeenCalledWith({
        where: { tenantId: 'tenant-1', legacyKey: 'CLOSED_WON' },
        select: { id: true },
      })
    })

    it('throws a descriptive error instead of returning an empty stageId when the stage is missing', async () => {
      const client = { pipelineStage: { findFirst: jest.fn().mockResolvedValue(null) } }

      await expect(resolveStageIdByLegacyKey(client as unknown as StageClient, 'tenant-1', 'PROPOSAL')).rejects.toThrow(
        /PipelineStage.*PROPOSAL.*tenant-1/,
      )
    })
  })

  describe('legacyDealStageFor', () => {
    it('maps WON and LOST stages to the closed keys whatever their legacyKey', () => {
      expect(legacyDealStageFor({ kind: 'WON', legacyKey: null })).toBe('CLOSED_WON')
      expect(legacyDealStageFor({ kind: 'LOST', legacyKey: null })).toBe('CLOSED_LOST')
      expect(legacyDealStageFor({ kind: 'WON', legacyKey: 'CLOSED_WON' })).toBe('CLOSED_WON')
    })

    it('maps a default open stage to its own legacyKey', () => {
      expect(legacyDealStageFor({ kind: 'OPEN', legacyKey: 'PROSPECT' })).toBe('PROSPECT')
      expect(legacyDealStageFor({ kind: 'OPEN', legacyKey: 'QUALIFIED' })).toBe('QUALIFIED')
      expect(legacyDealStageFor({ kind: 'OPEN', legacyKey: 'PROPOSAL' })).toBe('PROPOSAL')
    })

    it('maps a custom stage (no or unknown legacyKey) to PROSPECT', () => {
      expect(legacyDealStageFor({ kind: 'OPEN', legacyKey: null })).toBe('PROSPECT')
      expect(legacyDealStageFor({ kind: 'OPEN' })).toBe('PROSPECT')
      expect(legacyDealStageFor({ kind: 'OPEN', legacyKey: 'SOMETHING' })).toBe('PROSPECT')
    })
  })

  describe('findFirstOpenStage', () => {
    it('asks for the OPEN stage of the tenant with the smallest order, then the oldest', async () => {
      const stage = { id: 'stage-1', kind: 'OPEN', legacyKey: null }
      const client = { pipelineStage: { findFirst: jest.fn().mockResolvedValue(stage) } }

      await expect(findFirstOpenStage(client as unknown as StageClient, 'tenant-1')).resolves.toBe(stage)
      expect(client.pipelineStage.findFirst).toHaveBeenCalledWith({
        where: { tenantId: 'tenant-1', kind: 'OPEN' },
        orderBy: [{ order: 'asc' }, { createdAt: 'asc' }],
        select: { id: true, kind: true, legacyKey: true },
      })
    })

    it('throws a descriptive error when the tenant has no open stage', async () => {
      const client = { pipelineStage: { findFirst: jest.fn().mockResolvedValue(null) } }

      await expect(findFirstOpenStage(client as unknown as StageClient, 'tenant-1')).rejects.toThrow(
        /open PipelineStage.*tenant-1/,
      )
    })
  })
})
