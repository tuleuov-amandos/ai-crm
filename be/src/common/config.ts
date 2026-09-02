import z from 'zod'

import fs from 'fs'
import path from 'path'
import { config } from 'dotenv'

const envFilePath = path.resolve('.env')

// Support both local .env file and container-injected environment variables.
if (fs.existsSync(envFilePath)) {
  config({ path: envFilePath })
}

const ConfigSchema = z
  .object({
    DATABASE_URL: z.string(),
    ACCESS_TOKEN_SECRET: z.string(),
    ACCESS_TOKEN_EXPIRES_IN: z.string(),
    REFRESH_TOKEN_SECRET: z.string(),
    REFRESH_TOKEN_EXPIRES_IN: z.string(),

    FRONTEND_URL: z.string(),
    COOKIE_DOMAIN: z.string().optional(),
    NODE_ENV: z.string(),
    PORT: z.string(),

    // Observability. Both optional: when SENTRY_DSN is unset Sentry never
    // initializes (see src/instrument.ts) and the app runs unchanged.
    // LOG_LEVEL lets prod be bumped to "debug" via a Railway variable without
    // a rebuild; when unset the level is derived from NODE_ENV.
    SENTRY_DSN: z.string().optional(),
    LOG_LEVEL: z.string().optional(),

    OPENAI_API_KEY: z.string().optional(),
    OPENAI_MODEL: z.string().default('gpt-4o-mini'),
    GROQ_API_KEY: z.string().optional(),
    GROQ_MODEL: z.string().default('llama-3.3-70b-versatile'),
    ANTHROPIC_API_KEY: z.string().optional(),
    ANTHROPIC_MODEL: z.string().default('claude-haiku-4-5'),
    AI_PROVIDER: z.enum(['openai', 'groq', 'anthropic']).default('openai'),

    REDIS_HOST: z.string().min(1),
    REDIS_PORT: z.coerce.number().int().positive(),
    REDIS_PASSWORD: z.string().optional(),
    REDIS_TLS: z.string().optional(),
    RESEND_API_KEY: z.string().optional(),
    RESEND_FROM_EMAIL: z.string().optional(),

    GOOGLE_CLIENT_ID: z.string(),
    GOOGLE_CLIENT_SECRET: z.string(),
    GOOGLE_CALLBACK_URL: z.string(),

    // TODO: replace with a proper admin panel + PLATFORM_ADMIN role.
    // Temporary shared secret for the manual tenant-approval endpoint
    // (PATCH /internal/tenants/:id/status), checked by InternalAdminGuard
    // against the X-Internal-Admin-Token header.
    INTERNAL_ADMIN_TOKEN: z.string(),

    DATABASE_SSL_CA_PATH: z.string().optional(),
  })
  .superRefine((data, ctx) => {
    if (data.AI_PROVIDER === 'openai' && !data.OPENAI_API_KEY) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'OPENAI_API_KEY is required when AI_PROVIDER is openai',
        path: ['OPENAI_API_KEY'],
      })
    }
    if (data.AI_PROVIDER === 'groq' && !data.GROQ_API_KEY) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'GROQ_API_KEY is required when AI_PROVIDER is groq',
        path: ['GROQ_API_KEY'],
      })
    }
    if (data.AI_PROVIDER === 'anthropic' && !data.ANTHROPIC_API_KEY) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'ANTHROPIC_API_KEY is required when AI_PROVIDER is anthropic',
        path: ['ANTHROPIC_API_KEY'],
      })
    }
  })

// const configServer = plainToInstance(ConfigSchema, process.env);
const configServer = ConfigSchema.safeParse(process.env)

if (!configServer.success) {
  console.log('Invalid environment variables:')
  // throw configServer.error;
  console.log(configServer.error)
  // Under jest a process.exit(1) kills the worker ("test suite failed to run")
  // instead of surfacing a normal failure — throw so it reads as a failed test.
  if (process.env.NODE_ENV === 'test') {
    throw new Error(`Invalid environment variables: ${configServer.error.message}`)
  }
  process.exit(1)
}

// console.log(process.env)
// console.log(e);

const envConfig = configServer.data

// Denylist kept as a literal in code (never read from .env.example at runtime) so this
// check can't turn into a silent no-op if that file is missing or unreachable from the
// container's cwd. Mirrors the placeholders in .env.example — update both by hand if
// those placeholders change.
const INSECURE_DEFAULT_SECRETS = new Set([
  'test-access-token-secret-local-only',
  'test-refresh-token-secret-local-only',
])

const MIN_SECRET_LENGTH = 32

if (envConfig.NODE_ENV === 'production') {
  const errors: string[] = []

  for (const key of ['ACCESS_TOKEN_SECRET', 'REFRESH_TOKEN_SECRET'] as const) {
    const value = envConfig[key]
    if (INSECURE_DEFAULT_SECRETS.has(value)) {
      errors.push(`${key} is still set to the placeholder value from .env.example`)
    } else if (value.length < MIN_SECRET_LENGTH) {
      errors.push(`${key} must be at least ${MIN_SECRET_LENGTH} characters long`)
    }
  }

  if (envConfig.ACCESS_TOKEN_SECRET === envConfig.REFRESH_TOKEN_SECRET) {
    errors.push('ACCESS_TOKEN_SECRET and REFRESH_TOKEN_SECRET must not be the same value')
  }

  if (errors.length > 0) {
    console.error(`FATAL: insecure token secret configuration in production:\n- ${errors.join('\n- ')}`)
    process.exit(1)
  }
}

export default envConfig
