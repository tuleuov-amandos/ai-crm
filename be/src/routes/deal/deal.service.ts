import { ForbiddenException, Injectable } from '@nestjs/common'
import { AppException, ContactErrorCode, DealErrorCode, TaskErrorCode } from 'src/common/errors'
import { ROLE } from 'src/common/constants/role.constanst'
import {
  CreateDealBodyType,
  DealStageConst,
  DealStageType,
  DealCardRes,
  UpdateDealBodyType,
  DealCardSchema,
  AnalyzeDealBodyType,
  AnalyzeDealResType,
  GetPipelineQueryType,
  GetBoardQueryType,
  BoardDealCardRes,
  BoardDealCardSchema,
  UpdateDealStageBodyType,
} from './deal.model'
import { DealRepository, DealStageTarget } from './deal.repo'
import { TaskRepository } from './task.repo'
import { CreateTaskBodyType, UpdateTaskBodyType } from './task.model'
import { AiService } from '../ai/ai.service'
import { ContactsRepository } from '../contacts/contacts.repo'
import { RedisService } from 'src/common/services/redis.service'
import { AuditLogsService } from '../audit-logs/audit-logs.service'
import { CaslAbilityFactory } from 'src/common/casl/casl-ability.factory'
import { subject } from '@casl/ability'
import { Prisma } from '../../../generated/prisma-client/client'
import { AuditLogChanges } from '../audit-logs/audit-logs.model'
import { PipelineStagesRepository } from '../pipeline-stages/pipeline-stages.repo'
import { rootLogger } from 'src/common/logger/root-logger'
import { legacyDealStageFor } from 'src/common/pipeline-stages/default-pipeline-stages'
import { PrismaClientKnownRequestError } from '../../../generated/prisma-client/internal/prismaNamespace'

const log = rootLogger.child({ context: 'DealService' })

export function getChangesDiff(
  oldObj: Record<string, Prisma.InputJsonValue>,
  newObj: Record<string, Prisma.InputJsonValue>,
): AuditLogChanges {
  const diff: AuditLogChanges = {}
  const ignoredFields = ['updatedAt', 'createdAt', 'deletedAt', 'tenantId', 'id']
  for (const key of Object.keys(newObj)) {
    if (ignoredFields.includes(key)) continue
    const oldVal = oldObj[key]
    const newVal = newObj[key]
    // Compare by JSON representation so objects/arrays and Decimal/Date (via toJSON) diff correctly
    const strOld = oldVal !== null && oldVal !== undefined ? JSON.stringify(oldVal) : ''
    const strNew = newVal !== null && newVal !== undefined ? JSON.stringify(newVal) : ''
    if (strOld !== strNew) {
      if (oldVal === null && newVal === undefined) continue
      if (oldVal === undefined && newVal === null) continue
      diff[key] = {
        old: oldVal !== undefined ? oldVal : null,
        new: newVal !== undefined ? newVal : null,
      }
    }
  }
  return diff
}

const invalidStage = (message: string) => AppException.unprocessable(DealErrorCode.INVALID_STAGE, message)

// The stage was found, then deleted concurrently before the deal write: the
// write fails on Deal_stageId_fkey. Other FK violations are not stage errors.
const isStageForeignKeyError = (error: unknown) =>
  error instanceof PrismaClientKnownRequestError && error.code === 'P2003' && error.message.includes('stageId')

// PATCH /deals/:id edits only these columns. The body is not validated by a
// DTO, so stage/stageId (dual write), isPaid (own endpoint) and the rest of the
// row must not reach prisma.deal.update from it.
const pickUpdatableDealFields = (body: UpdateDealBodyType): UpdateDealBodyType => {
  const data: UpdateDealBodyType = {}
  if (body.title !== undefined) data.title = body.title
  if (body.ownerId !== undefined) data.ownerId = body.ownerId
  if (body.value !== undefined) data.value = body.value
  if (body.closeDate !== undefined) data.closeDate = body.closeDate
  if (body.note !== undefined) data.note = body.note
  return data
}

@Injectable()
export class DealService {
  constructor(
    private readonly dealRepo: DealRepository,
    private readonly aiService: AiService,
    private readonly contactsRepo: ContactsRepository,
    private readonly taskRepo: TaskRepository,
    private readonly redisService: RedisService,
    private readonly auditLogsService: AuditLogsService,
    private readonly caslAbilityFactory: CaslAbilityFactory,
    private readonly pipelineStagesRepo: PipelineStagesRepository,
  ) {}

  async create(tenantId: string, data: CreateDealBodyType, user: { userId: string; role: string; tenantId: string }) {
    const ability = await this.caslAbilityFactory.createForUser(user)

    // Check Deal creation permission
    if (ability.cannot('create', 'Deal')) {
      throw AppException.forbidden(DealErrorCode.FORBIDDEN_CREATE, 'You do not have permission to create a deal')
    }

    // If only allowed to create deals owned by oneself
    if (ability.cannot('manage', 'all')) {
      if (data.ownerId !== user.userId) {
        throw AppException.forbidden(DealErrorCode.FORBIDDEN_OWNER_SELF_ONLY, 'You can only create deals that you own')
      }
      const contact = await this.contactsRepo.findOne(data.contactId)
      if (!contact || ability.cannot('read', subject('Contact', contact))) {
        throw AppException.notFound(ContactErrorCode.NOT_FOUND, 'Contact not found')
      }
    }

    const target = await this.resolveStageTarget(tenantId, data, { required: false })
    const deal = await this.writeDealStage(() => this.dealRepo.create(data, target))
    await this.redisService.invalidateTenantCache(tenantId)

    const changes: AuditLogChanges = {}
    for (const [key, val] of Object.entries(deal)) {
      if (['createdAt', 'updatedAt', 'deletedAt', 'id', 'tenantId', 'stageId'].includes(key)) continue
      changes[key] = { old: null, new: val }
    }
    await this.auditLogsService.logAction({
      tenantId,
      userId: user.userId,
      action: 'CREATE',
      targetType: 'DEAL',
      targetId: deal.id,
      targetName: deal.title,
      changes,
    })

    return deal
  }

  async getPipleline(
    tenantId: string,
    user: { userId: string; role: string; tenantId: string },
    query: GetPipelineQueryType,
  ) {
    const deals = await this.findPipelineDeals(user, query)

    const stageMap: Record<DealStageType, DealCardRes[]> = {
      [DealStageConst.PROSPECT]: [],
      [DealStageConst.QUALIFIED]: [],
      [DealStageConst.PROPOSAL]: [],
      [DealStageConst.CLOSED_WON]: [],
      [DealStageConst.CLOSED_LOST]: [],
    }
    deals.forEach((deal) => {
      const parsed = DealCardSchema.parse(deal)
      stageMap[deal.stage].push(parsed)
    })
    return stageMap
  }

  // Same permissions and filters as getPipleline, grouped by stageId into the
  // tenant's pipeline stages. A deal without stageId falls back to the stage
  // whose legacyKey matches Deal.stage (R1 dual write). Unlike the pipeline,
  // archived deals are left out unless includeArchived=true.
  async getBoard(tenantId: string, user: { userId: string; role: string; tenantId: string }, query: GetBoardQueryType) {
    const deals = await this.findPipelineDeals(user, query, { excludeArchived: query.includeArchived !== 'true' })
    const stages = await this.pipelineStagesRepo.findAll(tenantId)

    const columns = stages.map((stage) => ({
      stage: {
        id: stage.id,
        name: stage.name,
        color: stage.color,
        order: stage.order,
        kind: stage.kind,
        probability: stage.probability,
      },
      deals: [] as BoardDealCardRes[],
    }))
    const columnByStageId = new Map(columns.map((column) => [column.stage.id, column]))
    const columnByLegacyKey = new Map(
      stages.filter((stage) => stage.legacyKey).map((stage) => [stage.legacyKey, columnByStageId.get(stage.id)]),
    )

    deals.forEach((deal) => {
      const column = (deal.stageId && columnByStageId.get(deal.stageId)) || columnByLegacyKey.get(deal.stage)
      if (!column) {
        log.warn({ event: 'deal.board_stage_missing', tenantId, dealId: deal.id, stageId: deal.stageId })
        return
      }
      column.deals.push(BoardDealCardSchema.parse(deal))
    })
    return columns
  }

  // CASL checks and filters shared by GET /deals/pipeline and GET /deals/board.
  private async findPipelineDeals(
    user: { userId: string; role: string; tenantId: string },
    query: GetPipelineQueryType,
    { excludeArchived = false }: { excludeArchived?: boolean } = {},
  ) {
    const ability = await this.caslAbilityFactory.createForUser(user)
    const filters: {
      ownerId?: string
      dateFrom?: string
      dateTo?: string
      search?: string
      isPaid?: boolean
      excludeArchived?: boolean
    } = {}
    if (ability.cannot('read', 'Deal')) {
      throw AppException.forbidden(DealErrorCode.FORBIDDEN_LIST, 'You do not have permission to view deals')
    }

    if (ability.cannot('read', subject('Deal', { ownerId: 'other' } as any))) {
      filters.ownerId = user.userId // hard-locked to own userId, query.ownerId is ignored
    } else if (query.ownerId) {
      filters.ownerId = query.ownerId // filter by chosen owner, only when the user has the rights
    }

    // closeDate range — no security check, dates don't affect data visibility
    if (query.dateFrom) filters.dateFrom = query.dateFrom
    if (query.dateTo) filters.dateTo = query.dateTo
    if (query.search) filters.search = query.search
    if (query.isPaid !== undefined) filters.isPaid = query.isPaid === 'true'
    if (excludeArchived) filters.excludeArchived = true

    return this.dealRepo.findAllByTenant(filters)
  }

  async getDealById(dealId: string, tenantId: string, user: { userId: string; role: string; tenantId: string }) {
    const deal = await this.dealRepo.findOne(dealId)
    if (!deal) {
      throw AppException.notFound(DealErrorCode.NOT_FOUND, 'Deal not found')
    }

    const ability = await this.caslAbilityFactory.createForUser(user)
    if (ability.cannot('read', subject('Deal', deal))) {
      throw AppException.notFound(DealErrorCode.NOT_FOUND, 'Deal not found') // 404 to prevent scanning
    }
    return deal
  }

  async update(
    dealId: string,
    tenantId: string,
    body: UpdateDealBodyType,
    user: { userId: string; role: string; tenantId: string },
  ) {
    const oldDeal = await this.dealRepo.findOne(dealId)
    if (!oldDeal) {
      throw AppException.notFound(DealErrorCode.NOT_FOUND, 'Deal not found')
    }

    const ability = await this.caslAbilityFactory.createForUser(user)
    if (ability.cannot('update', subject('Deal', oldDeal))) {
      throw AppException.notFound(DealErrorCode.NOT_FOUND, 'Deal not found')
    }

    const data = pickUpdatableDealFields(body)
    const updated = await this.dealRepo.update(dealId, data)
    await this.redisService.invalidateTenantCache(tenantId)

    const changes = getChangesDiff(oldDeal, data)
    if (Object.keys(changes).length > 0) {
      await this.auditLogsService.logAction({
        tenantId,
        userId: user.userId,
        action: 'UPDATE',
        targetType: 'DEAL',
        targetId: dealId,
        targetName: updated.title,
        changes,
      })
    }
    return updated
  }

  async updateDealStage(
    dealId: string,
    tenantId: string,
    body: UpdateDealStageBodyType,
    user: { userId: string; role: string; tenantId: string },
  ) {
    const oldDeal = await this.dealRepo.findOne(dealId)
    if (!oldDeal) {
      throw AppException.notFound(DealErrorCode.NOT_FOUND, 'Deal not found')
    }

    const ability = await this.caslAbilityFactory.createForUser(user)
    if (ability.cannot('update', subject('Deal', oldDeal))) {
      throw AppException.notFound(DealErrorCode.NOT_FOUND, 'Deal not found')
    }

    const target = await this.resolveStageTarget(tenantId, body, { required: true })
    const updated = await this.writeDealStage(() => this.dealRepo.updateStage(dealId, target))
    await this.redisService.invalidateTenantCache(tenantId)

    // Audit format unchanged: the legacy value, so a custom stage logs PROSPECT.
    const changes = {
      stage: { old: oldDeal.stage, new: target.stage },
    }
    await this.auditLogsService.logAction({
      tenantId,
      userId: user.userId,
      action: 'UPDATE',
      targetType: 'DEAL',
      targetId: dealId,
      targetName: updated.title,
      changes,
    })

    return updated
  }

  // Resolves the body's stage (legacy DealStage value) or stageId (PipelineStage
  // of this tenant) into what a deal write stores. Without either the deal goes
  // into the first open stage, or 422 when a stage is required.
  private async resolveStageTarget(
    tenantId: string,
    body: { stage?: string | null; stageId?: string | null },
    { required }: { required: boolean },
  ): Promise<DealStageTarget> {
    const hasStage = body.stage !== undefined && body.stage !== null
    const hasStageId = body.stageId !== undefined && body.stageId !== null

    if (hasStage && hasStageId) throw invalidStage('Pass either stage or stageId, not both')

    if (hasStageId) {
      const stage = typeof body.stageId === 'string' ? await this.dealRepo.findStageById(tenantId, body.stageId) : null
      if (!stage) throw invalidStage('Invalid stage')
      return { stageId: stage.id, stage: legacyDealStageFor(stage) }
    }

    if (hasStage) {
      if (!Object.values(DealStageConst).includes(body.stage as DealStageType)) throw invalidStage('Invalid stage')
      const stage = body.stage as DealStageType
      // The tenant may have deleted the default stage with this key.
      const found = await this.dealRepo.findStageByLegacyKey(tenantId, stage)
      if (!found) throw invalidStage('Invalid stage')
      return { stageId: found.id, stage }
    }

    if (required) throw invalidStage('Invalid stage')
    const first = await this.dealRepo.findFirstOpenStage(tenantId)
    return { stageId: first.id, stage: legacyDealStageFor(first) }
  }

  private async writeDealStage<T>(write: () => Promise<T>): Promise<T> {
    try {
      return await write()
    } catch (error) {
      if (isStageForeignKeyError(error)) throw invalidStage('Pipeline stage no longer exists')
      throw error
    }
  }

  async updateDealPaymentStatus(
    dealId: string,
    tenantId: string,
    isPaid: boolean,
    user: { userId: string; role: string; tenantId: string },
  ) {
    const oldDeal = await this.dealRepo.findOne(dealId)
    if (!oldDeal) {
      throw AppException.notFound(DealErrorCode.NOT_FOUND, 'Deal not found')
    }

    const ability = await this.caslAbilityFactory.createForUser(user)
    if (ability.cannot('update', subject('Deal', oldDeal))) {
      throw AppException.notFound(DealErrorCode.NOT_FOUND, 'Deal not found')
    }

    const updated = await this.dealRepo.updatePaymentStatus(dealId, isPaid)
    await this.redisService.invalidateTenantCache(tenantId)

    const changes = {
      isPaid: { old: oldDeal.isPaid, new: isPaid },
    }
    await this.auditLogsService.logAction({
      tenantId,
      userId: user.userId,
      action: 'UPDATE',
      targetType: 'DEAL',
      targetId: dealId,
      targetName: updated.title,
      changes,
    })

    return updated
  }

  async delete(dealId: string, tenantId: string, user: { userId: string; role: string; tenantId: string }) {
    const deal = await this.dealRepo.findOne(dealId)
    if (!deal) {
      throw AppException.notFound(DealErrorCode.NOT_FOUND, 'Deal not found')
    }

    const ability = await this.caslAbilityFactory.createForUser(user)
    if (ability.cannot('delete', subject('Deal', deal))) {
      throw AppException.notFound(DealErrorCode.NOT_FOUND, 'Deal not found')
    }

    await this.dealRepo.softDelete(dealId)
    await this.redisService.invalidateTenantCache(tenantId)

    const changes: AuditLogChanges = {}
    for (const [key, val] of Object.entries(deal)) {
      if (['createdAt', 'updatedAt', 'deletedAt', 'id', 'tenantId', 'stageId'].includes(key)) continue
      changes[key] = { old: val, new: null }
    }
    await this.auditLogsService.logAction({
      tenantId,
      userId: user.userId,
      action: 'DELETE',
      targetType: 'DEAL',
      targetId: dealId,
      targetName: deal.title,
      changes,
    })

    return { message: 'Deal deleted successfully' }
  }

  // POST /deals/archive and /deals/unarchive. Same right as PATCH /deals/:id
  // (update:Deal); a role limited to its own deals (SALES_REP: ownerId
  // condition) changes only those. Ids that do not match are skipped silently.
  async setArchived(
    tenantId: string,
    dealIds: string[],
    archived: boolean,
    user: { userId: string; role: string; tenantId: string },
  ) {
    const ability = await this.caslAbilityFactory.createForUser(user)
    if (ability.cannot('update', 'Deal')) {
      throw new ForbiddenException('You do not have permission to update deals')
    }
    const filters: { ownerId?: string } = {}
    if (ability.cannot('update', subject('Deal', { ownerId: 'other' } as any))) {
      filters.ownerId = user.userId
    }

    const ids = [...new Set(dealIds)]
    const { count } = archived
      ? await this.dealRepo.archiveMany(tenantId, ids, filters)
      : await this.dealRepo.unarchiveMany(tenantId, ids, filters)
    if (count === 0) return { updated: 0 }

    await this.redisService.invalidateTenantCache(tenantId)
    await this.auditLogsService.logAction({
      tenantId,
      userId: user.userId,
      action: 'UPDATE',
      targetType: 'DEAL',
      targetId: 'BULK',
      targetName: null,
      changes: {
        archived: { old: !archived, new: archived },
        dealCount: { old: null, new: count },
      },
    })

    return { updated: count }
  }

  async analyze(
    dealId: string,
    tenantId: string,
    userId: string,
    body: AnalyzeDealBodyType,
    user: { userId: string; role: string; tenantId: string },
  ): Promise<AnalyzeDealResType> {
    const deal = await this.dealRepo.findOne(dealId)
    if (!deal) {
      throw AppException.notFound(DealErrorCode.NOT_FOUND, 'Deal not found')
    }

    const ability = await this.caslAbilityFactory.createForUser(user)
    if (ability.cannot('read', subject('Deal', deal as any))) {
      throw AppException.notFound(DealErrorCode.NOT_FOUND, 'Deal not found')
    }

    if (!body || typeof body.meetingNote !== 'string') {
      throw AppException.unprocessable(DealErrorCode.MEETING_NOTE_REQUIRED, 'Missing meetingNote field')
    }

    const jobId = await this.aiService.enqueueAnalysis({
      dealId,
      tenantId,
      userId,
      meetingNote: body.meetingNote,
    })

    return { jobId }
  }

  // ─── SECURITY RULES FOR TASK OPERATIONS BASED ON DEAL PERMISSIONS ───

  // Only Admin/Manager may set or change a task's assignee, and the assignee
  // must belong to the same tenant as the task.
  private async assertAssigneeChangeAllowed(
    tenantId: string,
    assigneeId: string | null | undefined,
    user: { userId: string; role: string; tenantId: string },
  ) {
    if (assigneeId === undefined) return

    if (user.role !== ROLE.ADMIN && user.role !== ROLE.MANAGER) {
      throw AppException.forbidden(TaskErrorCode.FORBIDDEN_ASSIGN, 'Only Admin or Manager can assign tasks')
    }

    if (assigneeId !== null) {
      const assignee = await this.taskRepo.findAssigneeInTenant(tenantId, assigneeId)
      if (!assignee) {
        throw AppException.badRequest(TaskErrorCode.ASSIGNEE_NOT_FOUND, 'Assignee not found in this workspace')
      }
    }
  }

  async createTask(
    dealId: string,
    tenantId: string,
    data: CreateTaskBodyType,
    user: { userId: string; role: string; tenantId: string },
  ) {
    const deal = await this.dealRepo.findOne(dealId)
    if (!deal) throw AppException.notFound(DealErrorCode.NOT_FOUND, 'Deal not found')

    const ability = await this.caslAbilityFactory.createForUser(user)
    if (ability.cannot('update', subject('Deal', deal as any))) {
      throw AppException.notFound(DealErrorCode.NOT_FOUND, 'Deal not found')
    }

    await this.assertAssigneeChangeAllowed(tenantId, data.assigneeId, user)

    const task = await this.taskRepo.create(dealId, tenantId, data)
    await this.redisService.invalidateTenantCache(tenantId)
    return task
  }

  async createTasksBulk(
    dealId: string,
    tenantId: string,
    tasks: CreateTaskBodyType[],
    user: { userId: string; role: string; tenantId: string },
  ) {
    const deal = await this.dealRepo.findOne(dealId)
    if (!deal) throw AppException.notFound(DealErrorCode.NOT_FOUND, 'Deal not found')

    const ability = await this.caslAbilityFactory.createForUser(user)
    if (ability.cannot('update', subject('Deal', deal as any))) {
      throw AppException.notFound(DealErrorCode.NOT_FOUND, 'Deal not found')
    }

    const result = await this.taskRepo.createMany(dealId, tenantId, tasks)
    await this.redisService.invalidateTenantCache(tenantId)
    return result
  }

  async updateTask(
    dealId: string,
    tenantId: string,
    taskId: string,
    data: UpdateTaskBodyType,
    user: { userId: string; role: string; tenantId: string },
  ) {
    const deal = await this.dealRepo.findOne(dealId)
    if (!deal) throw AppException.notFound(DealErrorCode.NOT_FOUND, 'Deal not found')

    const ability = await this.caslAbilityFactory.createForUser(user)
    if (ability.cannot('update', subject('Deal', deal as any))) {
      throw AppException.notFound(DealErrorCode.NOT_FOUND, 'Deal not found')
    }

    await this.assertAssigneeChangeAllowed(tenantId, data.assigneeId, user)

    const task = await this.taskRepo.update(dealId, taskId, data)
    await this.redisService.invalidateTenantCache(tenantId)
    return task
  }

  async deleteTask(
    dealId: string,
    tenantId: string,
    taskId: string,
    user: { userId: string; role: string; tenantId: string },
  ) {
    const deal = await this.dealRepo.findOne(dealId)
    if (!deal) throw AppException.notFound(DealErrorCode.NOT_FOUND, 'Deal not found')

    const ability = await this.caslAbilityFactory.createForUser(user)
    if (ability.cannot('update', subject('Deal', deal as any))) {
      throw AppException.notFound(DealErrorCode.NOT_FOUND, 'Deal not found')
    }

    const result = await this.taskRepo.delete(dealId, taskId)
    await this.redisService.invalidateTenantCache(tenantId)
    return result
  }
}
