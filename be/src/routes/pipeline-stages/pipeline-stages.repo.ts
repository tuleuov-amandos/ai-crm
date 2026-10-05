import { Injectable } from '@nestjs/common'
import { PrismaService } from 'src/common/services/prisma.service'
import { Prisma } from '../../../generated/prisma-client/client'
import type { DealStage } from '../../../generated/prisma-client/enums'

type Db = Prisma.TransactionClient

// tenantId is passed explicitly in every query on top of the Prisma tenant
// extension: PipelineStage is tenant-scoped there too, but the explicit filter
// keeps ids from another tenant out even when CLS has no tenantId.
@Injectable()
export class PipelineStagesRepository {
  constructor(private readonly prismaService: PrismaService) {}

  runInTransaction<T>(fn: (tx: Db) => Promise<T>): Promise<T> {
    return this.prismaService.$transaction(fn)
  }

  // Serializes every write to one tenant's pipeline (limits, order shifts,
  // name uniqueness) until the transaction ends. NO KEY UPDATE, not UPDATE:
  // it still conflicts with itself, but not with the KEY SHARE lock that FK
  // checks take on Tenant, so inserts of deals/contacts/etc. are not blocked.
  async lockTenant(tx: Db, tenantId: string) {
    await tx.$queryRaw`SELECT "id" FROM "Tenant" WHERE "id" = ${tenantId} FOR NO KEY UPDATE`
  }

  findAll(tenantId: string, db: Db = this.prismaService) {
    return db.pipelineStage.findMany({
      where: { tenantId },
      orderBy: [{ order: 'asc' }, { createdAt: 'asc' }],
    })
  }

  // dealCount for the settings screen: deals without deletedAt.
  findAllWithDealCount(tenantId: string) {
    return this.prismaService.pipelineStage.findMany({
      where: { tenantId },
      orderBy: [{ order: 'asc' }, { createdAt: 'asc' }],
      include: { _count: { select: { deals: { where: { deletedAt: null } } } } },
    })
  }

  create(tx: Db, data: { tenantId: string; name: string; color: string; probability: number; order: number }) {
    return tx.pipelineStage.create({
      data: { ...data, kind: 'OPEN', legacyKey: null },
    })
  }

  update(
    tx: Db,
    tenantId: string,
    id: string,
    data: { name?: string; color?: string; probability?: number; order?: number },
  ) {
    return tx.pipelineStage.update({ where: { id, tenantId }, data })
  }

  delete(tx: Db, tenantId: string, id: string) {
    return tx.pipelineStage.delete({ where: { id, tenantId } })
  }

  // All deals of the stage, soft-deleted ones included: the FK holds them too.
  countDeals(tx: Db, tenantId: string, stageId: string) {
    return tx.deal.count({ where: { tenantId, stageId } })
  }

  // Dual write (R1): stageId and the legacy Deal.stage move together.
  moveDeals(tx: Db, tenantId: string, fromStageId: string, toStageId: string, legacyStage: DealStage) {
    return tx.deal.updateMany({
      where: { tenantId, stageId: fromStageId },
      data: { stageId: toStageId, stage: legacyStage },
    })
  }
}
