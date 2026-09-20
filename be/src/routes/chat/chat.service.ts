import { Injectable } from '@nestjs/common'
import { EventEmitter2 } from '@nestjs/event-emitter'
import { AppException, ChatErrorCode } from 'src/common/errors'
import { ROLE } from 'src/common/constants/role.constanst'
import {
  ACTIVITY_ATTACHMENT_ALLOWED_MIME,
  ACTIVITY_ATTACHMENT_MAX_BYTES,
  CloudinaryService,
} from 'src/common/services/cloudinary.service'
import { ChatRepository } from './chat.repo'
import {
  ChannelBaseType,
  ChannelWithUnreadType,
  GetMessagesPaginatedResType,
  GetMessagesQueryType,
  MessageBaseType,
} from './chat.model'

type CurrentUser = { userId: string; role: string; tenantId: string }

// Same three formats as Settings → Activity attachment (be/src/common/services/cloudinary.service.ts):
// PDF/JPEG/PNG only, HEIC/HEIF explicitly rejected rather than silently
// re-encoded. Reusing the activity constants instead of duplicating them.
const HEIC_MIME_TYPES = ['image/heic', 'image/heif']

// Slack-style: several files per message, up to this many per upload call.
// Not confirmed with the client — a reasonable cap, revisit if it's too low.
export const CHAT_ATTACHMENTS_MAX_COUNT = 5

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
    private readonly cloudinary: CloudinaryService,
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

  async listChannels(tenantId: string, userId: string): Promise<{ data: ChannelWithUnreadType[] }> {
    const data = await this.chatRepo.findAllChannels(tenantId, userId)
    return { data }
  }

  async markChannelRead(channelId: string, userId: string): Promise<{ message: string }> {
    await this.chatRepo.markChannelRead(channelId, userId)
    return { message: 'Channel marked as read' }
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

  // Attachments always ride on an already-created message (WS has no
  // multipart support, so a message's text and its files never arrive in the
  // same call) — see chat.model.ts's CreateMessageBodySchema for why text is
  // still required to create a message in the first place.
  async uploadAttachments(
    messageId: string,
    tenantId: string,
    files: Express.Multer.File[] | undefined,
  ): Promise<MessageBaseType> {
    const message = await this.chatRepo.findMessageById(messageId)
    // Message.tenantId is set on creation from the same CLS-scoped tenantId
    // as the channel it belongs to (see chat.repo.ts createMessage), so
    // comparing it directly is equivalent to — and simpler than — re-loading
    // the parent channel just to check channel.tenantId.
    if (!message || message.tenantId !== tenantId) {
      throw AppException.notFound(ChatErrorCode.MESSAGE_NOT_FOUND, 'Message not found')
    }

    if (!files || files.length === 0) {
      throw AppException.badRequest(ChatErrorCode.ATTACHMENT_FILE_MISSING, 'No attachment files were uploaded')
    }

    // Validate every file before uploading any of them — an invalid file
    // anywhere in the batch rejects the whole request rather than attaching
    // a partial set, which is simpler and more predictable for the client
    // than reconciling a mixed success/failure response.
    for (const file of files) {
      if (!file.buffer?.length) {
        throw AppException.badRequest(ChatErrorCode.ATTACHMENT_FILE_MISSING, 'No attachment file was uploaded')
      }
      if (HEIC_MIME_TYPES.includes(file.mimetype)) {
        throw AppException.unprocessable(
          ChatErrorCode.ATTACHMENT_HEIC_NOT_SUPPORTED,
          'HEIC is not supported, convert the file to JPEG/PDF',
        )
      }
      if (
        !ACTIVITY_ATTACHMENT_ALLOWED_MIME.includes(file.mimetype as (typeof ACTIVITY_ATTACHMENT_ALLOWED_MIME)[number])
      ) {
        throw AppException.unprocessable(
          ChatErrorCode.ATTACHMENT_INVALID_TYPE,
          'Attachment must be a PDF, JPEG or PNG file',
        )
      }
      if (file.size > ACTIVITY_ATTACHMENT_MAX_BYTES) {
        throw AppException.unprocessable(ChatErrorCode.ATTACHMENT_TOO_LARGE, 'Attachment file is too large')
      }
    }

    const uploaded = await Promise.all(
      files.map((file) => this.cloudinary.uploadChatAttachment(file.buffer, messageId, file.mimetype)),
    )
    const attachmentRows = uploaded.map(({ url, publicId }, index) => ({
      url,
      publicId,
      fileName: files[index].originalname,
      mimeType: files[index].mimetype,
    }))

    const updated = await this.chatRepo.addAttachments(messageId, attachmentRows)
    // Reuses the message-created broadcast so connected clients see the
    // attachments appear on the existing message in real time, without a
    // separate socket event/gateway change.
    this.eventEmitter.emit(MESSAGE_CREATED_EVENT, updated)
    return updated
  }
}
