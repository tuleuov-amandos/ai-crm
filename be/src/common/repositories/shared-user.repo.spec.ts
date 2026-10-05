import { PrismaService } from 'src/common/services/prisma.service'
import { SharedUserRepository } from './shared-user.repo'

describe('SharedUserRepository.createTenantIncludeUser', () => {
  const payload = {
    companyName: 'Acme',
    slug: 'acme',
    email: 'admin@acme.test',
    name: 'Admin',
    hashedPassword: 'hashed',
    role: 'ADMIN' as const,
  }

  const buildTx = () => ({
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
    user: { create: jest.fn().mockResolvedValue({ id: 'user-1', role: { name: 'ADMIN' } }) },
  })

  it('provisions the default pipeline stages for the new tenant inside the transaction', async () => {
    const tx = buildTx()
    const prisma = { $transaction: jest.fn((cb: (t: typeof tx) => unknown) => cb(tx)) }
    const repo = new SharedUserRepository(prisma as unknown as PrismaService)

    await repo.createTenantIncludeUser(payload)

    expect(tx.pipelineStage.createMany).toHaveBeenCalledTimes(1)
    const { data } = tx.pipelineStage.createMany.mock.calls[0][0]
    expect(data).toHaveLength(5)
    expect(data.every((s: { tenantId: string }) => s.tenantId === 'tenant-1')).toBe(true)
  })
})
