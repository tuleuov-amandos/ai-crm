import { Injectable } from '@nestjs/common'
import { AppException, ChatErrorCode } from 'src/common/errors'
import { ROLE } from 'src/common/constants/role.constanst'
import { ChatRepository } from './chat.repo'
import { ChannelBaseType, GetMessagesPaginatedResType, GetMessagesQueryType, MessageBaseType } from './chat.model'

type CurrentUser = { userId: string; role: string; tenantId: string }

@Injectable()
export class ChatService {
  constructor(private readonly chatRepo: ChatRepository) {}

  async createChannel(userId: string, name: string): Promise<ChannelBaseType> {
    return this.chatRepo.createChannel(userId, name)
  }

  async listChannels(): Promise<{ data: ChannelBaseType[] }> {
    const data = await this.chatRepo.findAllChannels()
    return { data }
  }

  // Only the channel's creator or an Admin may delete it. All other roles are
  // equal in chat (see JoinChannel/LeaveChannel/CreateMessage below), so this
  // is the one place chat has an ownership check at all.
  async deleteChannel(channelId: string, user: CurrentUser): Promise<{ message: string }> {
    const channel = await this.chatRepo.findChannelById(channelId)
    if (!channel) throw AppException.notFound(ChatErrorCode.CHANNEL_NOT_FOUND, 'Channel not found')

    const isOwner = channel.createdById === user.userId
    const isAdmin = user.role === ROLE.ADMIN
    if (!isOwner && !isAdmin) {
      throw AppException.forbidden(
        ChatErrorCode.FORBIDDEN_DELETE_CHANNEL,
        'Only the channel creator or an Admin can delete this channel',
      )
    }

    await this.chatRepo.deleteChannel(channelId)
    return { message: 'Channel deleted successfully' }
  }

  async joinChannel(channelId: string, userId: string): Promise<{ message: string }> {
    const channel = await this.chatRepo.findChannelById(channelId)
    if (!channel) throw AppException.notFound(ChatErrorCode.CHANNEL_NOT_FOUND, 'Channel not found')

    await this.chatRepo.addMember(channelId, userId)
    return { message: 'Joined channel successfully' }
  }

  async leaveChannel(channelId: string, userId: string): Promise<{ message: string }> {
    const channel = await this.chatRepo.findChannelById(channelId)
    if (!channel) throw AppException.notFound(ChatErrorCode.CHANNEL_NOT_FOUND, 'Channel not found')

    await this.chatRepo.removeMember(channelId, userId)
    return { message: 'Left channel successfully' }
  }

  async createMessage(tenantId: string, channelId: string, senderId: string, content: string): Promise<MessageBaseType> {
    const channel = await this.chatRepo.findChannelById(channelId)
    // findChannelById is already tenant-scoped via the Prisma extension (CLS
    // tenantId), so this can only be false if that scoping is ever bypassed —
    // kept as an explicit cross-tenant guard, same principle as
    // TaskRepository.findAssigneeInTenant.
    if (!channel || channel.tenantId !== tenantId) {
      throw AppException.notFound(ChatErrorCode.CHANNEL_NOT_FOUND, 'Channel not found')
    }

    return this.chatRepo.createMessage(channelId, senderId, content)
  }

  async getMessages(
    tenantId: string,
    channelId: string,
    query: GetMessagesQueryType,
  ): Promise<GetMessagesPaginatedResType> {
    const channel = await this.chatRepo.findChannelById(channelId)
    if (!channel || channel.tenantId !== tenantId) {
      throw AppException.notFound(ChatErrorCode.CHANNEL_NOT_FOUND, 'Channel not found')
    }

    const { data, total } = await this.chatRepo.findMessages(channelId, query)
    return { data, total, page: query.page, limit: query.limit }
  }
}
