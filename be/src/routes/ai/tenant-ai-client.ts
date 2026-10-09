import { HttpException } from '@nestjs/common'
import { UnrecoverableError } from 'bullmq'
import { AiKeyCipherError } from '../../common/crypto/ai-key-cipher'
import { AiErrorCode, AppException } from '../../common/errors'
import { rootLogger } from '../../common/logger/root-logger'
import { AiClient, AiClientRequestOptions, AiCredential, createAiClient, statusOf } from './ai.client'

const log = rootLogger.child({ context: 'TenantAiClient' })

/** Where the company's provider and plain key come from (AiSettingsService). */
export interface AiCredentialSource {
  getDecryptedCredential(tenantId: string): Promise<AiCredential | null>
}

/** A provider rejected the request for a reason other than the key or availability (e.g. 400 on a too long prompt). */
export class AiProviderRequestError extends Error {
  constructor(readonly status: number) {
    super(`The AI provider rejected the request (HTTP ${status})`)
    this.name = 'AiProviderRequestError'
  }
}

/**
 * Client on the company's own key. The key is decrypted here, when the client
 * is created, i.e. in the process that makes the call: it is never put into a
 * queue job, and there is no fallback to a platform key or to another company.
 *
 * Rejects with 400 AI_KEY_NOT_CONFIGURED when the company has no key, and with
 * AI_KEY_INVALID when the stored key cannot be decrypted (the master secret
 * changed): in both cases the admin has to enter the key again.
 *
 * `complete()` of the returned client maps provider errors:
 * - 401/403 -> 400 AI_KEY_INVALID (the key was revoked or lost its rights);
 * - no HTTP status (network, timeout), 429, 5xx -> 400 AI_PROVIDER_UNREACHABLE;
 * - another 4xx -> AiProviderRequestError (not the key's fault).
 * The SDK's error is dropped on purpose: providers echo the key in their error
 * text and the SDKs copy it into error.message / the stack.
 */
export async function createTenantAiClient(
  source: AiCredentialSource,
  tenantId: string,
  options?: AiClientRequestOptions,
): Promise<AiClient> {
  let credential: AiCredential | null
  try {
    credential = await source.getDecryptedCredential(tenantId)
  } catch (error) {
    if (!(error instanceof AiKeyCipherError)) throw error
    log.warn({ event: 'ai_key.undecryptable', tenantId })
    throw AppException.badRequest(AiErrorCode.KEY_INVALID, 'The stored AI key cannot be used, enter it again')
  }
  if (!credential) {
    throw AppException.badRequest(AiErrorCode.KEY_NOT_CONFIGURED, 'AI is not configured: the company has no API key')
  }

  const { provider } = credential
  const client = createAiClient(credential, options)

  return {
    async complete(prompt, completionOptions) {
      try {
        return await client.complete(prompt, completionOptions)
      } catch (error) {
        const status = statusOf(error)
        const keyRejected = status === 401 || status === 403
        const unreachable = status === undefined || status === 429 || status >= 500
        log.warn({
          event: 'ai_call.failed',
          tenantId,
          provider,
          status: status ?? null,
          errorName: error instanceof Error ? error.constructor.name : typeof error,
        })
        if (keyRejected) {
          throw AppException.badRequest(
            AiErrorCode.KEY_INVALID,
            'The AI provider rejected the API key, check it in Settings → Integrations',
          )
        }
        if (unreachable) {
          throw AppException.badRequest(
            AiErrorCode.PROVIDER_UNREACHABLE,
            'The AI provider is not responding, try again later',
          )
        }
        throw new AiProviderRequestError(status)
      }
    },
  }
}

export interface AiJobFailure {
  /** Code for the `ai-error` SSE event and the log (the frontend translates errors.<reason>). */
  reason: AiErrorCode
  /** What the worker throws: UnrecoverableError makes BullMQ skip the remaining attempts. */
  error: Error
}

/**
 * How the worker treats an error from the tenant-key path, or null when it is
 * not one of them.
 *
 * - AI_KEY_NOT_CONFIGURED / AI_KEY_INVALID: retrying cannot help until an admin
 *   changes the key, so the job fails at once (UnrecoverableError, no backoff).
 * - AI_PROVIDER_UNREACHABLE: transient, a plain Error, so the queue's attempts /
 *   fixed backoff apply as before.
 */
export function toJobFailure(error: unknown): AiJobFailure | null {
  if (!(error instanceof HttpException)) return null
  const body = error.getResponse()
  const code = typeof body === 'object' ? (body as { code?: unknown }).code : undefined
  switch (code) {
    case AiErrorCode.KEY_NOT_CONFIGURED:
    case AiErrorCode.KEY_INVALID:
      return { reason: code, error: new UnrecoverableError(code) }
    case AiErrorCode.PROVIDER_UNREACHABLE:
      return { reason: code, error: new Error(code) }
    default:
      return null
  }
}
