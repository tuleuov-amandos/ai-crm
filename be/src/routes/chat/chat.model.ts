import { z } from 'zod'
import { zIsoDatetime } from 'src/common/utils/zod.util'

// ─── CHANNEL ───────────────────────────────────────────────────────────────

export const ChannelBaseSchema = z.object({
  id: z.string(),
  tenantId: z.string(),
  name: z.string(),
  createdById: z.string(),
  createdAt: zIsoDatetime,
  createdBy: z.object({
    id: z.string(),
    name: z.string(),
  }),
})

export type ChannelBaseType = z.infer<typeof ChannelBaseSchema>

// POST /chat/channels
export const CreateChannelBodySchema = z
  .object({
    name: z.string().min(1).max(80),
  })
  .strict()

export type CreateChannelBodyType = z.infer<typeof CreateChannelBodySchema>

export const ChannelResSchema = ChannelBaseSchema

export const GetChannelsResSchema = z.object({
  data: z.array(ChannelBaseSchema),
})

export type GetChannelsResType = z.infer<typeof GetChannelsResSchema>

// ─── MESSAGE ───────────────────────────────────────────────────────────────

export const MessageBaseSchema = z.object({
  id: z.string(),
  channelId: z.string(),
  tenantId: z.string(),
  senderId: z.string(),
  content: z.string(),
  createdAt: zIsoDatetime,
  editedAt: zIsoDatetime.nullable(),
  sender: z.object({
    id: z.string(),
    name: z.string(),
    avatarUrl: z.string().nullable(),
  }),
})

export type MessageBaseType = z.infer<typeof MessageBaseSchema>

// POST /chat/channels/:id/messages
export const CreateMessageBodySchema = z
  .object({
    content: z.string().min(1).max(5000),
  })
  .strict()

export type CreateMessageBodyType = z.infer<typeof CreateMessageBodySchema>

export const MessageResSchema = MessageBaseSchema

// GET /chat/channels/:id/messages?page=&limit=
// Newest first (DESC by createdAt), same pagination shape as GetActivitiesQuerySchema.
export const GetMessagesQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(30),
})

export type GetMessagesQueryType = z.infer<typeof GetMessagesQuerySchema>

export const GetMessagesPaginatedResSchema = z.object({
  data: z.array(MessageBaseSchema),
  total: z.number().int().nonnegative(),
  page: z.number().int().positive(),
  limit: z.number().int().positive(),
})

export type GetMessagesPaginatedResType = z.infer<typeof GetMessagesPaginatedResSchema>
