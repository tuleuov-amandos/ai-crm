import { Controller, Get, Req, ServiceUnavailableException } from '@nestjs/common'
import type { Request } from 'express'
import { PrismaService } from 'src/common/services/prisma.service'
import { RedisService } from 'src/common/services/redis.service'

type CheckStatus = 'up' | 'down'

const WHOAMI_HEADERS = [
  'x-forwarded-for',
  'x-real-ip',
  'fastly-client-ip',
  'cdn-loop',
  'via',
  'x-forwarded-proto',
  'x-forwarded-host',
  'x-envoy-external-address',
] as const

@Controller('health')
export class HealthController {
  constructor(
    private readonly prismaService: PrismaService,
    private readonly redisService: RedisService,
  ) {}

  @Get()
  liveness() {
    return { status: 'ok' }
  }

  @Get('ready')
  async readiness() {
    const [dbStatus, redisStatus] = await Promise.all([this.checkDatabase(), this.checkRedis()])

    const checks = { db: dbStatus, redis: redisStatus }
    const isReady = dbStatus === 'up' && redisStatus === 'up'

    if (!isReady) {
      throw new ServiceUnavailableException({ status: 'error', checks })
    }

    return { status: 'ok', checks }
  }

  // TEMPORARY diagnostic, remove in the follow-up PR (client-IP / throttling fix)
  @Get('whoami')
  whoami(@Req() req: Request) {
    const headers: Record<string, string | string[] | undefined> = {}
    for (const name of WHOAMI_HEADERS) {
      headers[name] = req.headers[name]
    }

    return {
      ip: req.ip,
      ips: req.ips,
      remoteAddress: req.socket.remoteAddress,
      headers,
      trustProxy: req.app.get('trust proxy'),
    }
  }

  private async checkDatabase(): Promise<CheckStatus> {
    try {
      await this.prismaService.$queryRaw`SELECT 1`
      return 'up'
    } catch {
      return 'down'
    }
  }

  private async checkRedis(): Promise<CheckStatus> {
    try {
      await this.redisService.getClient().ping()
      return 'up'
    } catch {
      return 'down'
    }
  }
}
