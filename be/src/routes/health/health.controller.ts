import { Controller, Get, ServiceUnavailableException } from '@nestjs/common'
import { PrismaService } from 'src/common/services/prisma.service'
import { RedisService } from 'src/common/services/redis.service'

type CheckStatus = 'up' | 'down'

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
