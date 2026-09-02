import 'dotenv/config'
import Redis from 'ioredis'

/**
 * One-shot maintenance: drop every cached role-permission rule set so the next
 * request rebuilds it from the (now backfilled) database.
 *
 * casl-ability.factory.ts and auth.service.getProfile() cache rules under
 * `tenant:<id>:role:<name>:permissions` for 1h. After the catalog backfill
 * (migration 20260902130000_seed_permission_catalog_and_backfill_roles),
 * tenants that registered while the catalog was empty still have an empty rule
 * set cached — up to an hour of continued 403s without this.
 *
 * Idempotent, safe to run any time (pure read-through cache).
 *
 * Run once against prod right after `prisma migrate deploy`:
 *   railway run --service <api> npm run cache:invalidate-permissions
 */
const PATTERN = 'tenant:*:role:*:permissions'

function makeClient(): Redis {
  if (process.env.REDIS_URL) return new Redis(process.env.REDIS_URL)
  return new Redis({
    host: process.env.REDIS_HOST,
    port: Number(process.env.REDIS_PORT ?? 6379),
    password: process.env.REDIS_PASSWORD,
    tls: process.env.REDIS_TLS === 'true' ? {} : undefined,
  })
}

async function main() {
  const redis = makeClient()
  let cursor = '0'
  let deleted = 0

  do {
    const [next, keys] = await redis.scan(cursor, 'MATCH', PATTERN, 'COUNT', 200)
    cursor = next
    if (keys.length > 0) deleted += await redis.del(...keys)
  } while (cursor !== '0')

  console.log(`✓ invalidated ${deleted} cache key(s) matching "${PATTERN}"`)
  await redis.quit()
}

main().catch((err) => {
  console.error('✗ cache invalidation failed:', err)
  process.exit(1)
})
