import type { Prisma } from '../../../generated/prisma-client/client'
import type { DealStage, PipelineStageKind } from '../../../generated/prisma-client/enums'

type PipelineStageClient = Pick<Prisma.TransactionClient, 'pipelineStage'>

export type DefaultPipelineStage = {
  legacyKey: DealStage
  name: string
  order: number
  probability: number
  color: string
  kind: PipelineStageKind
}

// Default stages every tenant gets, one per legacy DealStage value. Must stay in
// sync with the backfill in prisma/migrations/20261006000000_add_pipeline_stages.
// Names are the current Russian labels from fe/messages/ru.json `dealStages`.
export const DEFAULT_PIPELINE_STAGES: readonly DefaultPipelineStage[] = [
  { legacyKey: 'PROSPECT', name: 'Лид', order: 0, probability: 10, color: 'blue', kind: 'OPEN' },
  { legacyKey: 'QUALIFIED', name: 'Контакт установлен', order: 1, probability: 30, color: 'purple', kind: 'OPEN' },
  { legacyKey: 'PROPOSAL', name: 'Предложение', order: 2, probability: 60, color: 'orange', kind: 'OPEN' },
  { legacyKey: 'CLOSED_WON', name: 'Выиграно', order: 3, probability: 100, color: 'green', kind: 'WON' },
  { legacyKey: 'CLOSED_LOST', name: 'Проиграно', order: 4, probability: 0, color: 'red', kind: 'LOST' },
]

// tenantId is always passed explicitly: tenant provisioning runs outside an
// authenticated request, so the Prisma tenant extension has no tenantId in CLS.
export function createDefaultStages(tx: PipelineStageClient, tenantId: string) {
  return tx.pipelineStage.createMany({
    data: DEFAULT_PIPELINE_STAGES.map((stage) => ({ ...stage, tenantId })),
  })
}

// Dual write (R1): resolves the PipelineStage that mirrors a legacy DealStage
// value. A missing stage is a data-integrity bug, so fail instead of silently
// writing a deal with an empty stageId.
export async function resolveStageIdByLegacyKey(
  client: PipelineStageClient,
  tenantId: string,
  legacyKey: DealStage,
): Promise<string> {
  const stage = await client.pipelineStage.findFirst({
    where: { tenantId, legacyKey },
    select: { id: true },
  })
  if (!stage) {
    throw new Error(`PipelineStage with legacyKey ${legacyKey} not found for tenant ${tenantId}`)
  }
  return stage.id
}
