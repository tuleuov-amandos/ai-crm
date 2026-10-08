import { Injectable } from '@nestjs/common'
import { EventEmitter2 } from '@nestjs/event-emitter'
import { AppException, ChatErrorCode } from 'src/common/errors'
import { ROLE } from 'src/common/constants/role.constanst'
import { rootLogger } from 'src/common/logger/root-logger'
import {
  ACTIVITY_ATTACHMENT_ALLOWED_MIME,
  ACTIVITY_ATTACHMENT_MAX_BYTES,
  CloudinaryService,
} from 'src/common/services/cloudinary.service'
import { ChatRepository } from './chat.repo'
import {
  ChannelBaseType,
  ChannelMemberType,
  ChannelWithUnreadType,
  GetMessagesPaginatedResType,
  GetMessagesQueryType,
  MessageBaseType,
} from './chat.model'

type CurrentUser = { userId: string; role: string; tenantId: string }

const log = rootLogger.child({ context: 'ChatService' })

// Same three formats as Settings → Activity attachment (be/src/common/services/cloudinary.service.ts):
// PDF/JPEG/PNG only, HEIC/HEIF explicitly rejected rather than silently
// re-encoded. Reusing the activity constants instead of duplicating them.
const HEIC_MIME_TYPES = ['image/heic', 'image/heif']

// Slack-style: several files per message, up to this many per upload call.
// Not confirmed with the client — a reasonable cap, revisit if it's too low.
export const CHAT_ATTACHMENTS_MAX_COUNT = 5

// The author may edit or delete their own message for this long after createdAt.
export const MESSAGE_EDIT_WINDOW_MS = 24 * 60 * 60 * 1000

// multer/busboy decode the multipart filename as latin1 by default
// (defParamCharset), so UTF-8 names like "Инструкция.pdf" arrive as mojibake.
// Re-decode latin1 -> utf8 only when that is lossless-looking: every char
// <= U+00FF and the result has no U+FFFD. Names that are already proper
// (ASCII, or Cyrillic etc. with chars > U+00FF) are returned untouched.
export function decodeMulterFileName(name: string): string {
  if ([...name].some((ch) => ch.charCodeAt(0) > 0xff)) return name
  const decoded = Buffer.from(name, 'latin1').toString('utf8')
  return decoded.includes('\uFFFD') ? name : decoded
}

// Emitted after a message is durably persisted, regardless of whether it came
// in over REST or the chat WebSocket gateway. ChatGateway listens for this to
// push the message to everyone in the channel's room — see chat.gateway.ts
// for why this is an event instead of a direct gateway dependency.
export const MESSAGE_CREATED_EVENT = 'chat.message.created'

// Emitted after ChannelMember.lastReadAt is durably upserted, so ChatGateway
// can push the new value to everyone else currently looking at the channel
// (their own message's "read X of Y" status depends on it) — same
// event/gateway pattern as MESSAGE_CREATED_EVENT above.
export const CHANNEL_READ_EVENT = 'chat.channel.read'

export type ChannelReadEventPayload = {
  tenantId: string
  channelId: string
  userId: string
  lastReadAt: Date
}

// Emitted after an edit / soft delete is durably written; ChatGateway pushes
// them to the channel's room as `messageUpdated` / `messageDeleted` — same
// event/gateway pattern as MESSAGE_CREATED_EVENT above.
export const MESSAGE_UPDATED_EVENT = 'chat.message.updated'
export const MESSAGE_DELETED_EVENT = 'chat.message.deleted'

export type MessageDeletedEventPayload = {
  tenantId: string
  channelId: string
  messageId: string
  deletedAt: Date
}

// The one place that shapes a message for clients (REST responses and socket
// events). A soft-deleted message keeps its id, author and createdAt, but its
// text and attachments are never sent: Message.content stays in the database
// by the client's decision, and the attachment rows are already gone.
export function toMessageResponse(message: MessageBaseType): MessageBaseType {
  return message.deletedAt ? { ...message, content: '', attachments: [] } : message
}

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
  // `codes` lets message edit/delete reuse this exact check while reporting
  // message-level errors; every existing caller keeps the defaults.
  async getChannelForTenant(
    tenantId: string,
    channelId: string,
    userId: string,
    codes: { notFound: ChatErrorCode; forbidden: ChatErrorCode } = {
      notFound: ChatErrorCode.CHANNEL_NOT_FOUND,
      forbidden: ChatErrorCode.FORBIDDEN_PRIVATE_CHANNEL_ACCESS,
    },
  ): Promise<ChannelBaseType> {
    const channel = await this.chatRepo.findChannelById(channelId)
    // findChannelById is already tenant-scoped via the Prisma extension (CLS
    // tenantId) on the REST path, so this can only be false there if that
    // scoping is ever bypassed. On the WebSocket path there is no CLS/HTTP
    // request to scope from, so this check is the only thing preventing a
    // user from one tenant from joining or posting into another tenant's
    // channel by guessing/reusing its id.
    if (!channel || channel.tenantId !== tenantId) {
      throw AppException.notFound(codes.notFound, 'Channel not found')
    }
    // Public channels (isPrivate: false) keep their existing tenant-wide
    // access — nothing below runs for them.
    if (channel.isPrivate) {
      const isMember = await this.chatRepo.isMember(channelId, userId)
      if (!isMember) {
        throw AppException.forbidden(codes.forbidden, 'You are not a member of this channel')
      }
    }
    return channel
  }

  // ChannelMember has no tenantId and its FK to User is global, so every id
  // must be checked before it is written: it has to be an active (not
  // soft-deleted) user of this tenant. One generic 400 for all failure reasons
  // so the endpoint can't be used as an oracle for user ids.
  private async assertActiveTenantUsers(tenantId: string, ids: string[]): Promise<void> {
    const unique = [...new Set(ids)]
    if (unique.length === 0) return
    const found = await this.chatRepo.findActiveUserIdsInTenant(tenantId, unique)
    if (found.length !== unique.length) {
      throw AppException.badRequest(
        ChatErrorCode.INVALID_MEMBERS,
        'Some members are not active users of this workspace',
      )
    }
  }

  // isPrivate channels may only be created by an Admin. memberIds are added
  // as ChannelMember alongside the creator, in the same transaction that
  // creates the channel — see ChatRepository.createChannel.
  async createChannel(
    user: CurrentUser,
    name: string,
    isPrivate: boolean,
    memberIds: string[],
  ): Promise<ChannelBaseType> {
    if (isPrivate && user.role !== ROLE.ADMIN) {
      throw AppException.forbidden(
        ChatErrorCode.FORBIDDEN_CREATE_PRIVATE_CHANNEL,
        'Only an Admin can create a private channel',
      )
    }
    await this.assertActiveTenantUsers(user.tenantId, memberIds)
    return this.chatRepo.createChannel(user.userId, name, isPrivate, memberIds)
  }

  // Only the channel's creator or an Admin may add members — same ownership
  // check as deleteChannel below.
  async addChannelMembers(channelId: string, userIds: string[], user: CurrentUser): Promise<{ message: string }> {
    const channel = await this.chatRepo.findChannelById(channelId)
    if (!channel) throw AppException.notFound(ChatErrorCode.CHANNEL_NOT_FOUND, 'Channel not found')

    const isOwner = channel.createdById === user.userId
    const isAdmin = user.role === ROLE.ADMIN
    if (!isOwner && !isAdmin) {
      throw AppException.forbidden(
        ChatErrorCode.FORBIDDEN_ADD_MEMBERS,
        'Only the channel creator or an Admin can add members to this channel',
      )
    }

    await this.assertActiveTenantUsers(channel.tenantId, userIds)
    await this.chatRepo.addMembers(channelId, userIds)
    return { message: 'Members added successfully' }
  }

  async listChannels(tenantId: string, userId: string): Promise<{ data: ChannelWithUnreadType[] }> {
    const data = await this.chatRepo.findAllChannels(tenantId, userId)
    return { data }
  }

  async markChannelRead(tenantId: string, channelId: string, userId: string): Promise<{ message: string }> {
    const lastReadAt = await this.chatRepo.markChannelRead(channelId, userId)
    this.eventEmitter.emit(CHANNEL_READ_EVENT, {
      tenantId,
      channelId,
      userId,
      lastReadAt,
    } satisfies ChannelReadEventPayload)
    return { message: 'Channel marked as read' }
  }

  // GET /chat/channels/:id/members — same access check as any other channel
  // content (private channels: members only), used by the frontend to render
  // read receipts under the current user's own messages.
  async getChannelMembers(tenantId: string, channelId: string, userId: string): Promise<{ data: ChannelMemberType[] }> {
    await this.getChannelForTenant(tenantId, channelId, userId)
    const data = await this.chatRepo.findChannelMembers(channelId)
    return { data }
  }

  // Only the channel's creator or an Admin may delete it.
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

  // Self-service join is only for public channels. A private channel's
  // membership is invite-only (see addChannelMembers above) — without this
  // check any tenant user could add themselves to a private channel's
  // ChannelMember just by knowing/guessing its id, bypassing that entirely.
  async joinChannel(channelId: string, userId: string): Promise<{ message: string }> {
    const channel = await this.chatRepo.findChannelById(channelId)
    if (!channel) throw AppException.notFound(ChatErrorCode.CHANNEL_NOT_FOUND, 'Channel not found')

    if (channel.isPrivate) {
      throw AppException.forbidden(
        ChatErrorCode.FORBIDDEN_PRIVATE_CHANNEL_ACCESS,
        'You are not a member of this channel',
      )
    }

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
    await this.getChannelForTenant(tenantId, channelId, senderId)

    const message = toMessageResponse(await this.chatRepo.createMessage(channelId, senderId, content))
    this.eventEmitter.emit(MESSAGE_CREATED_EVENT, message)
    return message
  }

  async getMessages(
    tenantId: string,
    channelId: string,
    userId: string,
    query: GetMessagesQueryType,
  ): Promise<GetMessagesPaginatedResType> {
    await this.getChannelForTenant(tenantId, channelId, userId)

    const { data, total } = await this.chatRepo.findMessages(channelId, query)
    return { data: data.map(toMessageResponse), total, page: query.page, limit: query.limit }
  }

  // PATCH /chat/channels/:id/messages/:messageId — `content` arrives trimmed
  // and non-empty (UpdateMessageBodySchema).
  async updateMessage(
    tenantId: string,
    channelId: string,
    messageId: string,
    userId: string,
    content: string,
  ): Promise<MessageBaseType> {
    const message = await this.findOwnMessage(tenantId, channelId, messageId, userId)
    this.assertEditable(message)
    if (message.content === content) return toMessageResponse(message)

    const count = await this.chatRepo.updateMessageContent({
      tenantId,
      channelId,
      messageId,
      senderId: userId,
      content,
      editedAt: new Date(),
      editableSince: this.editableSince(),
    })
    if (count === 0) {
      // Lost a race (deleted, or the window closed, in between): re-check
      // to report the right error instead of writing over it.
      this.assertEditable(await this.reloadMessage(tenantId, channelId, messageId))
      throw AppException.notFound(ChatErrorCode.MESSAGE_NOT_FOUND, 'Message not found')
    }

    const response = toMessageResponse(await this.reloadMessage(tenantId, channelId, messageId))
    this.eventEmitter.emit(MESSAGE_UPDATED_EVENT, response)
    return response
  }

  // DELETE /chat/channels/:id/messages/:messageId — soft delete, idempotent.
  async deleteMessage(
    tenantId: string,
    channelId: string,
    messageId: string,
    userId: string,
  ): Promise<MessageBaseType> {
    const message = await this.findOwnMessage(tenantId, channelId, messageId, userId)
    if (message.deletedAt) return toMessageResponse(message)
    this.assertWithinEditWindow(message)

    const deletedAt = new Date()
    const removedAttachments = await this.chatRepo.softDeleteMessage({
      tenantId,
      channelId,
      messageId,
      senderId: userId,
      deletedAt,
      editableSince: this.editableSince(),
    })
    if (removedAttachments === null) {
      // Lost a race: a concurrent delete already won (idempotent 200, no
      // event), otherwise the window closed or the message is gone.
      const current = await this.reloadMessage(tenantId, channelId, messageId)
      if (current.deletedAt) return toMessageResponse(current)
      this.assertWithinEditWindow(current)
      throw AppException.notFound(ChatErrorCode.MESSAGE_NOT_FOUND, 'Message not found')
    }

    this.eventEmitter.emit(MESSAGE_DELETED_EVENT, {
      tenantId,
      channelId,
      messageId,
      deletedAt,
    } satisfies MessageDeletedEventPayload)

    // After the commit, never inside the transaction: a Cloudinary outage must
    // not fail or roll back the delete. A leftover file is only logged.
    await this.destroyAttachmentFiles(messageId, removedAttachments)

    return toMessageResponse(await this.reloadMessage(tenantId, channelId, messageId))
  }

  // Shared edit/delete preconditions, in order: the caller can access the
  // channel (same check as sending, incl. private-channel membership), the
  // message exists in this channel and tenant, and the caller is its author.
  private async findOwnMessage(
    tenantId: string,
    channelId: string,
    messageId: string,
    userId: string,
  ): Promise<MessageBaseType> {
    await this.getChannelForTenant(tenantId, channelId, userId, {
      notFound: ChatErrorCode.MESSAGE_NOT_FOUND,
      forbidden: ChatErrorCode.MESSAGE_FORBIDDEN,
    })
    const message = await this.chatRepo.findMessageInChannel(tenantId, channelId, messageId)
    if (!message) throw AppException.notFound(ChatErrorCode.MESSAGE_NOT_FOUND, 'Message not found')
    if (message.senderId !== userId) {
      throw AppException.forbidden(ChatErrorCode.MESSAGE_FORBIDDEN, 'Only the author can change this message')
    }
    return message
  }

  // Best-effort Cloudinary cleanup: failures are logged, never thrown.
  private async destroyAttachmentFiles(
    messageId: string,
    attachments: { publicId: string; mimeType: string }[],
  ): Promise<void> {
    await Promise.all(
      attachments.map(({ publicId, mimeType }) =>
        this.cloudinary.destroyChatAttachment(publicId, mimeType).catch((error: unknown) => {
          log.warn({
            event: 'chat.attachment_cleanup_failed',
            messageId,
            publicId,
            err: error instanceof Error ? error.message : 'unknown error',
          })
        }),
      ),
    )
  }

  // Re-read after a write (or a lost race); access and authorship were
  // already checked by findOwnMessage and can't change in between.
  private async reloadMessage(tenantId: string, channelId: string, messageId: string): Promise<MessageBaseType> {
    const message = await this.chatRepo.findMessageInChannel(tenantId, channelId, messageId)
    if (!message) throw AppException.notFound(ChatErrorCode.MESSAGE_NOT_FOUND, 'Message not found')
    return message
  }

  private assertEditable(message: MessageBaseType): void {
    if (message.deletedAt) throw AppException.notFound(ChatErrorCode.MESSAGE_NOT_FOUND, 'Message not found')
    this.assertWithinEditWindow(message)
    if (!message.content.trim()) {
      throw AppException.badRequest(ChatErrorCode.MESSAGE_NOT_EDITABLE, 'A message without text cannot be edited')
    }
  }

  private assertWithinEditWindow(message: MessageBaseType): void {
    if (new Date(message.createdAt) < this.editableSince()) {
      throw AppException.badRequest(
        ChatErrorCode.MESSAGE_EDIT_EXPIRED,
        'Messages can only be changed within 24 hours of sending',
      )
    }
  }

  private editableSince(): Date {
    return new Date(Date.now() - MESSAGE_EDIT_WINDOW_MS)
  }

  // Attachments always ride on an already-created message (WS has no
  // multipart support, so a message's text and its files never arrive in the
  // same call) — see chat.model.ts's CreateMessageBodySchema for why text is
  // still required to create a message in the first place.
  async uploadAttachments(
    messageId: string,
    tenantId: string,
    userId: string,
    files: Express.Multer.File[] | undefined,
  ): Promise<MessageBaseType> {
    const message = await this.chatRepo.findMessageById(messageId)
    // Message.tenantId is set on creation from the same CLS-scoped tenantId
    // as the channel it belongs to (see chat.repo.ts createMessage), so
    // comparing it directly is equivalent to — and simpler than — re-loading
    // the parent channel just to check channel.tenantId.
    if (!message || message.tenantId !== tenantId || message.deletedAt) {
      throw AppException.notFound(ChatErrorCode.MESSAGE_NOT_FOUND, 'Message not found')
    }
    // Same rules as editing: the caller can access the message's channel
    // (private: members only), is its author, and is within the edit window.
    // All checked before any file is validated or sent to Cloudinary.
    await this.getChannelForTenant(tenantId, message.channelId, userId, {
      notFound: ChatErrorCode.MESSAGE_NOT_FOUND,
      forbidden: ChatErrorCode.FORBIDDEN_PRIVATE_CHANNEL_ACCESS,
    })
    if (message.senderId !== userId) {
      throw AppException.forbidden(ChatErrorCode.MESSAGE_FORBIDDEN, 'Only the author can change this message')
    }
    this.assertWithinEditWindow(message)

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

    // The upload takes seconds, during which the author may have deleted the
    // message. Re-check before inserting rows; if it is gone, drop the files
    // we just uploaded. A delete landing between this check and the insert
    // is still possible (rows would hang off a deleted message, hidden by
    // toMessageResponse) — accepted, the window is a single query wide.
    const current = await this.chatRepo.findMessageById(messageId)
    if (!current || current.deletedAt) {
      await this.destroyAttachmentFiles(
        messageId,
        uploaded.map(({ publicId }, index) => ({ publicId, mimeType: files[index].mimetype })),
      )
      throw AppException.notFound(ChatErrorCode.MESSAGE_NOT_FOUND, 'Message not found')
    }

    const attachmentRows = uploaded.map(({ url, publicId }, index) => ({
      url,
      publicId,
      fileName: decodeMulterFileName(files[index].originalname),
      mimeType: files[index].mimetype,
    }))

    const updated = toMessageResponse(await this.chatRepo.addAttachments(messageId, attachmentRows))
    // Reuses the message-created broadcast so connected clients see the
    // attachments appear on the existing message in real time, without a
    // separate socket event/gateway change.
    this.eventEmitter.emit(MESSAGE_CREATED_EVENT, updated)
    return updated
  }
}
