import { AiErrorCode, AppException } from 'src/common/errors'
import { decrypt } from 'src/common/crypto/ai-key-cipher'
import { PrismaService } from 'src/common/services/prisma.service'
import { AuditLogsRepository } from '../audit-logs/audit-logs.repo'
import { AuditLogsService } from '../audit-logs/audit-logs.service'
import { validateAiKey } from '../ai/ai.client'
import { AiSettingsRepository } from './ai-settings.repo'
import { AiSettingsService } from './ai-settings.service'

// The provider check is mocked: no real calls. Logs are captured to assert
// that the key never reaches them.
jest.mock('../ai/ai.client', () => ({ validateAiKey: jest.fn() }))

const mockLogged: unknown[] = []
jest.mock('../../common/logger/root-logger', () => {
  const logger: Record<string, unknown> = {}
  for (const level of ['trace', 'debug', 'info', 'warn', 'error', 'fatal']) {
    logger[level] = (...args: unknown[]) => mockLogged.push({ level, args })
  }
  logger.child = () => logger
  return { rootLogger: logger }
})

const validateAiKeyMock = validateAiKey as jest.MockedFunction<typeof validateAiKey>

// ─── In-memory stand-in for PrismaService ───────────────────────────────────
// Covers only what this module calls. No tenant extension (the repository
// passes tenantId explicitly, which is what the isolation tests rely on), no
// real row locks. `$transaction` snapshots the rows and restores them when the
// callback throws; a real Postgres rollback is not exercised here.

type FakeCredential = {
  id: string
  tenantId: string
  provider: 'OPENAI' | 'GROQ' | 'ANTHROPIC'
  encryptedKey: string
  keyLast4: string
  updatedById: string
  createdAt: Date
  updatedAt: Date
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

const later = <T>(body: () => T): Promise<T> => new Promise((resolve) => resolve(body()))

class FakeDb {
  credentials: FakeCredential[] = []
  auditLogs: FakeAuditLog[] = []
  locks: string[] = []
  fail: { auditLogCreate?: Error } = {}
  private seq = 0

  tenantAiCredential = {
    findUnique: ({ where }: { where: { tenantId: string } }) =>
      later(() => {
        const row = this.credentials.find((c) => c.tenantId === where.tenantId)
        return row ? { ...row } : null
      }),
    upsert: ({
      where,
      create,
      update,
    }: {
      where: { tenantId: string }
      create: Omit<FakeCredential, 'id' | 'createdAt' | 'updatedAt'>
      update: Partial<FakeCredential>
    }) =>
      later(() => {
        const row = this.credentials.find((c) => c.tenantId === where.tenantId)
        if (row) {
          Object.assign(row, update, { updatedAt: new Date() })
          return { ...row }
        }
        const now = new Date()
        const created = { id: `cred-${++this.seq}`, createdAt: now, updatedAt: now, ...create }
        this.credentials.push(created)
        return { ...created }
      }),
    deleteMany: ({ where }: { where: { tenantId: string } }) =>
      later(() => {
        const before = this.credentials.length
        this.credentials = this.credentials.filter((c) => c.tenantId !== where.tenantId)
        return { count: before - this.credentials.length }
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
    const snapshot = {
      credentials: this.credentials.map((c) => ({ ...c })),
      auditLogs: this.auditLogs.map((a) => ({ ...a })),
    }
    try {
      return await fn(this)
    } catch (error) {
      this.credentials = snapshot.credentials
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
const ADMIN_T2 = { userId: 'admin-2', role: 'ADMIN', tenantId: T2 }

const KEY = 'sk-proj-service-test-secret-QZQZ'
const KEY_2 = 'sk-ant-another-secret-key-JXJX'

const expectNoKey = (value: unknown, ...keys: string[]) => {
  const text = JSON.stringify(value)
  for (const key of keys.length ? keys : [KEY, KEY_2]) {
    expect(text).not.toContain(key)
    expect(text).not.toContain(key.slice(-4))
  }
}

describe('AiSettingsService', () => {
  let db: FakeDb
  let service: AiSettingsService

  beforeEach(() => {
    db = new FakeDb()
    mockLogged.length = 0
    validateAiKeyMock.mockReset().mockResolvedValue(undefined)
    const prisma = db as unknown as PrismaService
    service = new AiSettingsService(
      new AiSettingsRepository(prisma),
      new AuditLogsService(new AuditLogsRepository(prisma)),
    )
  })

  describe('update (PUT)', () => {
    it('validation failed: nothing is written, no audit, no lock', async () => {
      const invalid = AppException.badRequest(AiErrorCode.KEY_INVALID, 'The AI provider rejected the API key')
      validateAiKeyMock.mockRejectedValueOnce(invalid)

      await expect(service.update(ADMIN, { provider: 'openai', apiKey: KEY })).rejects.toBe(invalid)

      expect(validateAiKeyMock).toHaveBeenCalledWith('openai', KEY)
      expect(db.credentials).toEqual([])
      expect(db.auditLogs).toEqual([])
      expect(db.locks).toEqual([])
    })

    it('provider unreachable: an existing key is kept as is', async () => {
      await service.update(ADMIN, { provider: 'openai', apiKey: KEY })
      const before = db.credentials.map((c) => ({ ...c }))
      validateAiKeyMock.mockRejectedValueOnce(
        AppException.badRequest(AiErrorCode.PROVIDER_UNREACHABLE, 'The AI provider could not be reached'),
      )

      await expect(service.update(ADMIN, { provider: 'groq', apiKey: KEY_2 })).rejects.toBeInstanceOf(AppException)

      expect(db.credentials).toEqual(before)
      expect(db.auditLogs).toHaveLength(1)
    })

    it('success: stores the key encrypted for the tenant, returns keyLast4, audits only the provider', async () => {
      const res = await service.update(ADMIN, { provider: 'openai', apiKey: KEY })

      expect(res).toEqual({ configured: true, provider: 'openai', keyLast4: 'QZQZ' })
      expect(db.credentials).toHaveLength(1)
      const row = db.credentials[0]
      expect(row).toMatchObject({ tenantId: T1, provider: 'OPENAI', keyLast4: 'QZQZ', updatedById: ADMIN.userId })
      expect(row.encryptedKey).toMatch(/^v1:/)
      expect(row.encryptedKey).not.toContain(KEY)
      expect(decrypt(row.encryptedKey, T1)).toBe(KEY)
      expect(db.locks).toEqual([T1])

      expect(db.auditLogs).toEqual([
        {
          tenantId: T1,
          userId: ADMIN.userId,
          action: 'CREATE',
          targetType: 'AI_SETTINGS',
          targetId: T1,
          targetName: null,
          changes: { provider: { old: null, new: 'openai' } },
        },
      ])
      expectNoKey(db.auditLogs)
      // keyLast4 is the only part of the key that goes out.
      expect(JSON.stringify(res)).not.toContain(KEY)
      expect(JSON.stringify(res)).not.toContain(KEY.slice(0, -4))
      expectNoKey(mockLogged)
    })

    it('a second PUT replaces the key instead of adding a row', async () => {
      await service.update(ADMIN, { provider: 'openai', apiKey: KEY })
      const firstId = db.credentials[0].id

      const res = await service.update({ ...ADMIN, userId: 'admin-1b' }, { provider: 'anthropic', apiKey: KEY_2 })

      expect(res).toEqual({ configured: true, provider: 'anthropic', keyLast4: 'JXJX' })
      expect(db.credentials).toHaveLength(1)
      expect(db.credentials[0]).toMatchObject({
        id: firstId,
        provider: 'ANTHROPIC',
        keyLast4: 'JXJX',
        updatedById: 'admin-1b',
      })
      expect(decrypt(db.credentials[0].encryptedKey, T1)).toBe(KEY_2)
      expect(db.auditLogs.map((a) => [a.action, a.changes])).toEqual([
        ['CREATE', { provider: { old: null, new: 'openai' } }],
        ['UPDATE', { provider: { old: 'openai', new: 'anthropic' } }],
      ])
      expectNoKey(db.auditLogs)
      expectNoKey(mockLogged)
    })

    it('an audit failure rolls the key write back (same transaction)', async () => {
      db.fail.auditLogCreate = new Error('audit down')

      await expect(service.update(ADMIN, { provider: 'groq', apiKey: KEY })).rejects.toThrow('audit down')

      expect(db.credentials).toEqual([])
    })
  })

  describe('get (GET)', () => {
    it('not configured: configured false, provider null; keyLast4 null for ADMIN only', async () => {
      expect(await service.get(ADMIN)).toEqual({ configured: false, provider: null, keyLast4: null })
      expect(await service.get(MANAGER)).toEqual({ configured: false, provider: null })
    })

    it('configured: every role sees the provider, only ADMIN sees keyLast4', async () => {
      await service.update(ADMIN, { provider: 'groq', apiKey: KEY })

      expect(await service.get(ADMIN)).toEqual({ configured: true, provider: 'groq', keyLast4: 'QZQZ' })
      for (const user of [MANAGER, SALES_REP]) {
        const res = await service.get(user)
        expect(res).toEqual({ configured: true, provider: 'groq' })
        expect(res).not.toHaveProperty('keyLast4')
      }
      const adminRes = await service.get(ADMIN)
      expect(JSON.stringify(adminRes)).not.toContain(KEY)
      expect(adminRes).not.toHaveProperty('encryptedKey')
    })
  })

  describe('remove (DELETE)', () => {
    it('deletes the key and audits the old provider', async () => {
      await service.update(ADMIN, { provider: 'anthropic', apiKey: KEY })

      await service.remove(ADMIN)

      expect(db.credentials).toEqual([])
      expect(db.auditLogs.map((a) => [a.action, a.targetType, a.changes])).toEqual([
        ['CREATE', 'AI_SETTINGS', { provider: { old: null, new: 'anthropic' } }],
        ['DELETE', 'AI_SETTINGS', { provider: { old: 'anthropic', new: null } }],
      ])
      expect(await service.get(ADMIN)).toEqual({ configured: false, provider: null, keyLast4: null })
      expectNoKey(db.auditLogs)
    })

    it('nothing configured: succeeds without an audit entry', async () => {
      await expect(service.remove(ADMIN)).resolves.toEqual({ message: expect.any(String) })
      expect(db.auditLogs).toEqual([])
    })
  })

  describe('tenant isolation', () => {
    it('keys of different tenants do not affect each other', async () => {
      await service.update(ADMIN, { provider: 'openai', apiKey: KEY })

      expect(await service.get(ADMIN_T2)).toEqual({ configured: false, provider: null, keyLast4: null })
      expect(await service.getDecryptedCredential(T2)).toBeNull()

      await service.update(ADMIN_T2, { provider: 'groq', apiKey: KEY_2 })
      await service.remove(ADMIN_T2)

      expect(db.credentials).toHaveLength(1)
      expect(await service.getDecryptedCredential(T1)).toEqual({ provider: 'openai', apiKey: KEY })
      expect(db.auditLogs.filter((a) => a.tenantId === T1)).toHaveLength(1)
      expect(db.auditLogs.filter((a) => a.tenantId === T2).map((a) => a.action)).toEqual(['CREATE', 'DELETE'])
    })

    it('a ciphertext moved to another tenant row does not decrypt', async () => {
      await service.update(ADMIN, { provider: 'openai', apiKey: KEY })
      db.credentials[0].tenantId = T2

      await expect(service.getDecryptedCredential(T2)).rejects.toThrow()
    })
  })

  describe('getDecryptedCredential', () => {
    it('returns the provider and the plain key, or null when not configured', async () => {
      expect(await service.getDecryptedCredential(T1)).toBeNull()

      await service.update(ADMIN, { provider: 'anthropic', apiKey: KEY })

      expect(await service.getDecryptedCredential(T1)).toEqual({ provider: 'anthropic', apiKey: KEY })
    })
  })
})
