/**
 * Sentry bootstrap. This module MUST be imported before anything else in both
 * entrypoints (`main.ts` and `worker.ts`) so that:
 *   - `@sentry/node` auto-instrumentation patches libraries before they load,
 *   - its default `onUncaughtException` / `onUnhandledRejection` handlers are
 *     installed early enough to catch failures during startup.
 *
 * Importing `./common/config` here also runs env validation exactly once, the
 * same way the entrypoints already do.
 *
 * If `SENTRY_DSN` is not set, `Sentry.init` is never called — the SDK stays
 * dormant and the process behaves as if Sentry were not installed.
 */
import * as Sentry from '@sentry/node'
import envConfig from './common/config'

if (envConfig.SENTRY_DSN) {
  Sentry.init({
    dsn: envConfig.SENTRY_DSN,
    environment: envConfig.NODE_ENV,
    // No performance tracing for now — errors only.
    tracesSampleRate: 0,
    // Never let the SDK attach request bodies / headers / cookies / IPs.
    sendDefaultPii: false,
  })
  console.log(`Sentry initialized (environment=${envConfig.NODE_ENV})`)
} else {
  console.log('Sentry disabled (no DSN)')
}

export { Sentry }

const CONN_ERROR_CODES = new Set([
  'ECONNREFUSED',
  'ECONNRESET',
  'ETIMEDOUT',
  'EPIPE',
  'ENOTFOUND',
  'EAI_AGAIN',
  'EHOSTUNREACH',
  'ENETUNREACH',
])

/**
 * True for transient network / connection failures (Redis blip, DNS hiccup,
 * socket reset). Used to route these through `captureThrottled` so a short
 * outage doesn't flood Sentry with hundreds of identical events.
 */
export function isConnectionError(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false
  const e = err as { code?: string; name?: string; message?: string }
  if (e.code && CONN_ERROR_CODES.has(e.code)) return true
  if (e.name && ['MaxRetriesPerRequestError', 'ConnectionError'].includes(e.name)) return true
  return /ECONNREFUSED|ECONNRESET|ETIMEDOUT|Connection is closed|Command timed out|failed to connect/i.test(
    e.message ?? '',
  )
}

const lastSentAt = new Map<string, number>()
const suppressedCount = new Map<string, number>()

/**
 * Send an exception to Sentry at most once per `windowMs` for a given `key`.
 * Calls in between are counted and surfaced as `suppressedSincePrevious` on
 * the next event that does go through. Returns whether the event was sent.
 *
 * This gates ONLY Sentry — pino logging at the call site is independent and
 * still runs on every error. Backed by a plain Map (no timers); the key space
 * is tiny (one entry per error code), so no eviction is needed.
 */
type ThrottledCaptureOptions = {
  tags?: Record<string, string | number | boolean | undefined>
  extra?: Record<string, unknown>
}

export function captureThrottled(
  err: unknown,
  key: string,
  windowMs: number,
  options: ThrottledCaptureOptions = {},
): boolean {
  const now = Date.now()
  if (now - (lastSentAt.get(key) ?? 0) < windowMs) {
    suppressedCount.set(key, (suppressedCount.get(key) ?? 0) + 1)
    return false
  }
  const skipped = suppressedCount.get(key) ?? 0
  suppressedCount.delete(key)
  lastSentAt.set(key, now)
  Sentry.captureException(err, {
    tags: { ...options.tags, throttleKey: key },
    extra: { ...options.extra, suppressedSincePrevious: skipped, throttleWindowMs: windowMs },
  })
  return true
}
