import pino from 'pino'
import { ClsServiceManager } from 'nestjs-cls'
import { baseLoggerOptions } from './pino-options'

/**
 * Plain pino instance for code that runs outside a Nest HTTP context — the
 * standalone worker process (`worker.ts`) and the BullMQ job handler
 * (`ai.processor.ts`), where `nestjs-pino`'s request-scoped logger is not
 * available.
 *
 * The `mixin` attaches `requestId` / `jobId` from CLS when a context happens to
 * be active; in the worker there is none, so it silently contributes nothing
 * and callers pass `jobId` explicitly via `.child({ jobId })` instead.
 */
export const rootLogger = pino({
  ...baseLoggerOptions,
  mixin() {
    try {
      const cls = ClsServiceManager.getClsService()
      const requestId = cls.get<string>('requestId')
      const jobId = cls.get<string>('jobId')
      return {
        ...(requestId ? { requestId } : {}),
        ...(jobId ? { jobId } : {}),
      }
    } catch {
      return {}
    }
  },
})
