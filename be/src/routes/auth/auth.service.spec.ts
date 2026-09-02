jest.mock('uuid', () => ({ v4: jest.fn(() => 'mocked-uuid') }))

import { Test, TestingModule } from '@nestjs/testing'
import { HttpException, HttpStatus } from '@nestjs/common'
import { AuthErrorCode } from 'src/common/errors'
import { AuthService } from './auth.service'

const expectAppError = async (promise: Promise<unknown>, code: AuthErrorCode, status: HttpStatus) => {
  const err: unknown = await promise.then(
    () => {
      throw new Error('expected promise to reject')
    },
    (e: unknown) => e,
  )
  expect(err).toBeInstanceOf(HttpException)
  expect((err as HttpException).getStatus()).toBe(status)
  expect(((err as HttpException).getResponse() as { code: string }).code).toBe(code)
}
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
      update: jest.fn(),
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

  const mockHashingService = {
    hash: jest.fn(),
    compare: jest.fn(),
  }

  beforeEach(async () => {
    jest.clearAllMocks()

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: HashingService, useValue: mockHashingService },
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
      await expectAppError(
        service.validateGoogleUser({ ...googleProfile, emailVerified: false }),
        AuthErrorCode.GOOGLE_EMAIL_NOT_VERIFIED,
        HttpStatus.UNAUTHORIZED,
      )

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

      await expectAppError(
        service.validateGoogleUser(googleProfile),
        AuthErrorCode.EMAIL_REGISTERED_WITH_PASSWORD,
        HttpStatus.UNAUTHORIZED,
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
          findFirst: jest.fn().mockResolvedValue({ id: 'perm-manage-all' }),
          findMany: jest
            .fn()
            .mockResolvedValue(Array.from({ length: 16 }, (_, i) => ({ id: `perm-${i}`, subject: 'Deal' }))),
        },
        rolePermission: { create: jest.fn() },
        user: { create: jest.fn().mockResolvedValue({ id: 'new-user-1' }) },
        account: { create: jest.fn() },
      }
      mockPrismaService.$transaction.mockImplementation((cb: any) => cb(tx))

      const result = await service.validateGoogleUser(googleProfile)

      expect(result).toEqual(expect.objectContaining({ id: 'new-user-1', role: 'ADMIN' }))
      expect(tx.rolePermission.create).toHaveBeenCalledWith({
        data: { roleId: 'role-admin', permissionId: 'perm-manage-all' },
      })
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

  describe('changePassword', () => {
    const dto = {
      currentPassword: 'Current1!',
      newPassword: 'BrandNew1!',
      confirmPassword: 'BrandNew1!',
    }

    it('rejects when the account has no local password (Google-only)', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue({ id: 'u1', password: null })

      await expectAppError(service.changePassword('u1', dto), AuthErrorCode.OAUTH_NO_PASSWORD, HttpStatus.BAD_REQUEST)
      expect(mockPrismaService.user.update).not.toHaveBeenCalled()
    })

    it('rejects when the current password is wrong', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue({ id: 'u1', password: 'hash-current' })
      mockHashingService.compare.mockResolvedValueOnce(false)

      await expectAppError(
        service.changePassword('u1', dto),
        AuthErrorCode.WRONG_PASSWORD,
        HttpStatus.UNPROCESSABLE_ENTITY,
      )
      expect(mockPrismaService.user.update).not.toHaveBeenCalled()
    })

    it('rejects when the new password equals the current one', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue({ id: 'u1', password: 'hash-current' })
      // 1st compare (current password) -> true, 2nd compare (new vs stored) -> true
      mockHashingService.compare.mockResolvedValueOnce(true).mockResolvedValueOnce(true)

      await expectAppError(service.changePassword('u1', dto), AuthErrorCode.PASSWORD_SAME, HttpStatus.BAD_REQUEST)
      expect(mockPrismaService.user.update).not.toHaveBeenCalled()
    })

    it('hashes and stores the new password on success', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue({ id: 'u1', password: 'hash-current' })
      mockHashingService.compare.mockResolvedValueOnce(true).mockResolvedValueOnce(false)
      mockHashingService.hash.mockResolvedValue('hash-new')
      mockPrismaService.user.update.mockResolvedValue({ id: 'u1' })

      const result = await service.changePassword('u1', dto)

      expect(mockHashingService.hash).toHaveBeenCalledWith(dto.newPassword)
      expect(mockPrismaService.user.update).toHaveBeenCalledWith({
        where: { id: 'u1' },
        data: { password: 'hash-new' },
      })
      expect(result).toEqual({ message: expect.any(String) })
    })
  })

  describe('validateGoogleUser (continued)', () => {
    it('refuses to provision a new tenant when the permission catalog is not seeded', async () => {
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
        user: { create: jest.fn() },
        account: { create: jest.fn() },
      }
      mockPrismaService.$transaction.mockImplementation((cb: any) => cb(tx))

      await expect(service.validateGoogleUser(googleProfile)).rejects.toThrow(/catalog is not seeded/i)
      expect(tx.rolePermission.create).not.toHaveBeenCalled()
      expect(tx.user.create).not.toHaveBeenCalled()
      expect(tx.account.create).not.toHaveBeenCalled()
    })
  })
})
