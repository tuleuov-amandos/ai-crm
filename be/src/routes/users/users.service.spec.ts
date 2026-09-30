import { Test, TestingModule } from '@nestjs/testing'
import { HttpException, HttpStatus } from '@nestjs/common'
import { UserErrorCode } from 'src/common/errors'
import { PrismaService } from 'src/common/services/prisma.service'
import { RedisService } from 'src/common/services/redis.service'
import { CloudinaryService } from 'src/common/services/cloudinary.service'
import { SessionRevocationService } from 'src/common/services/session-revocation.service'
import { AuditLogsService } from '../audit-logs/audit-logs.service'
import { UsersService, deletedUserEmail } from './users.service'

const expectAppError = async (promise: Promise<unknown>, code: UserErrorCode, status: HttpStatus) => {
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

describe('UsersService.deleteUser', () => {
  let service: UsersService

  const TENANT = 'tenant-1'
  const ADMIN = 'admin-1'
  const MEMBER = 'member-1'
  const member = { id: MEMBER, tenantId: TENANT, email: 'rep@example.com', name: 'Rep User', deletedAt: null }

  // The same object is both the client and the interactive-transaction `tx`,
  // so the test can assert on what ran inside the transaction.
  const tx = {
    user: { update: jest.fn() },
    refreshToken: { deleteMany: jest.fn() },
    account: { deleteMany: jest.fn() },
    channelMember: { deleteMany: jest.fn() },
  }
  const mockPrismaService = {
    user: { findFirst: jest.fn(), delete: jest.fn() },
    deal: { count: jest.fn() },
    $transaction: jest.fn((fn: (client: typeof tx) => Promise<unknown>) => fn(tx)),
  }
  const mockSessionRevocation = { revokeUser: jest.fn() }
  const mockAuditLogsService = { logAction: jest.fn() }

  beforeEach(async () => {
    jest.clearAllMocks()
    mockPrismaService.user.findFirst.mockResolvedValue(member)
    mockPrismaService.deal.count.mockResolvedValue(0)
    mockSessionRevocation.revokeUser.mockResolvedValue({ revokedSessions: 2 })

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UsersService,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: RedisService, useValue: {} },
        { provide: CloudinaryService, useValue: {} },
        { provide: SessionRevocationService, useValue: mockSessionRevocation },
        { provide: AuditLogsService, useValue: mockAuditLogsService },
      ],
    }).compile()

    service = module.get(UsersService)
  })

  it('deactivates the member instead of deleting the row', async () => {
    await expect(service.deleteUser(MEMBER, TENANT, ADMIN)).resolves.toEqual({
      message: 'Member removed successfully',
    })

    expect(mockPrismaService.user.findFirst).toHaveBeenCalledWith({
      where: { id: MEMBER, tenantId: TENANT, deletedAt: null },
    })
    expect(mockPrismaService.user.delete).not.toHaveBeenCalled()
    expect(mockPrismaService.$transaction).toHaveBeenCalledTimes(1)
  })

  it('runs every deactivation write inside the one transaction', async () => {
    await service.deleteUser(MEMBER, TENANT, ADMIN)

    expect(tx.user.update).toHaveBeenCalledWith({
      where: { id: MEMBER },
      data: { deletedAt: expect.any(Date), email: `deleted+${MEMBER}@deleted.invalid` },
    })
    expect(tx.refreshToken.deleteMany).toHaveBeenCalledWith({ where: { userId: MEMBER } })
    expect(tx.account.deleteMany).toHaveBeenCalledWith({ where: { userId: MEMBER } })
    expect(tx.channelMember.deleteMany).toHaveBeenCalledWith({ where: { userId: MEMBER } })
  })

  it('revokes sessions and writes an audit entry with the original email and the actor', async () => {
    await service.deleteUser(MEMBER, TENANT, ADMIN)

    expect(mockSessionRevocation.revokeUser).toHaveBeenCalledWith(MEMBER)
    expect(mockAuditLogsService.logAction).toHaveBeenCalledWith({
      tenantId: TENANT,
      userId: ADMIN,
      action: 'DELETE',
      targetType: 'USER',
      targetId: MEMBER,
      targetName: 'Rep User',
      changes: {
        email: { old: 'rep@example.com', new: deletedUserEmail(MEMBER) },
        deletedAt: { old: null, new: expect.any(String) },
      },
    })
  })

  it('still succeeds when Redis or the audit log fail after the DB commit', async () => {
    mockSessionRevocation.revokeUser.mockRejectedValue(new Error('redis down'))
    mockAuditLogsService.logAction.mockRejectedValue(new Error('db hiccup'))

    await expect(service.deleteUser(MEMBER, TENANT, ADMIN)).resolves.toEqual({
      message: 'Member removed successfully',
    })
    expect(tx.user.update).toHaveBeenCalled()
  })

  it('rejects removing yourself without touching the DB', async () => {
    await expectAppError(service.deleteUser(ADMIN, TENANT, ADMIN), UserErrorCode.CANNOT_REMOVE_SELF, 400)

    expect(mockPrismaService.user.findFirst).not.toHaveBeenCalled()
    expect(mockPrismaService.$transaction).not.toHaveBeenCalled()
  })

  it('rejects a member who still owns active deals', async () => {
    mockPrismaService.deal.count.mockResolvedValue(3)

    await expectAppError(service.deleteUser(MEMBER, TENANT, ADMIN), UserErrorCode.MEMBER_HAS_OWNED_DEALS, 400)

    expect(mockPrismaService.deal.count).toHaveBeenCalledWith({ where: { ownerId: MEMBER, deletedAt: null } })
    expect(mockPrismaService.$transaction).not.toHaveBeenCalled()
    expect(mockSessionRevocation.revokeUser).not.toHaveBeenCalled()
  })

  it('treats an already deactivated member as not found', async () => {
    // findFirst filters on deletedAt: null, so a deactivated member is not returned.
    mockPrismaService.user.findFirst.mockResolvedValue(null)

    await expectAppError(service.deleteUser(MEMBER, TENANT, ADMIN), UserErrorCode.MEMBER_NOT_FOUND, 404)

    expect(mockPrismaService.$transaction).not.toHaveBeenCalled()
    expect(mockSessionRevocation.revokeUser).not.toHaveBeenCalled()
  })
})
