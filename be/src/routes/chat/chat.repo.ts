import { Injectable } from '@nestjs/common'
import { PrismaService } from 'src/common/services/prisma.service'
import { Prisma } from '../../../generated/prisma-client/client'
import { PrismaClientKnownRequestError } from '../../../generated/prisma-client/internal/prismaNamespace'
import { ChannelBaseType, ChannelWithUnreadType, GetMessagesQueryType, MessageBaseType } from './chat.model'

const channelInclude = {
  createdBy: { select: { id: true, name: true } },
} satisfies Prisma.ChannelInclude

const messageInclude = {
  sender: { select: { id: true, name: true, avatarUrl: true } },
  attachments: { orderBy: { createdAt: 'asc' } },
} satisfies Prisma.MessageInclude

@Injectable()
export class ChatRepository {
  constructor(private readonly prisma: PrismaService) {}

  // Creates the Channel and enrolls the creator plus any initial memberIds
  // (deduped against the creator) as ChannelMember, all in one transaction.
  createChannel(userId: string, name: string, isPrivate: boolean, memberIds: string[] = []): Promise<ChannelBaseType> {
    return this.prisma.$transaction(async (tx) => {
      const channel = await tx.channel.create({
        data: { name, isPrivate, createdById: userId } as Prisma.ChannelUncheckedCreateInput,
        include: channelInclude,
      })
      const initialMemberIds = [...new Set([userId, ...memberIds])]
      await tx.channelMember.createMany({
        data: initialMemberIds.map((id) => ({ channelId: channel.id, userId: id })),
      })
      return channel
    })
  }

  // Public channels are visible tenant-wide, as before. A private channel is
  // only included when the requesting user has a ChannelMember row for it —
  // filtered at the query level so it's fully absent from the list rather
  // than merely inaccessible once opened (see ChatService.getChannelForTenant
  // for the corresponding per-channel access check).
  // unreadCount is computed separately in one aggregate query (instead of
  // per-channel) so this stays a single extra round-trip regardless of how
  // many channels the tenant has.
  async findAllChannels(tenantId: string, userId: string): Promise<ChannelWithUnreadType[]> {
    const [channels, unreadRows] = await Promise.all([
      this.prisma.channel.findMany({
        where: {
          OR: [{ isPrivate: false }, { isPrivate: true, members: { some: { userId } } }],
        },
        orderBy: { createdAt: 'asc' },
        include: channelInclude,
      }),
      // $queryRaw bypasses the tenant-isolation Prisma extension (it only
      // wraps model operations), so tenantId is filtered explicitly here.
      // For a channel the user hasn't joined, the LEFT JOIN to ChannelMember
      // has no row, cm.id is NULL, and the FILTER clause excludes every
      // message — unreadCount comes out 0 rather than the channel's full
      // history.
      this.prisma.$queryRaw<{ channelId: string; unreadCount: bigint }[]>(Prisma.sql`
        SELECT c.id AS "channelId",
               COUNT(m.id) FILTER (
                 WHERE cm.id IS NOT NULL AND m."createdAt" > COALESCE(cm."lastReadAt", cm."joinedAt")
               ) AS "unreadCount"
        FROM "Channel" c
        LEFT JOIN "ChannelMember" cm ON cm."channelId" = c.id AND cm."userId" = ${userId}
        LEFT JOIN "Message" m ON m."channelId" = c.id
        WHERE c."tenantId" = ${tenantId}
        GROUP BY c.id
      `),
    ])

    const unreadByChannel = new Map(unreadRows.map((row) => [row.channelId, Number(row.unreadCount)]))
    return channels.map((channel) => ({
      ...channel,
      unreadCount: unreadByChannel.get(channel.id) ?? 0,
    }))
  }

  // Upserts rather than updateMany: there's no explicit join flow from the UI
  // (only a socket join for the realtime room), so most members never get a
  // ChannelMember row via addMember. The first markChannelRead call implicitly
  // joins the channel; joinedAt is only set on create so it isn't reset on
  // subsequent reads.
  async markChannelRead(channelId: string, userId: string): Promise<void> {
    await this.prisma.channelMember.upsert({
      where: { channelId_userId: { channelId, userId } },
      create: { channelId, userId, joinedAt: new Date(), lastReadAt: new Date() },
      update: { lastReadAt: new Date() },
    })
  }

  findChannelById(channelId: string): Promise<ChannelBaseType | null> {
    return this.prisma.channel.findFirst({
      where: { id: channelId },
      include: channelInclude,
    })
  }

  async deleteChannel(channelId: string): Promise<void> {
    // Messages/ChannelMember cascade via the FK onDelete: Cascade in schema.prisma
    await this.prisma.channel.delete({ where: { id: channelId } })
  }

  // Idempotent — joining a channel you're already in is a no-op.
  async addMember(channelId: string, userId: string): Promise<void> {
    try {
      await this.prisma.channelMember.create({ data: { channelId, userId } })
    } catch (error) {
      if (error instanceof PrismaClientKnownRequestError && error.code === 'P2002') return
      throw error
    }
  }

  // Idempotent — leaving a channel you're not in is a no-op.
  async removeMember(channelId: string, userId: string): Promise<void> {
    await this.prisma.channelMember.deleteMany({ where: { channelId, userId } })
  }

  isMember(channelId: string, userId: string): Promise<boolean> {
    return this.prisma.channelMember
      .findUnique({ where: { channelId_userId: { channelId, userId } } })
      .then((member) => member !== null)
  }

  // Idempotent bulk add — skipDuplicates covers ids already in the channel
  // (e.g. re-adding a current member), same intent as addMember's P2002 catch.
  async addMembers(channelId: string, userIds: string[]): Promise<void> {
    if (userIds.length === 0) return
    await this.prisma.channelMember.createMany({
      data: userIds.map((userId) => ({ channelId, userId })),
      skipDuplicates: true,
    })
  }

  createMessage(channelId: string, senderId: string, content: string): Promise<MessageBaseType> {
    return this.prisma.message.create({
      data: { channelId, senderId, content } as Prisma.MessageUncheckedCreateInput,
      include: messageInclude,
    })
  }

  findMessageById(messageId: string): Promise<MessageBaseType | null> {
    return this.prisma.message.findFirst({
      where: { id: messageId },
      include: messageInclude,
    })
  }

  // Creates all attachment rows for one upload in a single insert, then
  // re-reads the message so the response includes the freshly attached files.
  async addAttachments(
    messageId: string,
    files: { url: string; publicId: string; fileName: string; mimeType: string }[],
  ): Promise<MessageBaseType> {
    await this.prisma.messageAttachment.createMany({
      data: files.map((file) => ({ messageId, ...file })),
    })
    return this.prisma.message.findFirstOrThrow({
      where: { id: messageId },
      include: messageInclude,
    })
  }

  // Newest first (DESC by createdAt), id as tiebreaker — same pagination shape as ActivitiesRepository.findAll.
  async findMessages(
    channelId: string,
    query: GetMessagesQueryType,
  ): Promise<{ data: MessageBaseType[]; total: number }> {
    const where = { channelId }
    const [data, total] = await this.prisma.$transaction([
      this.prisma.message.findMany({
        where,
        skip: (query.page - 1) * query.limit,
        take: query.limit,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        include: messageInclude,
      }),
      this.prisma.message.count({ where }),
    ])
    return { data, total }
  }
}
