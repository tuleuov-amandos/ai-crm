import { Injectable } from '@nestjs/common'
import { PrismaService } from 'src/common/services/prisma.service'
import { Prisma } from '../../../generated/prisma-client/client'
import { PrismaClientKnownRequestError } from '../../../generated/prisma-client/internal/prismaNamespace'
import { ChannelBaseType, GetMessagesQueryType, MessageBaseType } from './chat.model'

const channelInclude = {
  createdBy: { select: { id: true, name: true } },
} satisfies Prisma.ChannelInclude

const messageInclude = {
  sender: { select: { id: true, name: true, avatarUrl: true } },
} satisfies Prisma.MessageInclude

@Injectable()
export class ChatRepository {
  constructor(private readonly prisma: PrismaService) {}

  // Creates the Channel and enrolls the creator as its first ChannelMember.
  createChannel(userId: string, name: string): Promise<ChannelBaseType> {
    return this.prisma.$transaction(async (tx) => {
      const channel = await tx.channel.create({
        data: { name, createdById: userId } as Prisma.ChannelUncheckedCreateInput,
        include: channelInclude,
      })
      await tx.channelMember.create({
        data: { channelId: channel.id, userId },
      })
      return channel
    })
  }

  // All channels are visible tenant-wide — no membership filter here.
  findAllChannels(): Promise<ChannelBaseType[]> {
    return this.prisma.channel.findMany({
      orderBy: { createdAt: 'asc' },
      include: channelInclude,
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

  createMessage(channelId: string, senderId: string, content: string): Promise<MessageBaseType> {
    return this.prisma.message.create({
      data: { channelId, senderId, content } as Prisma.MessageUncheckedCreateInput,
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
