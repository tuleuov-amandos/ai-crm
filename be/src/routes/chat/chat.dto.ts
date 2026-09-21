import { createZodDto } from 'nestjs-zod'
import {
  CreateChannelBodySchema,
  ChannelResSchema,
  GetChannelsResSchema,
  CreateMessageBodySchema,
  MessageResSchema,
  GetMessagesQuerySchema,
  GetMessagesPaginatedResSchema,
  AddChannelMembersBodySchema,
  GetChannelMembersResSchema,
} from './chat.model'

export class CreateChannelBodyDto extends createZodDto(CreateChannelBodySchema) {}

export class AddChannelMembersBodyDto extends createZodDto(AddChannelMembersBodySchema) {}

export class ChannelResDto extends createZodDto(ChannelResSchema) {}

export class GetChannelsResDto extends createZodDto(GetChannelsResSchema) {}

// GET /chat/channels/:id/members
export class GetChannelMembersResDto extends createZodDto(GetChannelMembersResSchema) {}

export class CreateMessageBodyDto extends createZodDto(CreateMessageBodySchema) {}

export class MessageResDto extends createZodDto(MessageResSchema) {}

export class GetMessagesQueryDto extends createZodDto(GetMessagesQuerySchema) {}

export class GetMessagesPaginatedResDto extends createZodDto(GetMessagesPaginatedResSchema) {}

// POST /chat/messages/:id/attachments — returns the message with its attachments.
export class UploadMessageAttachmentsResDto extends createZodDto(MessageResSchema) {}
