import { DEFAULT_PIPELINE_STAGES, createDefaultStages, resolveStageIdByLegacyKey } from './default-pipeline-stages'

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
})
