import { Injectable } from '@nestjs/common'
import { PrismaService } from 'src/common/services/prisma.service'
import { Prisma } from '../../../generated/prisma-client/client'
import type { AiProvider } from '../../../generated/prisma-client/enums'
import { AiProviderApi } from './ai-settings.model'

type Db = Prisma.TransactionClient

const TO_DB: Record<AiProviderApi, AiProvider> = { openai: 'OPENAI', groq: 'GROQ', anthropic: 'ANTHROPIC' }
const FROM_DB: Record<AiProvider, AiProviderApi> = { OPENAI: 'openai', GROQ: 'groq', ANTHROPIC: 'anthropic' }

// tenantId is passed explicitly in every query on top of the Prisma tenant
// extension: TenantAiCredential is tenant-scoped there too, but the explicit
// filter also holds where CLS has no tenantId (the worker, in PR 3).
@Injectable()
export class AiSettingsRepository {
  constructor(private readonly prismaService: PrismaService) {}

  runInTransaction<T>(fn: (tx: Db) => Promise<T>): Promise<T> {
    return this.prismaService.$transaction(fn)
  }

  // Serializes key writes of one tenant (so the audit entry names the right
  // previous provider). NO KEY UPDATE does not block FK checks on Tenant.
  async lockTenant(tx: Db, tenantId: string) {
    await tx.$queryRaw`SELECT "id" FROM "Tenant" WHERE "id" = ${tenantId} FOR NO KEY UPDATE`
  }

  async find(tenantId: string, db: Db = this.prismaService) {
    const row = await db.tenantAiCredential.findUnique({ where: { tenantId } })
    return row && { ...row, provider: FROM_DB[row.provider] }
  }

  upsert(
    tx: Db,
    data: { tenantId: string; provider: AiProviderApi; encryptedKey: string; keyLast4: string; updatedById: string },
  ) {
    const fields = {
      provider: TO_DB[data.provider],
      encryptedKey: data.encryptedKey,
      keyLast4: data.keyLast4,
      updatedById: data.updatedById,
    }
    return tx.tenantAiCredential.upsert({
      where: { tenantId: data.tenantId },
      create: { tenantId: data.tenantId, ...fields },
      update: fields,
      select: { id: true },
    })
  }

  delete(tx: Db, tenantId: string) {
    return tx.tenantAiCredential.deleteMany({ where: { tenantId } })
  }
}
