import { Test, TestingModule } from '@nestjs/testing'
import { ServiceUnavailableException } from '@nestjs/common'
import type { Request } from 'express'
import { HealthController } from './health.controller'
import { PrismaService } from 'src/common/services/prisma.service'
import { RedisService } from 'src/common/services/redis.service'

describe('HealthController', () => {
  let controller: HealthController

  const mockPrismaService = {
    $queryRaw: jest.fn(),
  }
  const mockPing = jest.fn()
  const mockRedisService = {
    getClient: jest.fn(() => ({ ping: mockPing })),
  }

  beforeEach(async () => {
    jest.clearAllMocks()

    const module: TestingModule = await Test.createTestingModule({
      controllers: [HealthController],
      providers: [
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: RedisService, useValue: mockRedisService },
      ],
    }).compile()

    controller = module.get<HealthController>(HealthController)
  })

  describe('liveness', () => {
    it('returns ok without checking any dependency', () => {
      expect(controller.liveness()).toEqual({ status: 'ok' })
      expect(mockPrismaService.$queryRaw).not.toHaveBeenCalled()
      expect(mockRedisService.getClient).not.toHaveBeenCalled()
    })
  })

  describe('whoami', () => {
    it('returns client-IP info with only the whitelisted headers', () => {
      const req: any = {
        ip: '1.2.3.4',
        ips: ['1.2.3.4'],
        socket: { remoteAddress: '10.0.0.1' },
        headers: {
          'x-forwarded-for': '1.2.3.4, 5.6.7.8',
          'fastly-client-ip': '1.2.3.4',
          cookie: 'secret=1',
          authorization: 'Bearer token',
        },
        app: { get: jest.fn().mockReturnValue(1) },
      }

      const result = controller.whoami(req as Request)

      expect(req.app.get).toHaveBeenCalledWith('trust proxy')
      expect(result).toMatchObject({
        ip: '1.2.3.4',
        ips: ['1.2.3.4'],
        remoteAddress: '10.0.0.1',
        trustProxy: 1,
      })
      expect(Object.keys(result.headers).sort()).toEqual(
        [
          'cdn-loop',
          'fastly-client-ip',
          'via',
          'x-envoy-external-address',
          'x-forwarded-for',
          'x-forwarded-host',
          'x-forwarded-proto',
          'x-real-ip',
        ].sort(),
      )
      expect(result.headers['x-forwarded-for']).toBe('1.2.3.4, 5.6.7.8')
      expect(result.headers).not.toHaveProperty('cookie')
      expect(result.headers).not.toHaveProperty('authorization')
    })
  })

  describe('readiness', () => {
    it('returns ok with both checks up when db and redis are healthy', async () => {
      mockPrismaService.$queryRaw.mockResolvedValue([{ '?column?': 1 }])
      mockPing.mockResolvedValue('PONG')

      const result = await controller.readiness()

      expect(result).toEqual({ status: 'ok', checks: { db: 'up', redis: 'up' } })
    })

    it('throws 503 with per-check status when the database is down', async () => {
      mockPrismaService.$queryRaw.mockRejectedValue(new Error('connection refused'))
      mockPing.mockResolvedValue('PONG')

      await expect(controller.readiness()).rejects.toThrow(ServiceUnavailableException)

      try {
        await controller.readiness()
        fail('expected readiness() to throw')
      } catch (err: any) {
        expect(err.getResponse()).toEqual({
          status: 'error',
          checks: { db: 'down', redis: 'up' },
        })
      }
    })

    it('throws 503 with per-check status when redis is down but db is up', async () => {
      mockPrismaService.$queryRaw.mockResolvedValue([{ '?column?': 1 }])
      mockPing.mockRejectedValue(new Error('ECONNREFUSED'))

      await expect(controller.readiness()).rejects.toThrow(ServiceUnavailableException)
    })
  })
})
