/**
 * Runs once per test file, before any module (and thus src/common/config.ts)
 * is imported. Provides safe dummy values for the env vars that config.ts
 * validates via zod, so unit specs that transitively import real services
 * don't trip its process.exit(1) / throw.
 *
 * Uses `??=` so a real local `.env` or real CI secrets always win. These are
 * fake placeholders, never real credentials.
 */
const testEnv: Record<string, string> = {
  NODE_ENV: 'test',
  PORT: '3001',

  DATABASE_URL: 'postgresql://dummy:dummy@localhost:5432/dummy',

  ACCESS_TOKEN_SECRET: 'test-access-token-secret-0000000000000000',
  ACCESS_TOKEN_EXPIRES_IN: '15m',
  REFRESH_TOKEN_SECRET: 'test-refresh-token-secret-1111111111111111',
  REFRESH_TOKEN_EXPIRES_IN: '7d',

  FRONTEND_URL: 'http://localhost:3000',

  REDIS_HOST: 'localhost',
  REDIS_PORT: '6379',

  GOOGLE_CLIENT_ID: 'test-google-client-id',
  GOOGLE_CLIENT_SECRET: 'test-google-client-secret',
  GOOGLE_CALLBACK_URL: 'http://localhost:3001/auth/google/callback',

  AI_PROVIDER: 'openai',
  OPENAI_API_KEY: 'test-openai-key',

  INTERNAL_ADMIN_TOKEN: 'test-internal-admin-token',
}

for (const [key, value] of Object.entries(testEnv)) {
  process.env[key] ??= value
}
