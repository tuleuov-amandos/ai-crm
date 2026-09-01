import { randomUUID } from 'crypto'
import type { LoggerOptions } from 'pino'
import type { Options as PinoHttpOptions } from 'pino-http'
import { ClsServiceManager } from 'nestjs-cls'
import envConfig from '../config'

const isProd = envConfig.NODE_ENV === 'production'
const isTest = envConfig.NODE_ENV === 'test'

/**
 * Effective log level. `LOG_LEVEL` (Railway variable) wins so prod can be
 * bumped to "debug" without a rebuild; otherwise: silent under jest, debug
 * outside prod, info in prod.
 */
export const LOG_LEVEL = envConfig.LOG_LEVEL ?? (isTest ? 'silent' : isProd ? 'info' : 'debug')

/**
 * Redaction is defense-in-depth, NOT the primary safeguard.
 *
 * Application code is written to hand the logger only explicit primitive
 * fields (ids, emails, roles, counts, error codes / stacks) and never a whole
 * `body`, `req.user`, `envConfig`, or an OpenAI `profile` object. These paths
 * censor anything that slips through regardless — both the request/response
 * metadata `pino-http` attaches automatically and any nested credential.
 *
 * pino matches a leading `*.` one level deep, so each secret is listed both
 * bare (top-level) and wildcarded (one level of nesting) — that covers every
 * shape we actually log.
 */
export const REDACT_PATHS = [
  // request/response metadata attached by pino-http
  'req.headers.authorization',
  'req.headers.cookie',
  'req.headers["x-api-key"]',
  'res.headers["set-cookie"]',
  // credentials / tokens
  'password',
  '*.password',
  'hashedPassword',
  '*.hashedPassword',
  'accessToken',
  '*.accessToken',
  'refreshToken',
  '*.refreshToken',
  'token',
  '*.token',
  'inviteLink',
  '*.inviteLink',
  // full-value secrets that live on the env / config object
  'DATABASE_URL',
  '*.DATABASE_URL',
  'ACCESS_TOKEN_SECRET',
  '*.ACCESS_TOKEN_SECRET',
  'REFRESH_TOKEN_SECRET',
  '*.REFRESH_TOKEN_SECRET',
  'OPENAI_API_KEY',
  '*.OPENAI_API_KEY',
  'GROQ_API_KEY',
  '*.GROQ_API_KEY',
  'GOOGLE_CLIENT_SECRET',
  '*.GOOGLE_CLIENT_SECRET',
  'REDIS_PASSWORD',
  '*.REDIS_PASSWORD',
  'RESEND_API_KEY',
  '*.RESEND_API_KEY',
]

/** Shared base options for both the Nest HTTP logger and the standalone worker logger. */
export const baseLoggerOptions: LoggerOptions = {
  level: LOG_LEVEL,
  redact: { paths: REDACT_PATHS, censor: '[REDACTED]' },
  // pino-pretty runs in a worker thread — only outside prod, and never under
  // jest (worker threads keep the test process from exiting cleanly).
  ...(isProd || isTest
    ? {}
    : {
        transport: {
          target: 'pino-pretty',
          options: { singleLine: true, translateTime: 'SYS:standard', ignore: 'pid,hostname' },
        },
      }),
}

/**
 * Resolve the current correlation id from CLS (set by ClsModule's middleware,
 * see common.module.ts). Falls back to an inbound `x-request-id` header, then a
 * fresh uuid, so a log line always carries an id even if the CLS context is
 * somehow not active yet.
 */
function resolveRequestId(req: { headers: Record<string, string | string[] | undefined>; id?: string }): string {
  try {
    const cls = ClsServiceManager.getClsService()
    const fromCls = cls.get<string>('requestId') || cls.getId()
    if (fromCls) return fromCls
  } catch {
    // no active CLS context — fall through
  }
  if (req.id) return req.id
  const incoming = req.headers['x-request-id']
  return (Array.isArray(incoming) ? incoming[0] : incoming) || randomUUID()
}

/** Options passed to `LoggerModule.forRoot({ pinoHttp })`. */
export const pinoHttpOptions: PinoHttpOptions = {
  ...(baseLoggerOptions as PinoHttpOptions),
  genReqId: (req, res) => {
    const id = resolveRequestId(req as never)
    res.setHeader('x-request-id', id)
    return id
  },
  customProps: () => {
    try {
      const tenantId = ClsServiceManager.getClsService().get<string>('tenantId')
      return tenantId ? { tenantId } : {}
    } catch {
      return {}
    }
  },
  customLogLevel: (_req, res, err) => {
    if (err || res.statusCode >= 500) return 'error'
    if (res.statusCode >= 400) return 'warn'
    return 'info'
  },
  // Health probes hit this endpoint constantly — don't log them.
  autoLogging: {
    ignore: (req) => (req.url ?? '').startsWith('/health'),
  },
}
