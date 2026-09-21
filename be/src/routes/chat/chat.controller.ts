import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
  UseInterceptors,
  UploadedFiles,
} from '@nestjs/common'
import { FilesInterceptor } from '@nestjs/platform-express'
import { ApiTags, ApiOkResponse, ApiConsumes } from '@nestjs/swagger'
import { ZodSerializerDto } from 'nestjs-zod'
import { JwtAuthGuard } from 'src/common/guards/jwt-auth.guard'
import { TenantStatusGuard } from 'src/common/guards/tenant-status.guard'
import { CurrentUser } from 'src/common/decorators/current-user.decorator'
import { AccessTokenPayload } from 'src/common/types/jwt.type'
import { MessageDto } from 'src/common/dto/message.dto'
import { ACTIVITY_ATTACHMENT_MAX_BYTES } from 'src/common/services/cloudinary.service'
import { ChatService, CHAT_ATTACHMENTS_MAX_COUNT } from './chat.service'
import {
  AddChannelMembersBodyDto,
  ChannelResDto,
  CreateChannelBodyDto,
  CreateMessageBodyDto,
  GetChannelMembersResDto,
  GetChannelsResDto,
  GetMessagesPaginatedResDto,
  GetMessagesQueryDto,
  MessageResDto,
  UploadMessageAttachmentsResDto,
} from './chat.dto'

// All roles are equal in chat for public channels (created/removed by their
// own users, Slack-style, visible tenant-wide, no per-channel read access
// control), so no @Roles guard here. Exceptions, all gated in ChatService:
// DELETE /chat/channels/:id (creator or Admin), creating a private channel
// (Admin only), POST /chat/channels/:id/members (creator or Admin), and
// reading/posting into a private channel at all (members only).
@ApiTags('Chat')
@Controller('chat/channels')
@UseGuards(JwtAuthGuard, TenantStatusGuard)
export class ChatController {
  constructor(private readonly chatService: ChatService) {}

  // GET /chat/channels
  @Get()
  @ApiOkResponse({ type: GetChannelsResDto })
  @ZodSerializerDto(GetChannelsResDto)
  listChannels(@CurrentUser() user: AccessTokenPayload) {
    return this.chatService.listChannels(user.tenantId, user.userId)
  }

  // POST /chat/channels
  @Post()
  @ApiOkResponse({ type: ChannelResDto })
  @ZodSerializerDto(ChannelResDto)
  createChannel(@CurrentUser() user: AccessTokenPayload, @Body() body: CreateChannelBodyDto) {
    return this.chatService.createChannel(user, body.name, body.isPrivate, body.memberIds ?? [])
  }

  // POST /chat/channels/:id/members
  @Post(':id/members')
  @ApiOkResponse({ type: MessageDto })
  @ZodSerializerDto(MessageDto)
  addChannelMembers(
    @CurrentUser() user: AccessTokenPayload,
    @Param('id') channelId: string,
    @Body() body: AddChannelMembersBodyDto,
  ) {
    return this.chatService.addChannelMembers(channelId, body.userIds, user)
  }

  // DELETE /chat/channels/:id
  @Delete(':id')
  @ApiOkResponse({ type: MessageDto })
  @ZodSerializerDto(MessageDto)
  deleteChannel(@CurrentUser() user: AccessTokenPayload, @Param('id') channelId: string) {
    return this.chatService.deleteChannel(channelId, user)
  }

  // POST /chat/channels/:id/join
  @Post(':id/join')
  @ApiOkResponse({ type: MessageDto })
  @ZodSerializerDto(MessageDto)
  joinChannel(@CurrentUser() user: AccessTokenPayload, @Param('id') channelId: string) {
    return this.chatService.joinChannel(channelId, user.userId)
  }

  // POST /chat/channels/:id/leave
  @Post(':id/leave')
  @ApiOkResponse({ type: MessageDto })
  @ZodSerializerDto(MessageDto)
  leaveChannel(@CurrentUser() user: AccessTokenPayload, @Param('id') channelId: string) {
    return this.chatService.leaveChannel(channelId, user.userId)
  }

  // POST /chat/channels/:id/read — marks the channel read for the current
  // user (ChannelMember.lastReadAt = now()), resetting its unreadCount to 0.
  @Post(':id/read')
  @ApiOkResponse({ type: MessageDto })
  @ZodSerializerDto(MessageDto)
  markChannelRead(@CurrentUser() user: AccessTokenPayload, @Param('id') channelId: string) {
    return this.chatService.markChannelRead(user.tenantId, channelId, user.userId)
  }

  // GET /chat/channels/:id/members — powers read receipts under own messages.
  @Get(':id/members')
  @ApiOkResponse({ type: GetChannelMembersResDto })
  @ZodSerializerDto(GetChannelMembersResDto)
  getChannelMembers(@CurrentUser() user: AccessTokenPayload, @Param('id') channelId: string) {
    return this.chatService.getChannelMembers(user.tenantId, channelId, user.userId)
  }

  // GET /chat/channels/:id/messages?page=&limit=
  @Get(':id/messages')
  @ApiOkResponse({ type: GetMessagesPaginatedResDto })
  @ZodSerializerDto(GetMessagesPaginatedResDto)
  getMessages(
    @CurrentUser() user: AccessTokenPayload,
    @Param('id') channelId: string,
    @Query() query: GetMessagesQueryDto,
  ) {
    return this.chatService.getMessages(user.tenantId, channelId, user.userId, query)
  }

  // POST /chat/channels/:id/messages
  @Post(':id/messages')
  @ApiOkResponse({ type: MessageResDto })
  @ZodSerializerDto(MessageResDto)
  createMessage(
    @CurrentUser() user: AccessTokenPayload,
    @Param('id') channelId: string,
    @Body() body: CreateMessageBodyDto,
  ) {
    return this.chatService.createMessage(user.tenantId, channelId, user.userId, body.content)
  }
}

// Attachments hang off a message id directly (a message already carries its
// own tenantId — see ChatService.uploadAttachments), so this sits on its own
// `chat/messages` path instead of nesting under `chat/channels/:id`.
@ApiTags('Chat')
@Controller('chat/messages')
@UseGuards(JwtAuthGuard, TenantStatusGuard)
export class ChatMessagesController {
  constructor(private readonly chatService: ChatService) {}

  // POST /chat/messages/:id/attachments — attach up to CHAT_ATTACHMENTS_MAX_COUNT
  // files (PDF/JPEG/PNG) to an existing message. Files always go through this
  // REST endpoint, never the WS gateway (multipart isn't representable over
  // Socket.io), regardless of how the message itself was created.
  @Post(':id/attachments')
  @ApiConsumes('multipart/form-data')
  @ApiOkResponse({ type: UploadMessageAttachmentsResDto })
  @ZodSerializerDto(UploadMessageAttachmentsResDto)
  @UseInterceptors(
    FilesInterceptor('files', CHAT_ATTACHMENTS_MAX_COUNT, {
      limits: { fileSize: ACTIVITY_ATTACHMENT_MAX_BYTES },
    }),
  )
  uploadAttachments(
    @CurrentUser() user: AccessTokenPayload,
    @Param('id') messageId: string,
    @UploadedFiles() files: Express.Multer.File[],
  ) {
    return this.chatService.uploadAttachments(messageId, user.tenantId, files)
  }
}
