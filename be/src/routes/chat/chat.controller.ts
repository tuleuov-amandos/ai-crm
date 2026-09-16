import { Body, Controller, Delete, Get, Param, Post, Query, UseGuards } from '@nestjs/common'
import { ApiTags, ApiOkResponse } from '@nestjs/swagger'
import { ZodSerializerDto } from 'nestjs-zod'
import { JwtAuthGuard } from 'src/common/guards/jwt-auth.guard'
import { TenantStatusGuard } from 'src/common/guards/tenant-status.guard'
import { CurrentUser } from 'src/common/decorators/current-user.decorator'
import { AccessTokenPayload } from 'src/common/types/jwt.type'
import { MessageDto } from 'src/common/dto/message.dto'
import { ChatService } from './chat.service'
import {
  ChannelResDto,
  CreateChannelBodyDto,
  CreateMessageBodyDto,
  GetChannelsResDto,
  GetMessagesPaginatedResDto,
  GetMessagesQueryDto,
  MessageResDto,
} from './chat.dto'

// All roles are equal in chat (channels are created/removed by their own
// users, Slack-style, and every channel is visible tenant-wide — there is no
// per-channel read access control), so no @Roles guard here. The one
// exception is DELETE /chat/channels/:id, gated in ChatService to the
// channel's creator or an Admin.
@ApiTags('Chat')
@Controller('chat/channels')
@UseGuards(JwtAuthGuard, TenantStatusGuard)
export class ChatController {
  constructor(private readonly chatService: ChatService) {}

  // GET /chat/channels
  @Get()
  @ApiOkResponse({ type: GetChannelsResDto })
  @ZodSerializerDto(GetChannelsResDto)
  listChannels() {
    return this.chatService.listChannels()
  }

  // POST /chat/channels
  @Post()
  @ApiOkResponse({ type: ChannelResDto })
  @ZodSerializerDto(ChannelResDto)
  createChannel(@CurrentUser() user: AccessTokenPayload, @Body() body: CreateChannelBodyDto) {
    return this.chatService.createChannel(user.userId, body.name)
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

  // GET /chat/channels/:id/messages?page=&limit=
  @Get(':id/messages')
  @ApiOkResponse({ type: GetMessagesPaginatedResDto })
  @ZodSerializerDto(GetMessagesPaginatedResDto)
  getMessages(
    @CurrentUser() user: AccessTokenPayload,
    @Param('id') channelId: string,
    @Query() query: GetMessagesQueryDto,
  ) {
    return this.chatService.getMessages(user.tenantId, channelId, query)
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
