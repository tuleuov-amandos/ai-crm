import { createZodDto } from 'nestjs-zod'
import {
  CreateChannelBodySchema,
  ChannelResSchema,
  GetChannelsResSchema,
  CreateMessageBodySchema,
  MessageResSchema,
  GetMessagesQuerySchema,
  GetMessagesPaginatedResSchema,
} from './chat.model'

export class CreateChannelBodyDto extends createZodDto(CreateChannelBodySchema) {}

export class ChannelResDto extends createZodDto(ChannelResSchema) {}

export class GetChannelsResDto extends createZodDto(GetChannelsResSchema) {}

export class CreateMessageBodyDto extends createZodDto(CreateMessageBodySchema) {}

export class MessageResDto extends createZodDto(MessageResSchema) {}

export class GetMessagesQueryDto extends createZodDto(GetMessagesQuerySchema) {}

export class GetMessagesPaginatedResDto extends createZodDto(GetMessagesPaginatedResSchema) {}
