import { HttpException, HttpStatus } from '@nestjs/common'
import { PipelineStageErrorCode } from 'src/common/errors'
import { PrismaService } from 'src/common/services/prisma.service'
import { RedisService } from 'src/common/services/redis.service'
import { AuditLogsRepository } from '../audit-logs/audit-logs.repo'
import { AuditLogsService } from '../audit-logs/audit-logs.service'
import { PipelineStagesRepository } from './pipeline-stages.repo'
import { PipelineStagesService } from './pipeline-stages.service'
import { CreatePipelineStageBodySchema, UpdatePipelineStageBodySchema } from './pipeline-stages.model'
import { PrismaClientKnownRequestError } from '../../../generated/prisma-client/internal/prismaNamespace'

// ─── In-memory stand-in for PrismaService ───────────────────────────────────
// Covers only what this module calls. It does not reproduce SQL: no CHECK or
// unique indexes, no real row locks, no tenant extension (the repository
// passes tenantId explicitly, which is what the isolation tests rely on).
// `$transaction` snapshots the rows and restores them when the callback
// throws, so the atomicity of the service logic can be asserted; a real
// Postgres rollback is not exercised here.

type FakeStage = {
  id: string
  tenantId: string
  name: string
  color: string
  order: number
  probability: number
  kind: 'OPEN' | 'WON' | 'LOST'
  legacyKey: string | null
  createdAt: Date
  updatedAt: Date
}

type FakeDeal = {
  id: string
  tenantId: string
  stageId: string | null
  stage: string
  deletedAt: Date | null
}

type FakeAuditLog = {
  tenantId: string
  userId: string
  action: string
  targetType: string
  targetId: string
  targetName: string | null
  changes: unknown
}

type Where = Record<string, unknown>

const matches = (row: Record<string, unknown>, where: Where = {}) =>
  Object.entries(where).every(([key, value]) => row[key] === value)

const clone = <T>(rows: T[]): T[] => rows.map((row) => ({ ...row }))

// Runs a synchronous fake body as a Prisma-like promise: a throw becomes a rejection.
const later = <T>(body: () => T): Promise<T> => new Promise((resolve) => resolve(body()))

class FakeDb {
  stages: FakeStage[] = []
  deals: FakeDeal[] = []
  auditLogs: FakeAuditLog[] = []
  /** tenantIds passed to the `SELECT ... FOR NO KEY UPDATE` lock, in call order. */
  locks: string[] = []
  /** Set to an Error to make the corresponding call throw. */
  fail: { auditLogCreate?: Error; dealUpdateMany?: Error; stageCreate?: Error; stageUpdate?: Error } = {}
  private seq = 0

  addStage(stage: Partial<FakeStage> & { tenantId: string; name: string }): FakeStage {
    const now = new Date(Date.UTC(2026, 0, 1, 0, 0, this.seq))
    const row: FakeStage = {
      id: `stage-${++this.seq}`,
      color: 'blue',
      order: 0,
      probability: 10,
      kind: 'OPEN',
      legacyKey: null,
      createdAt: now,
      updatedAt: now,
      ...stage,
    }
    this.stages.push(row)
    return row
  }

  /** The five default stages, mirroring DEFAULT_PIPELINE_STAGES. */
  addDefaultStages(tenantId: string) {
    return {
      prospect: this.addStage({
        tenantId,
        name: 'Лид',
        order: 0,
        probability: 10,
        color: 'blue',
        legacyKey: 'PROSPECT',
      }),
      qualified: this.addStage({
        tenantId,
        name: 'Контакт установлен',
        order: 1,
        probability: 30,
        color: 'purple',
        legacyKey: 'QUALIFIED',
      }),
      proposal: this.addStage({
        tenantId,
        name: 'Предложение',
        order: 2,
        probability: 60,
        color: 'orange',
        legacyKey: 'PROPOSAL',
      }),
      won: this.addStage({
        tenantId,
        name: 'Выиграно',
        order: 3,
        probability: 100,
        color: 'green',
        kind: 'WON',
        legacyKey: 'CLOSED_WON',
      }),
      lost: this.addStage({
        tenantId,
        name: 'Проиграно',
        order: 4,
        probability: 0,
        color: 'red',
        kind: 'LOST',
        legacyKey: 'CLOSED_LOST',
      }),
    }
  }

  addDeal(deal: Partial<FakeDeal> & { tenantId: string; stageId: string | null; stage: string }): FakeDeal {
    const row: FakeDeal = { id: `deal-${++this.seq}`, deletedAt: null, ...deal }
    this.deals.push(row)
    return row
  }

  tenantStages(tenantId: string) {
    return this.stages.filter((s) => s.tenantId === tenantId).sort((a, b) => a.order - b.order)
  }

  pipelineStage = {
    findMany: ({ where, include }: { where?: Where; include?: { _count?: unknown } } = {}) =>
      later(() => {
        const rows = this.stages
          .filter((s) => matches(s, where))
          .sort((a, b) => a.order - b.order || a.createdAt.getTime() - b.createdAt.getTime())
          .map((s) => ({ ...s }))
        if (!include?._count) return rows
        return rows.map((s) => ({
          ...s,
          _count: { deals: this.deals.filter((d) => d.stageId === s.id && d.deletedAt === null).length },
        }))
      }),
    findFirst: ({ where }: { where?: Where }) =>
      later(() => {
        const row = this.stages.find((s) => matches(s, where))
        return row ? { ...row } : null
      }),
    create: ({ data }: { data: Omit<FakeStage, 'id' | 'createdAt' | 'updatedAt'> }) =>
      later(() => {
        if (this.fail.stageCreate) throw this.fail.stageCreate
        return { ...this.addStage(data) }
      }),
    update: ({ where, data }: { where: Where; data: Partial<FakeStage> }) =>
      later(() => {
        if (this.fail.stageUpdate) throw this.fail.stageUpdate
        const row = this.stages.find((s) => matches(s, where))
        if (!row) throw new PrismaClientKnownRequestError('Record not found', { code: 'P2025', clientVersion: 'test' })
        Object.assign(row, data, { updatedAt: new Date() })
        return { ...row }
      }),
    delete: ({ where }: { where: Where }) =>
      later(() => {
        const row = this.stages.find((s) => matches(s, where))
        if (!row) throw new PrismaClientKnownRequestError('Record not found', { code: 'P2025', clientVersion: 'test' })
        // Deal.stageId is ON DELETE RESTRICT.
        if (this.deals.some((d) => d.stageId === row.id)) {
          throw new PrismaClientKnownRequestError('Foreign key constraint violated', {
            code: 'P2003',
            clientVersion: 'test',
          })
        }
        this.stages = this.stages.filter((s) => s !== row)
        return { ...row }
      }),
  }

  deal = {
    count: ({ where }: { where?: Where }) => later(() => this.deals.filter((d) => matches(d, where)).length),
    updateMany: ({ where, data }: { where?: Where; data: Partial<FakeDeal> }) =>
      later(() => {
        if (this.fail.dealUpdateMany) throw this.fail.dealUpdateMany
        const rows = this.deals.filter((d) => matches(d, where))
        rows.forEach((d) => Object.assign(d, data))
        return { count: rows.length }
      }),
  }

  auditLog = {
    create: ({ data }: { data: FakeAuditLog }) =>
      later(() => {
        if (this.fail.auditLogCreate) throw this.fail.auditLogCreate
        this.auditLogs.push({ ...data })
        return { id: `audit-${++this.seq}`, ...data }
      }),
  }

  $queryRaw = (_strings: TemplateStringsArray, ...values: string[]) =>
    later(() => {
      this.locks.push(values[0])
      return [{ id: values[0] }]
    })

  $transaction = async <T>(fn: (tx: this) => Promise<T>): Promise<T> => {
    const snapshot = { stages: clone(this.stages), deals: clone(this.deals), auditLogs: clone(this.auditLogs) }
    try {
      return await fn(this)
    } catch (error) {
      this.stages = snapshot.stages
      this.deals = snapshot.deals
      this.auditLogs = snapshot.auditLogs
      throw error
    }
  }
}

// ─── Spec ───────────────────────────────────────────────────────────────────

const T1 = 'tenant-1'
const T2 = 'tenant-2'
const ADMIN = { userId: 'admin-1', role: 'ADMIN', tenantId: T1 }
const MANAGER = { userId: 'manager-1', role: 'MANAGER', tenantId: T1 }
const SALES_REP = { userId: 'rep-1', role: 'SALES_REP', tenantId: T1 }

const expectAppError = async (promise: Promise<unknown>, status: HttpStatus, code: PipelineStageErrorCode) => {
  const err: unknown = await promise.then(
    () => {
      throw new Error('expected promise to reject')
    },
    (e: unknown) => e,
  )
  expect(err).toBeInstanceOf(HttpException)
  expect((err as HttpException).getStatus()).toBe(status)
  expect(((err as HttpException).getResponse() as { code: string }).code).toBe(code)
}

// The shape adapter-pg/Prisma 7 actually throw for a CHECK violation (SQLSTATE
// 23514): a raw DriverAdapterError, not a PrismaClientKnownRequestError.
// Observed against a real Postgres (PGlite) with the generated client.
const checkViolation = () =>
  Object.assign(new Error('new row for relation "PipelineStage" violates check constraint'), {
    name: 'DriverAdapterError',
    cause: { kind: 'postgres', code: '23514', originalCode: '23514' },
  })

const orderOf = (db: FakeDb, tenantId: string) => db.tenantStages(tenantId).map((s) => `${s.order}:${s.name}`)

describe('PipelineStagesService', () => {
  let db: FakeDb
  let redis: { invalidateTenantCache: jest.Mock }
  let service: PipelineStagesService

  beforeEach(() => {
    db = new FakeDb()
    redis = { invalidateTenantCache: jest.fn().mockResolvedValue(1) }
    const prisma = db as unknown as PrismaService
    service = new PipelineStagesService(
      new PipelineStagesRepository(prisma),
      redis as unknown as RedisService,
      new AuditLogsService(new AuditLogsRepository(prisma)),
    )
  })

  describe('list', () => {
    it('returns only the caller tenant stages, by order', async () => {
      db.addDefaultStages(T1)
      db.addStage({ tenantId: T2, name: 'Foreign', order: 0 })

      const stages = await service.list(SALES_REP)

      expect(stages.map((s) => s.name)).toEqual(['Лид', 'Контакт установлен', 'Предложение', 'Выиграно', 'Проиграно'])
    })

    it('adds dealCount (without soft-deleted deals) for ADMIN only', async () => {
      const { prospect } = db.addDefaultStages(T1)
      db.addDeal({ tenantId: T1, stageId: prospect.id, stage: 'PROSPECT' })
      db.addDeal({ tenantId: T1, stageId: prospect.id, stage: 'PROSPECT', deletedAt: new Date() })

      const forAdmin = await service.list(ADMIN)
      expect(forAdmin[0]).toMatchObject({ id: prospect.id, dealCount: 1 })
      expect(forAdmin[3]).toMatchObject({ kind: 'WON', dealCount: 0 })

      for (const user of [MANAGER, SALES_REP]) {
        const stages = await service.list(user)
        stages.forEach((s) => expect(s).not.toHaveProperty('dealCount'))
      }
    })
  })

  describe('create', () => {
    it('inserts an OPEN stage before WON; WON and LOST shift and stay last', async () => {
      db.addDefaultStages(T1)

      const created = await service.create(ADMIN, { name: 'Переговоры', color: 'teal', probability: 80 })

      expect(created).toMatchObject({ name: 'Переговоры', kind: 'OPEN', legacyKey: null, order: 3, probability: 80 })
      expect(orderOf(db, T1)).toEqual([
        '0:Лид',
        '1:Контакт установлен',
        '2:Предложение',
        '3:Переговоры',
        '4:Выиграно',
        '5:Проиграно',
      ])
      expect(db.locks).toEqual([T1])
      expect(redis.invalidateTenantCache).toHaveBeenCalledWith(T1)
      expect(db.auditLogs).toEqual([
        expect.objectContaining({ action: 'CREATE', targetType: 'PIPELINE_STAGE', targetId: created.id }),
      ])
    })

    it('cannot create a WON/LOST stage: kind is not accepted by the body schema', () => {
      const parsed = CreatePipelineStageBodySchema.safeParse({
        name: 'Won 2',
        color: 'blue',
        probability: 0,
        kind: 'WON',
      })
      expect(parsed.success).toBe(false)
    })

    it('maps a DB uniqueness violation (e.g. second WON/LOST, P2002) to 409', async () => {
      db.addDefaultStages(T1)
      db.fail.stageCreate = new PrismaClientKnownRequestError('Unique constraint failed', {
        code: 'P2002',
        clientVersion: 'test',
      })

      await expectAppError(
        service.create(ADMIN, { name: 'X', color: 'blue', probability: 5 }),
        HttpStatus.CONFLICT,
        PipelineStageErrorCode.CONFLICT,
      )
    })

    it('maps a DB CHECK violation to 400 instead of 500', async () => {
      db.addDefaultStages(T1)
      db.fail.stageCreate = checkViolation()

      await expectAppError(
        service.create(ADMIN, { name: 'X', color: 'blue', probability: 5 }),
        HttpStatus.BAD_REQUEST,
        PipelineStageErrorCode.INVALID_PROBABILITY,
      )
    })

    it('rejects the reserved colors green and red for an open stage', () => {
      for (const color of ['green', 'red']) {
        expect(CreatePipelineStageBodySchema.safeParse({ name: 'X', color, probability: 5 }).success).toBe(false)
        expect(UpdatePipelineStageBodySchema.safeParse({ color }).success).toBe(false)
      }
      for (const color of ['blue', 'purple', 'orange', 'teal', 'pink', 'yellow', 'gray', 'indigo']) {
        expect(CreatePipelineStageBodySchema.safeParse({ name: 'X', color, probability: 5 }).success).toBe(true)
      }
    })

    it('rejects probability outside 0-99 and names outside 1-50 chars after trim', () => {
      expect(CreatePipelineStageBodySchema.safeParse({ name: 'X', color: 'blue', probability: 100 }).success).toBe(
        false,
      )
      expect(CreatePipelineStageBodySchema.safeParse({ name: '   ', color: 'blue', probability: 5 }).success).toBe(
        false,
      )
      expect(
        CreatePipelineStageBodySchema.safeParse({ name: 'a'.repeat(51), color: 'blue', probability: 5 }).success,
      ).toBe(false)
      const trimmed = CreatePipelineStageBodySchema.parse({ name: '  Демо  ', color: 'blue', probability: 5 })
      expect(trimmed.name).toBe('Демо')
    })

    it('rejects a name already used in the tenant, case-insensitively (409)', async () => {
      db.addDefaultStages(T1)

      await expectAppError(
        service.create(ADMIN, { name: 'ЛИД', color: 'blue', probability: 5 }),
        HttpStatus.CONFLICT,
        PipelineStageErrorCode.NAME_TAKEN,
      )
      await expectAppError(
        service.create(ADMIN, { name: 'выиграно', color: 'blue', probability: 5 }),
        HttpStatus.CONFLICT,
        PipelineStageErrorCode.NAME_TAKEN,
      )
    })

    it('allows a name that only exists in another tenant', async () => {
      db.addDefaultStages(T1)
      db.addStage({ tenantId: T2, name: 'Демо' })

      await expect(service.create(ADMIN, { name: 'Демо', color: 'blue', probability: 5 })).resolves.toBeDefined()
    })

    it('enforces the maximum of 12 open stages', async () => {
      db.addDefaultStages(T1) // 3 open
      for (let i = 0; i < 9; i++) {
        await service.create(ADMIN, { name: `Stage ${i}`, color: 'gray', probability: 5 })
      }
      expect(db.tenantStages(T1).filter((s) => s.kind === 'OPEN')).toHaveLength(12)

      await expectAppError(
        service.create(ADMIN, { name: 'Thirteen', color: 'gray', probability: 5 }),
        HttpStatus.BAD_REQUEST,
        PipelineStageErrorCode.LIMIT_MAX,
      )
      expect(db.tenantStages(T1)).toHaveLength(14)
    })

    it('does not fail a committed create when writing the audit log fails', async () => {
      db.addDefaultStages(T1)
      db.fail.auditLogCreate = new Error('audit down')

      await expect(service.create(ADMIN, { name: 'X', color: 'blue', probability: 5 })).resolves.toMatchObject({
        name: 'X',
      })
      expect(db.tenantStages(T1)).toHaveLength(6)
    })
  })

  describe('update', () => {
    it('updates name, color and probability of an open stage', async () => {
      const { qualified } = db.addDefaultStages(T1)

      const updated = await service.update(ADMIN, qualified.id, {
        name: 'Квалификация',
        color: 'pink',
        probability: 40,
      })

      expect(updated).toMatchObject({ name: 'Квалификация', color: 'pink', probability: 40, legacyKey: 'QUALIFIED' })
      expect(redis.invalidateTenantCache).toHaveBeenCalledWith(T1)
      expect(db.auditLogs[0]).toMatchObject({
        action: 'UPDATE',
        targetType: 'PIPELINE_STAGE',
        changes: {
          name: { old: 'Контакт установлен', new: 'Квалификация' },
          color: { old: 'purple', new: 'pink' },
          probability: { old: 30, new: 40 },
        },
      })
    })

    it('allows renaming WON/LOST but not changing their color or probability', async () => {
      const { won, lost } = db.addDefaultStages(T1)

      await expect(service.update(ADMIN, won.id, { name: 'Успех' })).resolves.toMatchObject({ name: 'Успех' })

      for (const stage of [won, lost]) {
        await expectAppError(
          service.update(ADMIN, stage.id, { color: 'blue' }),
          HttpStatus.BAD_REQUEST,
          PipelineStageErrorCode.SYSTEM_FIELD_IMMUTABLE,
        )
        await expectAppError(
          service.update(ADMIN, stage.id, { probability: 50 }),
          HttpStatus.BAD_REQUEST,
          PipelineStageErrorCode.SYSTEM_FIELD_IMMUTABLE,
        )
      }
      expect(db.stages.find((s) => s.id === won.id)).toMatchObject({ color: 'green', probability: 100 })
      expect(db.stages.find((s) => s.id === lost.id)).toMatchObject({ color: 'red', probability: 0 })
    })

    it('returns 404 for a stage of another tenant', async () => {
      db.addDefaultStages(T1)
      const foreign = db.addStage({ tenantId: T2, name: 'Foreign' })

      await expectAppError(
        service.update(ADMIN, foreign.id, { name: 'Hijack' }),
        HttpStatus.NOT_FOUND,
        PipelineStageErrorCode.NOT_FOUND,
      )
      expect(db.stages.find((s) => s.id === foreign.id)?.name).toBe('Foreign')
    })

    it('rejects a name taken by another stage but allows changing case of its own name', async () => {
      const { prospect } = db.addDefaultStages(T1)

      await expectAppError(
        service.update(ADMIN, prospect.id, { name: 'предложение' }),
        HttpStatus.CONFLICT,
        PipelineStageErrorCode.NAME_TAKEN,
      )
      await expect(service.update(ADMIN, prospect.id, { name: 'ЛИД' })).resolves.toMatchObject({ name: 'ЛИД' })
    })

    it('maps a DB CHECK violation to 400', async () => {
      const { prospect } = db.addDefaultStages(T1)
      db.fail.stageUpdate = checkViolation()

      await expectAppError(
        service.update(ADMIN, prospect.id, { probability: 50 }),
        HttpStatus.BAD_REQUEST,
        PipelineStageErrorCode.INVALID_PROBABILITY,
      )
    })
  })

  describe('reorder', () => {
    it('reorders open stages and keeps WON and LOST last', async () => {
      const { prospect, qualified, proposal } = db.addDefaultStages(T1)

      await service.reorder(ADMIN, { stageIds: [proposal.id, prospect.id, qualified.id] })

      expect(orderOf(db, T1)).toEqual(['0:Предложение', '1:Лид', '2:Контакт установлен', '3:Выиграно', '4:Проиграно'])
      expect(db.locks).toEqual([T1])
      expect(redis.invalidateTenantCache).toHaveBeenCalledWith(T1)
      expect(db.auditLogs[0]).toMatchObject({ action: 'UPDATE', targetType: 'PIPELINE_STAGE' })
    })

    it('rejects an incomplete, foreign, duplicated or WON/LOST-containing list', async () => {
      const { prospect, qualified, proposal, won } = db.addDefaultStages(T1)
      const foreign = db.addStage({ tenantId: T2, name: 'Foreign' })
      const before = orderOf(db, T1)

      const invalid = [
        [prospect.id, qualified.id],
        [prospect.id, qualified.id, foreign.id],
        [prospect.id, qualified.id, proposal.id, foreign.id],
        [prospect.id, prospect.id, proposal.id],
        [prospect.id, qualified.id, proposal.id, won.id],
        [won.id, prospect.id, qualified.id, proposal.id],
      ]
      for (const stageIds of invalid) {
        await expectAppError(
          service.reorder(ADMIN, { stageIds }),
          HttpStatus.BAD_REQUEST,
          PipelineStageErrorCode.REORDER_MISMATCH,
        )
      }
      expect(orderOf(db, T1)).toEqual(before)
    })
  })

  describe('remove', () => {
    const addCustom = (name = 'Демо') => db.addStage({ tenantId: T1, name, order: 3, color: 'teal' })

    it('refuses to delete WON and LOST', async () => {
      const { won, lost } = db.addDefaultStages(T1)

      for (const stage of [won, lost]) {
        await expectAppError(
          service.remove(ADMIN, stage.id, {}),
          HttpStatus.BAD_REQUEST,
          PipelineStageErrorCode.SYSTEM_DELETE_NOT_ALLOWED,
        )
      }
      expect(db.tenantStages(T1)).toHaveLength(5)
    })

    it('deletes a default open stage and moves its deals, syncing Deal.stage via legacyDealStageFor', async () => {
      const { proposal, qualified } = db.addDefaultStages(T1)
      const deal = db.addDeal({ tenantId: T1, stageId: proposal.id, stage: 'PROPOSAL' })

      await expect(service.remove(ADMIN, proposal.id, { targetStageId: qualified.id })).resolves.toEqual({
        message: 'Pipeline stage deleted successfully',
      })

      expect(db.stages.some((s) => s.id === proposal.id)).toBe(false)
      expect(db.deals.find((d) => d.id === deal.id)).toMatchObject({ stageId: qualified.id, stage: 'QUALIFIED' })
      expect(orderOf(db, T1)).toEqual(['0:Лид', '1:Контакт установлен', '2:Выиграно', '3:Проиграно'])
      expect(redis.invalidateTenantCache).toHaveBeenCalledWith(T1)
    })

    it('deletes an empty default open stage without targetStageId', async () => {
      const { prospect } = db.addDefaultStages(T1)

      await service.remove(ADMIN, prospect.id, {})

      expect(db.stages.some((s) => s.id === prospect.id)).toBe(false)
      expect(db.tenantStages(T1)).toHaveLength(4)
    })

    it('still requires targetStageId when a default stage has deals', async () => {
      const { prospect } = db.addDefaultStages(T1)
      db.addDeal({ tenantId: T1, stageId: prospect.id, stage: 'PROSPECT' })

      await expectAppError(
        service.remove(ADMIN, prospect.id, {}),
        HttpStatus.BAD_REQUEST,
        PipelineStageErrorCode.TARGET_REQUIRED,
      )
      expect(db.tenantStages(T1)).toHaveLength(5)
    })

    it('refuses to delete the last open stage', async () => {
      db.addStage({ tenantId: T1, name: 'Only', order: 0 })
      db.addStage({ tenantId: T1, name: 'Won', order: 1, kind: 'WON', probability: 100, color: 'green' })
      db.addStage({ tenantId: T1, name: 'Lost', order: 2, kind: 'LOST', probability: 0, color: 'red' })
      const only = db.tenantStages(T1)[0]

      await expectAppError(service.remove(ADMIN, only.id, {}), HttpStatus.BAD_REQUEST, PipelineStageErrorCode.LIMIT_MIN)
    })

    it('returns 404 for a stage of another tenant', async () => {
      db.addDefaultStages(T1)
      const foreign = db.addStage({ tenantId: T2, name: 'Foreign' })

      await expectAppError(
        service.remove(ADMIN, foreign.id, {}),
        HttpStatus.NOT_FOUND,
        PipelineStageErrorCode.NOT_FOUND,
      )
    })

    it('deletes an empty custom stage without targetStageId and re-packs the order', async () => {
      db.addDefaultStages(T1)
      const custom = addCustom()
      // custom shares order 3 with WON; the service normalizes
      await service.remove(ADMIN, custom.id, {})

      expect(orderOf(db, T1)).toEqual(['0:Лид', '1:Контакт установлен', '2:Предложение', '3:Выиграно', '4:Проиграно'])
      expect(db.locks).toEqual([T1])
      expect(redis.invalidateTenantCache).toHaveBeenCalledWith(T1)
    })

    it('requires targetStageId when the stage has deals, soft-deleted ones included', async () => {
      db.addDefaultStages(T1)
      const custom = addCustom()
      db.addDeal({ tenantId: T1, stageId: custom.id, stage: 'PROSPECT', deletedAt: new Date() })

      await expectAppError(
        service.remove(ADMIN, custom.id, {}),
        HttpStatus.BAD_REQUEST,
        PipelineStageErrorCode.TARGET_REQUIRED,
      )
      expect(db.stages.some((s) => s.id === custom.id)).toBe(true)
    })

    it('rejects a target stage of another tenant, a missing one, or the deleted stage itself', async () => {
      db.addDefaultStages(T1)
      const custom = addCustom()
      db.addDeal({ tenantId: T1, stageId: custom.id, stage: 'PROSPECT' })
      const foreign = db.addStage({ tenantId: T2, name: 'Foreign' })

      for (const targetStageId of [foreign.id, 'missing', custom.id]) {
        await expectAppError(
          service.remove(ADMIN, custom.id, { targetStageId }),
          HttpStatus.BAD_REQUEST,
          PipelineStageErrorCode.TARGET_INVALID,
        )
      }
      expect(db.stages.some((s) => s.id === custom.id)).toBe(true)
      expect(db.deals[0].stageId).toBe(custom.id)
    })

    it.each([
      ['won', 'CLOSED_WON'],
      ['lost', 'CLOSED_LOST'],
      ['qualified', 'QUALIFIED'],
      ['custom', 'PROSPECT'],
    ] as const)('moves all deals to the %s stage and syncs Deal.stage to %s', async (targetKey, legacyStage) => {
      const defaults = db.addDefaultStages(T1)
      const custom = addCustom()
      const otherCustom = db.addStage({ tenantId: T1, name: 'Другая', order: 4, color: 'pink' })
      const target = targetKey === 'custom' ? otherCustom : defaults[targetKey]
      const live = db.addDeal({ tenantId: T1, stageId: custom.id, stage: 'PROSPECT' })
      const deleted = db.addDeal({ tenantId: T1, stageId: custom.id, stage: 'PROSPECT', deletedAt: new Date() })
      const untouched = db.addDeal({ tenantId: T1, stageId: defaults.prospect.id, stage: 'PROSPECT' })
      const updateMany = jest.spyOn(db.deal, 'updateMany')
      const logAction = jest.spyOn(AuditLogsService.prototype, 'logAction')

      await service.remove(ADMIN, custom.id, { targetStageId: target.id })

      expect(db.stages.some((s) => s.id === custom.id)).toBe(false)
      for (const deal of [live, deleted]) {
        expect(db.deals.find((d) => d.id === deal.id)).toMatchObject({ stageId: target.id, stage: legacyStage })
      }
      expect(db.deals.find((d) => d.id === untouched.id)).toMatchObject({ stageId: defaults.prospect.id })
      // One updateMany, scoped by tenant, writes stageId and the legacy stage together.
      expect(updateMany).toHaveBeenCalledTimes(1)
      expect(updateMany).toHaveBeenCalledWith({
        where: { tenantId: T1, stageId: custom.id },
        data: { stageId: target.id, stage: legacyStage },
      })
      // The audit entry is written through the transaction client.
      expect(logAction).toHaveBeenCalledWith(expect.objectContaining({ action: 'DELETE' }), db)
      logAction.mockRestore()
      expect(db.auditLogs).toEqual([
        expect.objectContaining({
          action: 'DELETE',
          targetType: 'PIPELINE_STAGE',
          targetId: custom.id,
          targetName: 'Демо',
        }),
      ])
      const stages = db.tenantStages(T1)
      expect(stages.slice(-2).map((s) => s.kind)).toEqual(['WON', 'LOST'])
      expect(stages.map((s) => s.order)).toEqual([0, 1, 2, 3, 4, 5])
    })

    it('is atomic: when the audit write fails the stage and its deals stay as they were', async () => {
      const { won } = db.addDefaultStages(T1)
      const custom = addCustom()
      const deal = db.addDeal({ tenantId: T1, stageId: custom.id, stage: 'PROSPECT' })
      db.fail.auditLogCreate = new Error('audit down')

      await expect(service.remove(ADMIN, custom.id, { targetStageId: won.id })).rejects.toThrow('audit down')

      expect(db.stages.some((s) => s.id === custom.id)).toBe(true)
      expect(db.deals.find((d) => d.id === deal.id)).toMatchObject({ stageId: custom.id, stage: 'PROSPECT' })
      expect(db.auditLogs).toHaveLength(0)
      expect(redis.invalidateTenantCache).not.toHaveBeenCalled()
    })

    it('is atomic: when moving the deals fails the stage stays', async () => {
      const { won } = db.addDefaultStages(T1)
      const custom = addCustom()
      db.addDeal({ tenantId: T1, stageId: custom.id, stage: 'PROSPECT' })
      db.fail.dealUpdateMany = new Error('db down')

      await expect(service.remove(ADMIN, custom.id, { targetStageId: won.id })).rejects.toThrow('db down')

      expect(db.stages.some((s) => s.id === custom.id)).toBe(true)
      expect(db.auditLogs).toHaveLength(0)
    })
  })
})
