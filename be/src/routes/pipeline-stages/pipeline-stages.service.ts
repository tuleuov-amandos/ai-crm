import { Injectable } from '@nestjs/common'
import { AppException, PipelineStageErrorCode } from 'src/common/errors'
import { ROLE } from 'src/common/constants/role.constanst'
import { rootLogger } from 'src/common/logger/root-logger'
import { RedisService } from 'src/common/services/redis.service'
import { PrismaClientKnownRequestError } from '../../../generated/prisma-client/internal/prismaNamespace'
import { legacyDealStageFor } from 'src/common/pipeline-stages/default-pipeline-stages'
import { AuditLogsService } from '../audit-logs/audit-logs.service'
import { AuditLogChanges } from '../audit-logs/audit-logs.model'
import { PipelineStagesRepository } from './pipeline-stages.repo'
import {
  CreatePipelineStageBodyType,
  DeletePipelineStageQueryType,
  MAX_OPEN_STAGES,
  MIN_OPEN_STAGES,
  PipelineStageKindConst,
  PipelineStageRes,
  ReorderPipelineStagesBodyType,
  UpdatePipelineStageBodyType,
} from './pipeline-stages.model'

const log = rootLogger.child({ context: 'PipelineStagesService' })

type AuthUser = { userId: string; role: string; tenantId: string }
type StageRow = PipelineStageRes & { tenantId: string }
type Db = Parameters<Parameters<PipelineStagesRepository['runInTransaction']>[0]>[0]

const AUDIT_TARGET_TYPE = 'PIPELINE_STAGE'

const toRes = (stage: StageRow): PipelineStageRes => ({
  id: stage.id,
  name: stage.name,
  color: stage.color,
  order: stage.order,
  probability: stage.probability,
  kind: stage.kind,
  legacyKey: stage.legacyKey,
})

const isOpen = (stage: StageRow) => stage.kind === PipelineStageKindConst.OPEN

// Prisma 7 + adapter-pg surface a CHECK violation (SQLSTATE 23514) as a raw
// DriverAdapterError whose cause has kind "postgres"; it is not converted into
// a PrismaClientKnownRequestError and carries no P-code. Checked against a
// real Postgres (PGlite) with the generated client.
const isCheckViolation = (error: unknown) => {
  const cause = (error as { name?: string; cause?: { kind?: string; code?: string; originalCode?: string } })?.cause
  return (
    (error as { name?: string })?.name === 'DriverAdapterError' &&
    cause?.kind === 'postgres' &&
    (cause.code === '23514' || cause.originalCode === '23514')
  )
}

// DB constraints are the last line of defense; the service checks run first.
const toBusinessError = (error: unknown): unknown => {
  if (error instanceof PrismaClientKnownRequestError && (error.code === 'P2002' || error.code === 'P2003')) {
    return AppException.conflict(PipelineStageErrorCode.CONFLICT, 'Pipeline stage was changed concurrently, retry')
  }
  if (isCheckViolation(error)) {
    return AppException.badRequest(
      PipelineStageErrorCode.INVALID_PROBABILITY,
      'Probability is out of range for this stage',
    )
  }
  return error
}

@Injectable()
export class PipelineStagesService {
  constructor(
    private readonly pipelineStagesRepo: PipelineStagesRepository,
    private readonly redisService: RedisService,
    private readonly auditLogsService: AuditLogsService,
  ) {}

  async list(user: AuthUser) {
    if (user.role === ROLE.ADMIN) {
      const stages = await this.pipelineStagesRepo.findAllWithDealCount(user.tenantId)
      return stages.map((stage) => ({ ...toRes(stage), dealCount: stage._count.deals }))
    }
    const stages = await this.pipelineStagesRepo.findAll(user.tenantId)
    return stages.map(toRes)
  }

  async create(user: AuthUser, body: CreatePipelineStageBodyType) {
    const { tenantId } = user
    const created = await this.write(tenantId, async (tx, stages) => {
      const open = stages.filter(isOpen)
      if (open.length >= MAX_OPEN_STAGES) {
        throw AppException.badRequest(
          PipelineStageErrorCode.LIMIT_MAX,
          `A pipeline can have at most ${MAX_OPEN_STAGES} open stages`,
        )
      }
      this.assertNameAvailable(stages, body.name)

      const stage = await this.pipelineStagesRepo.create(tx, { tenantId, ...body, order: open.length })
      await this.normalizeOrder(tx, tenantId, [...open, stage], stages)
      return { ...stage, order: open.length }
    })

    await this.redisService.invalidateTenantCache(tenantId)
    await this.logSafely(user, 'CREATE', created, {
      name: { old: null, new: created.name },
      color: { old: null, new: created.color },
      probability: { old: null, new: created.probability },
      order: { old: null, new: created.order },
    })
    return toRes(created)
  }

  async update(user: AuthUser, id: string, body: UpdatePipelineStageBodyType) {
    const { tenantId } = user
    const { before, after } = await this.write(tenantId, async (tx, stages) => {
      const stage = stages.find((s) => s.id === id)
      if (!stage) {
        throw AppException.notFound(PipelineStageErrorCode.NOT_FOUND, 'Pipeline stage not found')
      }
      if (!isOpen(stage) && (body.color !== undefined || body.probability !== undefined)) {
        throw AppException.badRequest(
          PipelineStageErrorCode.SYSTEM_FIELD_IMMUTABLE,
          'Only the name of a WON/LOST stage can be changed',
        )
      }
      if (body.name !== undefined) this.assertNameAvailable(stages, body.name, id)

      const updated = await this.pipelineStagesRepo.update(tx, tenantId, id, body)
      return { before: stage, after: updated }
    })

    await this.redisService.invalidateTenantCache(tenantId)
    const changes: AuditLogChanges = {}
    for (const key of ['name', 'color', 'probability'] as const) {
      if (before[key] !== after[key]) changes[key] = { old: before[key], new: after[key] }
    }
    if (Object.keys(changes).length > 0) await this.logSafely(user, 'UPDATE', after, changes)
    return toRes(after)
  }

  async reorder(user: AuthUser, body: ReorderPipelineStagesBodyType) {
    const { tenantId } = user
    const { before, after } = await this.write(tenantId, async (tx, stages) => {
      const open = stages.filter(isOpen)
      const openById = new Map(open.map((s) => [s.id, s]))
      const ids = body.stageIds
      // Exactly the tenant's open stages: no foreign, missing, duplicate or WON/LOST ids.
      if (ids.length !== open.length || new Set(ids).size !== ids.length || !ids.every((sid) => openById.has(sid))) {
        throw AppException.badRequest(
          PipelineStageErrorCode.REORDER_MISMATCH,
          'stageIds must list every open stage of the pipeline exactly once',
        )
      }

      const ordered = ids.map((sid) => openById.get(sid))
      const result = await this.normalizeOrder(tx, tenantId, ordered, stages)
      return { before: open, after: result }
    })

    await this.redisService.invalidateTenantCache(tenantId)
    // One entry for the whole pipeline; targetId is the tenant.
    await this.logSafely(
      user,
      'UPDATE',
      { id: tenantId, name: null },
      {
        order: { old: before.map((s) => s.name), new: after.filter(isOpen).map((s) => s.name) },
        stageIds: { old: before.map((s) => s.id), new: after.filter(isOpen).map((s) => s.id) },
      },
    )
    return after.map(toRes)
  }

  async remove(user: AuthUser, id: string, query: DeletePipelineStageQueryType) {
    const { tenantId } = user
    await this.write(tenantId, async (tx, stages) => {
      const stage = stages.find((s) => s.id === id)
      if (!stage) {
        throw AppException.notFound(PipelineStageErrorCode.NOT_FOUND, 'Pipeline stage not found')
      }
      if (!isOpen(stage)) {
        throw AppException.badRequest(
          PipelineStageErrorCode.SYSTEM_DELETE_NOT_ALLOWED,
          'WON and LOST stages cannot be deleted',
        )
      }
      const open = stages.filter(isOpen)
      if (open.length <= MIN_OPEN_STAGES) {
        throw AppException.badRequest(
          PipelineStageErrorCode.LIMIT_MIN,
          `A pipeline needs at least ${MIN_OPEN_STAGES} open stage`,
        )
      }

      let target: StageRow | undefined
      if (query.targetStageId !== undefined) {
        // Any stage of this tenant, WON/LOST included, except the deleted one.
        target = stages.find((s) => s.id === query.targetStageId && s.id !== id)
        if (!target) {
          throw AppException.badRequest(PipelineStageErrorCode.TARGET_INVALID, 'Target stage not found')
        }
      }

      const dealCount = await this.pipelineStagesRepo.countDeals(tx, tenantId, id)
      let movedDeals = 0
      if (dealCount > 0) {
        if (!target) {
          throw AppException.badRequest(
            PipelineStageErrorCode.TARGET_REQUIRED,
            'The stage has deals: targetStageId is required',
          )
        }
        const moved = await this.pipelineStagesRepo.moveDeals(tx, tenantId, id, target.id, legacyDealStageFor(target))
        movedDeals = moved.count
      }

      await this.pipelineStagesRepo.delete(tx, tenantId, id)
      await this.normalizeOrder(
        tx,
        tenantId,
        open.filter((s) => s.id !== id),
        stages,
      )

      // Same transaction: a failed audit write rolls the delete back.
      const changes: AuditLogChanges = {
        name: { old: stage.name, new: null },
        color: { old: stage.color, new: null },
        probability: { old: stage.probability, new: null },
        order: { old: stage.order, new: null },
      }
      if (target) {
        changes.dealsMovedTo = { old: null, new: { stageId: target.id, name: target.name, count: movedDeals } }
      }
      await this.auditLogsService.logAction(
        {
          tenantId,
          userId: user.userId,
          action: 'DELETE',
          targetType: AUDIT_TARGET_TYPE,
          targetId: stage.id,
          targetName: stage.name,
          changes,
        },
        tx,
      )
    })

    await this.redisService.invalidateTenantCache(tenantId)
    return { message: 'Pipeline stage deleted successfully' }
  }

  // Runs `fn` in a transaction holding the tenant pipeline lock, with the
  // tenant's stages read after the lock was taken, and maps DB constraint
  // violations to business errors.
  private async write<T>(tenantId: string, fn: (tx: Db, stages: StageRow[]) => Promise<T>): Promise<T> {
    try {
      return await this.pipelineStagesRepo.runInTransaction(async (tx) => {
        await this.pipelineStagesRepo.lockTenant(tx, tenantId)
        const stages = await this.pipelineStagesRepo.findAll(tenantId, tx)
        return fn(tx, stages)
      })
    } catch (error) {
      throw toBusinessError(error)
    }
  }

  // Rewrites `order` as 0..n-1 for the open stages in the given sequence, then
  // WON, then LOST, so the closed stages always stay last. Only changed rows
  // are written. Returns the full pipeline in its new order.
  private async normalizeOrder(tx: Db, tenantId: string, openInOrder: StageRow[], allStages: StageRow[]) {
    const sequence = [
      ...openInOrder,
      ...allStages.filter((s) => s.kind === PipelineStageKindConst.WON),
      ...allStages.filter((s) => s.kind === PipelineStageKindConst.LOST),
    ]
    const result: StageRow[] = []
    for (const [order, stage] of sequence.entries()) {
      if (stage.order !== order) {
        await this.pipelineStagesRepo.update(tx, tenantId, stage.id, { order })
      }
      result.push({ ...stage, order })
    }
    return result
  }

  private assertNameAvailable(stages: StageRow[], name: string, exceptId?: string) {
    const normalized = name.trim().toLowerCase()
    if (stages.some((s) => s.id !== exceptId && s.name.trim().toLowerCase() === normalized)) {
      throw AppException.conflict(PipelineStageErrorCode.NAME_TAKEN, 'A stage with this name already exists')
    }
  }

  // The stage write is already committed; an audit failure must not turn it
  // into an error response (same rule as UsersService.removeMember).
  private async logSafely(
    user: AuthUser,
    action: 'CREATE' | 'UPDATE',
    target: { id: string; name: string | null },
    changes: AuditLogChanges,
  ) {
    try {
      await this.auditLogsService.logAction({
        tenantId: user.tenantId,
        userId: user.userId,
        action,
        targetType: AUDIT_TARGET_TYPE,
        targetId: target.id,
        targetName: target.name,
        changes,
      })
    } catch (error) {
      log.error({ event: 'pipeline_stage.audit_log_failed', tenantId: user.tenantId, action, err: error })
    }
  }
}
