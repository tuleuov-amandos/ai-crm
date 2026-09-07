import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common'
import Redis from 'ioredis'
import envConfig from '../config'

@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  private redis: Redis

  onModuleInit() {
    const useTls = envConfig.REDIS_TLS === 'true'
    this.redis = new Redis({
      host: envConfig.REDIS_HOST,
      port: envConfig.REDIS_PORT,
      password: process.env.REDIS_PASSWORD,
      tls: useTls ? {} : undefined,
    })

    this.redis.on('connect', () => {
      console.log('✓ Redis connected')
    })

    this.redis.on('error', (err) => {
      console.error('✗ Redis error:', err)
    })
  }

  onModuleDestroy() {
    // ioredis `disconnect()` is synchronous (immediate socket close), so there
    // is nothing to await here.
    this.redis.disconnect()
  }

  getClient(): Redis {
    return this.redis
  }

  // Utility methods
  async set(key: string, value: unknown, expiresIn?: number) {
    if (expiresIn) {
      await this.redis.setex(key, expiresIn, JSON.stringify(value))
    } else {
      await this.redis.set(key, JSON.stringify(value))
    }
  }

  async get(key: string) {
    const value = await this.redis.get(key)
    return value ? JSON.parse(value) : null
  }

  async delete(key: string) {
    await this.redis.del(key)
  }

  async addToSet(key: string, member: string, expiresIn?: number) {
    await this.redis.sadd(key, member)
    if (expiresIn) {
      await this.redis.expire(key, expiresIn)
    }
  }

  async getSetMembers(key: string): Promise<string[]> {
    return this.redis.smembers(key)
  }

  async removeFromSet(key: string, member: string) {
    await this.redis.srem(key, member)
  }

  async clear() {
    await this.redis.flushdb()
  }
  // Increment tenant cache version by 1 (invalidate all old cache)
  async invalidateTenantCache(tenantId: string): Promise<number> {
    const key = `cache:tenant_version:${tenantId}`
    return await this.redis.incr(key)
  }

  // Get current cache version of tenant
  async getTenantCacheVersion(tenantId: string): Promise<string> {
    const key = `cache:tenant_version:${tenantId}`
    let version = await this.redis.get(key)
    if (!version) {
      version = '1'
      await this.redis.set(key, version)
    }
    return version
  }
}
