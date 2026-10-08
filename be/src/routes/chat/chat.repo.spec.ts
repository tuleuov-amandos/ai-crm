import { Prisma } from '../../../generated/prisma-client/client'
import { PrismaService } from 'src/common/services/prisma.service'
import { ChatRepository } from './chat.repo'

// Plain jest.fn stand-ins for the PrismaService calls under test. No SQL is
// executed: these lock which conditions the repository sends (tenantId on every
// query, deletedAt guards), not how Postgres evaluates them.
const setup = () => {
  const tx = {
    message: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
    messageAttachment: {
      findMany: jest.fn().mockResolvedValue([{ publicId: 'p1', mimeType: 'application/pdf' }]),
      deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
  }
  const prisma = {
    channel: { findMany: jest.fn().mockResolvedValue([]) },
    message: {
      findFirst: jest.fn().mockResolvedValue(null),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    $queryRaw: jest.fn().mockResolvedValue([]),
    $transaction: jest.fn((fn: (client: typeof tx) => Promise<unknown>) => fn(tx)),
  }
  const repo = new ChatRepository(prisma as unknown as PrismaService)
  return { prisma, tx, repo }
}

const EDITABLE_SINCE = new Date('2026-10-07T12:00:00.000Z')
const NOW = new Date('2026-10-08T12:00:00.000Z')

describe('ChatRepository', () => {
  it('unread count SQL ignores deleted messages and stays tenant-scoped', async () => {
    const { prisma, repo } = setup()
    await repo.findAllChannels('t1', 'u1')
    const query = prisma.$queryRaw.mock.calls[0][0] as Prisma.Sql
    expect(query.sql).toContain('m."deletedAt" IS NULL')
    expect(query.sql).toContain('m."createdAt" > COALESCE(cm."lastReadAt", cm."joinedAt")')
    expect(query.values).toContain('t1')
  })

  it('findMessageInChannel filters by id, channel and tenant', async () => {
    const { prisma, repo } = setup()
    await repo.findMessageInChannel('t1', 'c1', 'm1')
    expect(prisma.message.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'm1', channelId: 'c1', tenantId: 't1' } }),
    )
  })

  it('updateMessageContent only touches a live, own, in-window message of this tenant and returns the count', async () => {
    const { prisma, repo } = setup()
    prisma.message.updateMany.mockResolvedValueOnce({ count: 0 })
    const count = await repo.updateMessageContent({
      tenantId: 't1',
      channelId: 'c1',
      messageId: 'm1',
      senderId: 'u1',
      content: 'new',
      editedAt: NOW,
      editableSince: EDITABLE_SINCE,
    })
    expect(count).toBe(0)
    expect(prisma.message.updateMany).toHaveBeenCalledWith({
      where: {
        id: 'm1',
        channelId: 'c1',
        tenantId: 't1',
        senderId: 'u1',
        deletedAt: null,
        createdAt: { gte: EDITABLE_SINCE },
      },
      data: { content: 'new', editedAt: NOW },
    })
  })

  describe('softDeleteMessage', () => {
    const params = {
      tenantId: 't1',
      channelId: 'c1',
      messageId: 'm1',
      senderId: 'u1',
      deletedAt: NOW,
      editableSince: EDITABLE_SINCE,
    }

    it('sets deletedAt and removes attachment rows in one transaction, returning their publicIds', async () => {
      const { prisma, tx, repo } = setup()
      const removed = await repo.softDeleteMessage(params)

      expect(prisma.$transaction).toHaveBeenCalledTimes(1)
      expect(tx.message.updateMany).toHaveBeenCalledWith({
        where: {
          id: 'm1',
          channelId: 'c1',
          tenantId: 't1',
          senderId: 'u1',
          deletedAt: null,
          createdAt: { gte: EDITABLE_SINCE },
        },
        data: { deletedAt: NOW },
      })
      const attachmentWhere = { messageId: 'm1', message: { tenantId: 't1' } }
      expect(tx.messageAttachment.findMany).toHaveBeenCalledWith({
        where: attachmentWhere,
        select: { publicId: true, mimeType: true },
      })
      expect(tx.messageAttachment.deleteMany).toHaveBeenCalledWith({ where: attachmentWhere })
      expect(tx.messageAttachment.findMany.mock.invocationCallOrder[0]).toBeLessThan(
        tx.messageAttachment.deleteMany.mock.invocationCallOrder[0],
      )
      expect(removed).toEqual([{ publicId: 'p1', mimeType: 'application/pdf' }])
    })

    it('returns null and leaves attachments alone when no row matched (already deleted / race)', async () => {
      const { tx, repo } = setup()
      tx.message.updateMany.mockResolvedValueOnce({ count: 0 })
      expect(await repo.softDeleteMessage(params)).toBeNull()
      expect(tx.messageAttachment.findMany).not.toHaveBeenCalled()
      expect(tx.messageAttachment.deleteMany).not.toHaveBeenCalled()
    })
  })
})
