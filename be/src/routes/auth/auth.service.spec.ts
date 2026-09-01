jest.mock('uuid', () => ({ v4: jest.fn(() => 'mocked-uuid') }))

import { Test, TestingModule } from '@nestjs/testing'
import { UnauthorizedException } from '@nestjs/common'
import { AuthService } from './auth.service'
import { PrismaService } from 'src/common/services/prisma.service'
import { HashingService } from 'src/common/services/hashing.service'
import { SharedUserRepository } from 'src/common/repositories/shared-user.repo'
import { TokenService } from 'src/common/services/token.service'
import { AuthRepository } from './auth.repo'
import { RedisService } from 'src/common/services/redis.service'

describe('AuthService', () => {
  let service: AuthService

  const mockPrismaService = {
    account: {
      findUnique: jest.fn(),
      create: jest.fn(),
    },
    user: {
      findUnique: jest.fn(),
      create: jest.fn(),
    },
    invitation: {
      findFirst: jest.fn(),
      update: jest.fn(),
    },
    $transaction: jest.fn(),
  }

  const googleProfile = {
    provider: 'google',
    providerAccountId: 'google-id-1',
    email: 'victim@example.com',
    emailVerified: true,
    name: 'Victim User',
  }

  beforeEach(async () => {
    jest.clearAllMocks()

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: HashingService, useValue: {} },
        { provide: SharedUserRepository, useValue: {} },
        { provide: TokenService, useValue: {} },
        { provide: AuthRepository, useValue: {} },
        { provide: RedisService, useValue: {} },
      ],
    }).compile()

    service = module.get<AuthService>(AuthService)
  })

  describe('validateGoogleUser', () => {
    it('rejects an unverified email even if the caller claims emailVerified', async () => {
      await expect(
        service.validateGoogleUser({ ...googleProfile, emailVerified: false }),
      ).rejects.toThrow(UnauthorizedException)

      expect(mockPrismaService.account.findUnique).not.toHaveBeenCalled()
    })

    it('logs in through the already-linked Google account without touching other users', async () => {
      mockPrismaService.account.findUnique.mockResolvedValue({
        user: { id: 'user-1', role: { name: 'ADMIN' } },
      })

      const result = await service.validateGoogleUser(googleProfile)

      expect(result).toEqual(expect.objectContaining({ id: 'user-1', role: 'ADMIN' }))
      expect(mockPrismaService.user.findUnique).not.toHaveBeenCalled()
      expect(mockPrismaService.account.create).not.toHaveBeenCalled()
    })

    it('rejects and does NOT auto-link when the email matches an existing password user with no Google account', async () => {
      mockPrismaService.account.findUnique.mockResolvedValue(null)
      mockPrismaService.user.findUnique.mockResolvedValue({
        id: 'attacker-controlled-user',
        email: googleProfile.email,
        role: { name: 'ADMIN' },
      })

      await expect(service.validateGoogleUser(googleProfile)).rejects.toThrow(
        UnauthorizedException,
      )

      expect(mockPrismaService.account.create).not.toHaveBeenCalled()
    })

    it('creates a new account when no user and no invitation exist', async () => {
      mockPrismaService.account.findUnique.mockResolvedValue(null)
      mockPrismaService.user.findUnique.mockResolvedValue(null)
      mockPrismaService.invitation.findFirst.mockResolvedValue(null)

      const tx = {
        tenant: { create: jest.fn().mockResolvedValue({ id: 'tenant-1' }) },
        role: {
          create: jest
            .fn()
            .mockResolvedValueOnce({ id: 'role-admin' })
            .mockResolvedValueOnce({ id: 'role-manager' })
            .mockResolvedValueOnce({ id: 'role-sales' }),
        },
        permission: {
          findFirst: jest.fn().mockResolvedValue(null),
          findMany: jest.fn().mockResolvedValue([]),
        },
        rolePermission: { create: jest.fn() },
        user: { create: jest.fn().mockResolvedValue({ id: 'new-user-1' }) },
        account: { create: jest.fn() },
      }
      mockPrismaService.$transaction.mockImplementation((cb: any) => cb(tx))

      const result = await service.validateGoogleUser(googleProfile)

      expect(result).toEqual(expect.objectContaining({ id: 'new-user-1', role: 'ADMIN' }))
      expect(tx.account.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            userId: 'new-user-1',
            provider: 'google',
            providerAccountId: googleProfile.providerAccountId,
          }),
        }),
      )
    })
  })
})
