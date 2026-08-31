jest.mock('uuid', () => ({ v4: jest.fn(() => 'mocked-uuid') }))

import { Test, TestingModule } from '@nestjs/testing'
import { ForbiddenException } from '@nestjs/common'
import { InvitationsService } from './invitations.service'
import { HashingService } from 'src/common/services/hashing.service'
import { TokenService } from 'src/common/services/token.service'
import { MailService } from 'src/common/services/mail.service'
import { RedisService } from 'src/common/services/redis.service'
import { SharedUserRepository } from 'src/common/repositories/shared-user.repo'
import { InvitationRepository } from './invitation.repo'
import { PrismaService } from 'src/common/services/prisma.service'
import { ROLE } from 'src/common/constants/role.constanst'
import { AccessTokenPayload } from 'src/common/types/jwt.type'

describe('InvitationsService', () => {
  let service: InvitationsService

  const mockHashingService = {}
  const mockTokenService = {}
  const mockMailService = {
    sendInvitationEmail: jest.fn(),
  }
  const mockRedisService = {}
  const mockSharedUserRepo = {
    findUniqueEmail: jest.fn(),
    findTenantUnique: jest.fn(),
  }
  const mockInvitationRepo = {
    deleteManyByEmail: jest.fn(),
    create: jest.fn(),
    findByIdAndTenant: jest.fn(),
    update: jest.fn(),
  }
  const mockPrismaService = {
    role: {
      findFirst: jest.fn(),
    },
  }

  const tenantId = 'tenant-1'

  const managerUser: AccessTokenPayload = {
    userId: 'user-manager',
    role: ROLE.MANAGER,
    tenantId,
    exp: 0,
    iat: 0,
  }

  beforeEach(async () => {
    jest.clearAllMocks()

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        InvitationsService,
        { provide: HashingService, useValue: mockHashingService },
        { provide: TokenService, useValue: mockTokenService },
        { provide: MailService, useValue: mockMailService },
        { provide: RedisService, useValue: mockRedisService },
        { provide: SharedUserRepository, useValue: mockSharedUserRepo },
        { provide: InvitationRepository, useValue: mockInvitationRepo },
        { provide: PrismaService, useValue: mockPrismaService },
      ],
    }).compile()

    service = module.get<InvitationsService>(InvitationsService)
  })

  describe('createInvitation', () => {
    it('rejects a MANAGER inviting an ADMIN as privilege escalation', async () => {
      mockSharedUserRepo.findUniqueEmail.mockResolvedValue(null)
      mockSharedUserRepo.findTenantUnique.mockResolvedValue({ id: tenantId, name: 'Acme' })
      mockPrismaService.role.findFirst.mockResolvedValue({ id: 'role-admin', name: ROLE.ADMIN, tenantId })

      await expect(
        service.createInvitation({ email: 'new@acme.com', role: ROLE.ADMIN }, tenantId, managerUser),
      ).rejects.toThrow(ForbiddenException)

      expect(mockInvitationRepo.create).not.toHaveBeenCalled()
      expect(mockMailService.sendInvitationEmail).not.toHaveBeenCalled()
    })

    it('allows a MANAGER inviting a SALES_REP', async () => {
      mockSharedUserRepo.findUniqueEmail.mockResolvedValue(null)
      mockSharedUserRepo.findTenantUnique.mockResolvedValue({ id: tenantId, name: 'Acme' })
      mockPrismaService.role.findFirst.mockResolvedValue({ id: 'role-sales', name: ROLE.SALES_REP, tenantId })
      mockInvitationRepo.create.mockResolvedValue({ id: 'inv-1', email: 'new@acme.com' })

      const result = await service.createInvitation(
        { email: 'new@acme.com', role: ROLE.SALES_REP },
        tenantId,
        managerUser,
      )

      expect(result.role).toBe(ROLE.SALES_REP)
      expect(mockInvitationRepo.create).toHaveBeenCalled()
    })
  })

  describe('updateInvitation', () => {
    it('rejects a MANAGER updating an invitation to ADMIN', async () => {
      mockInvitationRepo.findByIdAndTenant.mockResolvedValue({
        id: 'inv-1',
        status: 'PENDING',
        email: 'new@acme.com',
      })
      mockPrismaService.role.findFirst.mockResolvedValue({ id: 'role-admin', name: ROLE.ADMIN, tenantId })

      await expect(
        service.updateInvitation('inv-1', { role: ROLE.ADMIN }, tenantId, managerUser),
      ).rejects.toThrow(ForbiddenException)

      expect(mockInvitationRepo.update).not.toHaveBeenCalled()
    })
  })
})
