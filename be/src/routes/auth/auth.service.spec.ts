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
import { MailService } from 'src/common/services/mail.service'
import { createHash } from 'crypto'
import { ResetPasswordBodySchema } from './auth.model'

const sha256 = (value: string) => createHash('sha256').update(value).digest('hex')

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
    refreshToken: {
      deleteMany: jest.fn(),
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

  const mockTokenService = {
    verifyRefreshToken: jest.fn(),
  }

  const mockRedisService = {
    set: jest.fn(),
    get: jest.fn(),
    delete: jest.fn(),
    addToSet: jest.fn(),
    getSetMembers: jest.fn().mockResolvedValue([]),
    removeFromSet: jest.fn(),
    getClient: jest.fn(),
  }

  // In-memory stand-in for the raw ioredis client (GET / SET with EX+NX / DEL),
  // so single-use and cooldown semantics are exercised for real.
  const redisStore = new Map<string, string>()
  const mockRedisClient = {
    get: jest.fn((key: string) => Promise.resolve(redisStore.get(key) ?? null)),
    set: jest.fn((key: string, value: string, ...args: (string | number)[]) => {
      if (args.includes('NX') && redisStore.has(key)) return Promise.resolve(null)
      redisStore.set(key, value)
      return Promise.resolve('OK')
    }),
    del: jest.fn((key: string) => Promise.resolve(redisStore.delete(key) ? 1 : 0)),
  }

  const mockAuthRepository = {
    findUserByEmail: jest.fn(),
  }

  const mockMailService = {
    sendPasswordResetEmail: jest.fn(),
  }

  beforeEach(async () => {
    jest.clearAllMocks()
    redisStore.clear()
    mockRedisService.getClient.mockReturnValue(mockRedisClient)
    mockMailService.sendPasswordResetEmail.mockResolvedValue(true)

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: HashingService, useValue: mockHashingService },
        { provide: SharedUserRepository, useValue: {} },
        { provide: TokenService, useValue: mockTokenService },
        { provide: AuthRepository, useValue: mockAuthRepository },
        { provide: RedisService, useValue: mockRedisService },
        { provide: MailService, useValue: mockMailService },
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

    it('rejects a linked Google account whose member was deactivated', async () => {
      mockPrismaService.account.findUnique.mockResolvedValue({
        user: { id: 'user-1', role: { name: 'SALES_REP' }, deletedAt: new Date() },
      })

      await expectAppError(
        service.validateGoogleUser(googleProfile),
        AuthErrorCode.INVALID_CREDENTIALS,
        HttpStatus.UNAUTHORIZED,
      )
      expect(mockPrismaService.user.findUnique).not.toHaveBeenCalled()
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
        pipelineStage: { createMany: jest.fn() },
        user: { create: jest.fn().mockResolvedValue({ id: 'new-user-1' }) },
        account: { create: jest.fn() },
      }
      mockPrismaService.$transaction.mockImplementation((cb: any) => cb(tx))

      const result = await service.validateGoogleUser(googleProfile)

      expect(result).toEqual(expect.objectContaining({ id: 'new-user-1', role: 'ADMIN' }))
      expect(tx.rolePermission.create).toHaveBeenCalledWith({
        data: { roleId: 'role-admin', permissionId: 'perm-manage-all' },
      })
      expect(tx.pipelineStage.createMany).toHaveBeenCalledWith({
        data: expect.arrayContaining([
          expect.objectContaining({ tenantId: 'tenant-1', legacyKey: 'PROSPECT' }),
          expect.objectContaining({ tenantId: 'tenant-1', legacyKey: 'CLOSED_LOST' }),
        ]),
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

  describe('refreshToken', () => {
    it('refuses to mint tokens for a deactivated member even if the token is still in the store', async () => {
      mockTokenService.verifyRefreshToken.mockResolvedValue({ userId: 'user-1' })
      mockRedisService.get.mockResolvedValue({ userId: 'user-1', role: 'SALES_REP', tenantId: 'tenant-1' })
      // findUnique filters on deletedAt: null, so a deactivated member is not returned.
      mockPrismaService.user.findUnique.mockResolvedValue(null)

      await expectAppError(
        service.refreshToken('refresh-token', {} as never),
        AuthErrorCode.REFRESH_TOKEN_INVALID,
        HttpStatus.UNAUTHORIZED,
      )
      expect(mockPrismaService.user.findUnique).toHaveBeenCalledWith({
        where: { id: 'user-1', deletedAt: null },
        select: { id: true },
      })
      // The presented token is consumed either way.
      expect(mockRedisService.delete).toHaveBeenCalledWith('auth:refresh:refresh-token')
      expect(mockRedisService.set).not.toHaveBeenCalled()
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

  describe('forgotPassword', () => {
    const passwordUser = { id: 'u1', email: 'user@example.com', password: 'hash-current' }

    it('stores only the token hash and emails a localized reset link to an existing user', async () => {
      mockAuthRepository.findUserByEmail.mockResolvedValue(passwordUser)

      const result = await service.forgotPassword({ email: 'user@example.com', locale: 'en' })

      expect(result).toEqual({ message: expect.any(String) })
      expect(mockAuthRepository.findUserByEmail).toHaveBeenCalledWith('user@example.com')
      expect(mockMailService.sendPasswordResetEmail).toHaveBeenCalledTimes(1)
      const { to, resetLink, locale } = mockMailService.sendPasswordResetEmail.mock.calls[0][0] as {
        to: string
        resetLink: string
        locale: string
      }
      expect(to).toBe('user@example.com')
      expect(locale).toBe('en')
      expect(resetLink).toMatch(/\/en\/reset-password\?token=[A-Za-z0-9_-]{43}$/)

      const token = new URL(resetLink).searchParams.get('token')
      const tokenHash = sha256(token)
      expect(redisStore.get(`auth:reset:${tokenHash}`)).toBe('u1')
      expect(redisStore.get('auth:reset:user:u1')).toBe(tokenHash)
      expect(mockRedisClient.set).toHaveBeenCalledWith(`auth:reset:${tokenHash}`, 'u1', 'EX', 3600)
      // The raw token is never written to Redis.
      expect([...redisStore.keys(), ...redisStore.values()].some((v) => v.includes(token))).toBe(false)
    })

    it('invalidates the previous link when a new one is requested', async () => {
      mockAuthRepository.findUserByEmail.mockResolvedValue(passwordUser)
      redisStore.set('auth:reset:old-hash', 'u1')
      redisStore.set('auth:reset:user:u1', 'old-hash')

      await service.forgotPassword({ email: 'user@example.com', locale: 'ru' })

      expect(redisStore.has('auth:reset:old-hash')).toBe(false)
      expect(redisStore.get('auth:reset:user:u1')).not.toBe('old-hash')
    })

    it('returns the same answer and sends nothing for an unknown email', async () => {
      mockAuthRepository.findUserByEmail.mockResolvedValue(null)
      mockAuthRepository.findUserByEmail.mockResolvedValueOnce(passwordUser)
      const known = await service.forgotPassword({ email: 'user@example.com', locale: 'ru' })
      mockMailService.sendPasswordResetEmail.mockClear()

      const unknown = await service.forgotPassword({ email: 'nobody@example.com', locale: 'ru' })

      expect(unknown).toEqual(known)
      expect(mockMailService.sendPasswordResetEmail).not.toHaveBeenCalled()
      expect([...redisStore.keys()].filter((k) => k.startsWith('auth:reset:user:'))).toEqual(['auth:reset:user:u1'])
    })

    it('sends nothing for a deactivated member (repository filters deletedAt)', async () => {
      // findUserByEmail queries `deletedAt: null`, so a deactivated member comes back as null.
      mockAuthRepository.findUserByEmail.mockResolvedValue(null)

      const result = await service.forgotPassword({ email: 'gone@example.com', locale: 'ru' })

      expect(result).toEqual({ message: expect.any(String) })
      expect(mockMailService.sendPasswordResetEmail).not.toHaveBeenCalled()
      expect(mockRedisClient.set).not.toHaveBeenCalledWith(
        expect.stringMatching(/^auth:reset:/),
        expect.anything(),
        'EX',
        3600,
      )
    })

    it('emails a Google-only account a notice without a reset link and issues no token', async () => {
      mockAuthRepository.findUserByEmail.mockResolvedValue({ ...passwordUser, password: null })

      const result = await service.forgotPassword({ email: 'user@example.com', locale: 'ru' })

      expect(result).toEqual({ message: expect.any(String) })
      expect(mockMailService.sendPasswordResetEmail).toHaveBeenCalledWith({
        to: 'user@example.com',
        resetLink: null,
        locale: 'ru',
      })
      expect([...redisStore.keys()].filter((k) => k.startsWith('auth:reset:'))).toEqual([])
    })

    it('sends nothing while the per-email cooldown is active', async () => {
      mockAuthRepository.findUserByEmail.mockResolvedValue(passwordUser)
      await service.forgotPassword({ email: 'user@example.com', locale: 'ru' })
      const firstHash = redisStore.get('auth:reset:user:u1')
      mockMailService.sendPasswordResetEmail.mockClear()

      // Case variant of the same address shares the cooldown.
      const result = await service.forgotPassword({ email: 'USER@example.com', locale: 'ru' })

      expect(result).toEqual({ message: expect.any(String) })
      expect(mockMailService.sendPasswordResetEmail).not.toHaveBeenCalled()
      expect(redisStore.get('auth:reset:user:u1')).toBe(firstHash)
      expect(mockRedisClient.set).toHaveBeenCalledWith(
        `auth:reset-cooldown:${sha256('user@example.com')}`,
        '1',
        'EX',
        60,
        'NX',
      )
    })

    it('does not fail the request when the email cannot be sent', async () => {
      mockAuthRepository.findUserByEmail.mockResolvedValue(passwordUser)
      mockMailService.sendPasswordResetEmail.mockRejectedValue(new Error('smtp down'))

      await expect(service.forgotPassword({ email: 'user@example.com', locale: 'ru' })).resolves.toEqual({
        message: expect.any(String),
      })
    })
  })

  describe('resetPassword', () => {
    const token = 'raw-reset-token'
    const tokenHash = sha256(token)
    const dto = { token, newPassword: 'BrandNew1!', confirmPassword: 'BrandNew1!' }

    beforeEach(() => {
      redisStore.set(`auth:reset:${tokenHash}`, 'u1')
      redisStore.set('auth:reset:user:u1', tokenHash)
      mockPrismaService.user.findUnique.mockResolvedValue({ id: 'u1' })
      mockPrismaService.user.update.mockResolvedValue({ id: 'u1' })
      mockPrismaService.refreshToken.deleteMany.mockResolvedValue({ count: 2 })
      mockPrismaService.$transaction.mockImplementation((ops: Promise<unknown>[]) => Promise.all(ops))
      mockHashingService.hash.mockResolvedValue('hash-new')
      mockRedisService.getSetMembers.mockResolvedValue(['rt-1', 'rt-2'])
    })

    afterEach(() => {
      mockRedisService.getSetMembers.mockResolvedValue([])
    })

    it('sets the new password, consumes the token and signs out every session without a denylist', async () => {
      const result = await service.resetPassword(dto)

      expect(result).toEqual({ message: expect.any(String) })
      expect(mockPrismaService.user.findUnique).toHaveBeenCalledWith({
        where: { id: 'u1', deletedAt: null },
        select: { id: true },
      })
      expect(mockHashingService.hash).toHaveBeenCalledWith('BrandNew1!')
      expect(mockPrismaService.user.update).toHaveBeenCalledWith({
        where: { id: 'u1' },
        data: { password: 'hash-new' },
      })
      expect(mockPrismaService.refreshToken.deleteMany).toHaveBeenCalledWith({ where: { userId: 'u1' } })
      expect(mockRedisService.delete).toHaveBeenCalledWith('auth:refresh:rt-1')
      expect(mockRedisService.delete).toHaveBeenCalledWith('auth:refresh:rt-2')
      expect(mockRedisService.delete).toHaveBeenCalledWith('auth:refresh:user:u1')
      expect(redisStore.has(`auth:reset:${tokenHash}`)).toBe(false)
      expect(redisStore.has('auth:reset:user:u1')).toBe(false)
      // No SessionRevocationService denylist: the next login must work right away.
      expect(mockRedisService.set).not.toHaveBeenCalled()
      expect(redisStore.has('auth:revoked:user:u1')).toBe(false)
    })

    it('also kills a newer link requested for the same user', async () => {
      redisStore.set('auth:reset:newer-hash', 'u1')
      redisStore.set('auth:reset:user:u1', 'newer-hash')

      await service.resetPassword(dto)

      expect(redisStore.has('auth:reset:newer-hash')).toBe(false)
    })

    it('rejects an unknown or expired token with 400', async () => {
      await expectAppError(
        service.resetPassword({ ...dto, token: 'not-a-real-token' }),
        AuthErrorCode.PASSWORD_RESET_TOKEN_INVALID,
        HttpStatus.BAD_REQUEST,
      )
      expect(mockPrismaService.user.update).not.toHaveBeenCalled()
    })

    it('rejects a token that has already been used', async () => {
      await service.resetPassword(dto)
      mockPrismaService.user.update.mockClear()

      await expectAppError(
        service.resetPassword(dto),
        AuthErrorCode.PASSWORD_RESET_TOKEN_INVALID,
        HttpStatus.BAD_REQUEST,
      )
      expect(mockPrismaService.user.update).not.toHaveBeenCalled()
    })

    it('lets only one of two concurrent requests with the same token through', async () => {
      // Both read the userId before either deletes the key.
      mockRedisClient.get.mockResolvedValueOnce('u1').mockResolvedValueOnce('u1')

      const results = await Promise.allSettled([service.resetPassword(dto), service.resetPassword(dto)])

      expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1)
      expect(mockPrismaService.user.update).toHaveBeenCalledTimes(1)
    })

    it('rejects when the member was deactivated after the link was sent', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue(null)

      await expectAppError(
        service.resetPassword(dto),
        AuthErrorCode.PASSWORD_RESET_TOKEN_INVALID,
        HttpStatus.BAD_REQUEST,
      )
      expect(mockPrismaService.user.update).not.toHaveBeenCalled()
    })
  })

  describe('ResetPasswordBodySchema', () => {
    const valid = { token: 'tok', newPassword: 'BrandNew1!', confirmPassword: 'BrandNew1!' }

    it('accepts a strong, confirmed password', () => {
      expect(ResetPasswordBodySchema.safeParse(valid).success).toBe(true)
    })

    it.each([
      ['too short', 'Ab1!'],
      ['no uppercase', 'brandnew1!'],
      ['no digit', 'BrandNew!!'],
      ['no special character', 'BrandNew11'],
    ])('rejects a weak password (%s)', (_label, pw) => {
      const result = ResetPasswordBodySchema.safeParse({ ...valid, newPassword: pw, confirmPassword: pw })
      expect(result.success).toBe(false)
      expect(result.error.issues[0].path).toEqual(['newPassword'])
    })

    it('rejects a mismatched confirmation', () => {
      const result = ResetPasswordBodySchema.safeParse({ ...valid, confirmPassword: 'Different1!' })
      expect(result.success).toBe(false)
      expect(result.error.issues[0]).toEqual(
        expect.objectContaining({ path: ['confirmPassword'], message: 'VALIDATION_PASSWORD_MISMATCH' }),
      )
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
        pipelineStage: { createMany: jest.fn() },
        user: { create: jest.fn() },
        account: { create: jest.fn() },
      }
      mockPrismaService.$transaction.mockImplementation((cb: any) => cb(tx))

      await expect(service.validateGoogleUser(googleProfile)).rejects.toThrow(/catalog is not seeded/i)
      expect(tx.rolePermission.create).not.toHaveBeenCalled()
      expect(tx.pipelineStage.createMany).not.toHaveBeenCalled()
      expect(tx.user.create).not.toHaveBeenCalled()
      expect(tx.account.create).not.toHaveBeenCalled()
    })
  })
})
