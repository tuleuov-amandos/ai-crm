import { Injectable } from '@nestjs/common'
import { EventEmitter2 } from '@nestjs/event-emitter'
import { AppException, ChatErrorCode } from 'src/common/errors'
import { ROLE } from 'src/common/constants/role.constanst'
import { ChatRepository } from './chat.repo'
import { ChannelBaseType, GetMessagesPaginatedResType, GetMessagesQueryType, MessageBaseType } from './chat.model'

type CurrentUser = { userId: string; role: string; tenantId: string }

// Emitted after a message is durably persisted, regardless of whether it came
// in over REST or the chat WebSocket gateway. ChatGateway listens for this to
// push the message to everyone in the channel's room — see chat.gateway.ts
// for why this is an event instead of a direct gateway dependency.
export const MESSAGE_CREATED_EVENT = 'chat.message.created'

@Injectable()
export class ChatService {
  constructor(
    private readonly chatRepo: ChatRepository,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  // Shared by createMessage/getMessages (REST + gateway) so the
  // "does this channel belong to the caller's tenant" check lives in one
  // place instead of being copy-pasted at each call site.
  async getChannelForTenant(tenantId: string, channelId: string): Promise<ChannelBaseType> {
    const channel = await this.chatRepo.findChannelById(channelId)
    // findChannelById is already tenant-scoped via the Prisma extension (CLS
    // tenantId) on the REST path, so this can only be false there if that
    // scoping is ever bypassed. On the WebSocket path there is no CLS/HTTP
    // request to scope from, so this check is the only thing preventing a
    // user from one tenant from joining or posting into another tenant's
    // channel by guessing/reusing its id.
    if (!channel || channel.tenantId !== tenantId) {
      throw AppException.notFound(ChatErrorCode.CHANNEL_NOT_FOUND, 'Channel not found')
    }
    return channel
  }

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

  async createMessage(
    tenantId: string,
    channelId: string,
    senderId: string,
    content: string,
  ): Promise<MessageBaseType> {
    await this.getChannelForTenant(tenantId, channelId)

    const message = await this.chatRepo.createMessage(channelId, senderId, content)
    this.eventEmitter.emit(MESSAGE_CREATED_EVENT, message)
    return message
  }

  async getMessages(
    tenantId: string,
    channelId: string,
    query: GetMessagesQueryType,
  ): Promise<GetMessagesPaginatedResType> {
    await this.getChannelForTenant(tenantId, channelId)

    const { data, total } = await this.chatRepo.findMessages(channelId, query)
    return { data, total, page: query.page, limit: query.limit }
  }
}
