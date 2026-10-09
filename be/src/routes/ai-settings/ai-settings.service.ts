import { Injectable } from '@nestjs/common'
import { ROLE } from 'src/common/constants/role.constanst'
import { decrypt, encrypt } from 'src/common/crypto/ai-key-cipher'
import { rootLogger } from 'src/common/logger/root-logger'
import { AuditLogsService } from '../audit-logs/audit-logs.service'
import { validateAiKey } from '../ai/ai.client'
import { AiSettingsRepository } from './ai-settings.repo'
import { AiProviderApi, AiSettingsRes, UpdateAiSettingsBodyType } from './ai-settings.model'

const log = rootLogger.child({ context: 'AiSettingsService' })

type AuthUser = { userId: string; role: string; tenantId: string }

const AUDIT_TARGET_TYPE = 'AI_SETTINGS'

// The key never leaves this service in plain form except through
// getDecryptedCredential. Responses carry keyLast4 at most; audit entries and
// logs carry the provider only.
@Injectable()
export class AiSettingsService {
  constructor(
    private readonly aiSettingsRepo: AiSettingsRepository,
    private readonly auditLogsService: AuditLogsService,
  ) {}

  async get(user: AuthUser): Promise<AiSettingsRes> {
    const credential = await this.aiSettingsRepo.find(user.tenantId)
    const res = { configured: credential !== null, provider: credential?.provider ?? null }
    return user.role === ROLE.ADMIN ? { ...res, keyLast4: credential?.keyLast4 ?? null } : res
  }

  // The key is checked with the provider first; nothing is written (and no
  // lock is taken) unless the check passed.
  async update(user: AuthUser, body: UpdateAiSettingsBodyType): Promise<AiSettingsRes> {
    const { tenantId } = user
    const { provider, apiKey } = body

    await validateAiKey(provider, apiKey)

    const encryptedKey = encrypt(apiKey, tenantId)
    const keyLast4 = apiKey.slice(-4)

    const previousProvider = await this.aiSettingsRepo.runInTransaction(async (tx) => {
      await this.aiSettingsRepo.lockTenant(tx, tenantId)
      const before = await this.aiSettingsRepo.find(tenantId, tx)
      await this.aiSettingsRepo.upsert(tx, { tenantId, provider, encryptedKey, keyLast4, updatedById: user.userId })
      // Same transaction: a failed audit write rolls the key change back.
      await this.audit(user, before ? 'UPDATE' : 'CREATE', before?.provider ?? null, provider, tx)
      return before?.provider ?? null
    })

    log.info({ event: 'ai_settings.key_saved', tenantId, userId: user.userId, provider, previousProvider })
    return { configured: true, provider, keyLast4 }
  }

  async remove(user: AuthUser) {
    const { tenantId } = user
    const removedProvider = await this.aiSettingsRepo.runInTransaction(async (tx) => {
      await this.aiSettingsRepo.lockTenant(tx, tenantId)
      const before = await this.aiSettingsRepo.find(tenantId, tx)
      if (!before) return null
      await this.aiSettingsRepo.delete(tx, tenantId)
      await this.audit(user, 'DELETE', before.provider, null, tx)
      return before.provider
    })

    if (removedProvider) {
      log.info({ event: 'ai_settings.key_removed', tenantId, userId: user.userId, provider: removedProvider })
    }
    return { message: 'AI key removed successfully' }
  }

  /**
   * The tenant's provider and plain key for an AI call, or null when the
   * company has no key (AI is off for it; no fallback to the platform key).
   * Not used yet: the AI analysis switches to it in PR 3. Throws
   * AiKeyCipherError when the stored value cannot be decrypted.
   */
  async getDecryptedCredential(tenantId: string): Promise<{ provider: AiProviderApi; apiKey: string } | null> {
    const credential = await this.aiSettingsRepo.find(tenantId)
    if (!credential) return null
    return { provider: credential.provider, apiKey: decrypt(credential.encryptedKey, tenantId) }
  }

  private audit(
    user: AuthUser,
    action: 'CREATE' | 'UPDATE' | 'DELETE',
    oldProvider: AiProviderApi | null,
    newProvider: AiProviderApi | null,
    tx: Parameters<Parameters<AiSettingsRepository['runInTransaction']>[0]>[0],
  ) {
    return this.auditLogsService.logAction(
      {
        tenantId: user.tenantId,
        userId: user.userId,
        action,
        targetType: AUDIT_TARGET_TYPE,
        // One settings object per tenant, like the pipeline reorder entry.
        targetId: user.tenantId,
        targetName: null,
        changes: { provider: { old: oldProvider, new: newProvider } },
      },
      tx,
    )
  }
}
