import { z } from "zod";

// Mirrors be/src/routes/chat/chat.model.ts. Dates come over the wire as ISO
// strings (backend's `zIsoDatetime`) — kept as `string` here, not
// `z.coerce.date()`, since nothing in this file's callers ever parses the
// schema at runtime and a `Date`-typed field would lie about the actual value.

// ─── CHANNEL ────────────────────────────────────────────────────────────────
export const ChannelSchema = z.object({
  id: z.string(),
  tenantId: z.string(),
  name: z.string(),
  createdById: z.string(),
  createdAt: z.string(),
  createdBy: z.object({
    id: z.string(),
    name: z.string(),
  }),
});

export type Channel = z.infer<typeof ChannelSchema>;

// POST /chat/channels
export const CreateChannelBodySchema = z
  .object({
    name: z.string().min(1).max(80),
  })
  .strict();

export type CreateChannelBodyType = z.infer<typeof CreateChannelBodySchema>;

// GET /chat/channels
export const GetChannelsResSchema = z.object({
  data: z.array(ChannelSchema),
});

export type GetChannelsResType = z.infer<typeof GetChannelsResSchema>;

// ─── MESSAGE ────────────────────────────────────────────────────────────────
export const MessageAttachmentSchema = z.object({
  id: z.string(),
  url: z.string(),
  fileName: z.string(),
  mimeType: z.string(),
  createdAt: z.string(),
});

export type MessageAttachment = z.infer<typeof MessageAttachmentSchema>;

export const MessageSchema = z.object({
  id: z.string(),
  channelId: z.string(),
  tenantId: z.string(),
  senderId: z.string(),
  content: z.string(),
  createdAt: z.string(),
  editedAt: z.string().nullable(),
  sender: z.object({
    id: z.string(),
    name: z.string(),
    avatarUrl: z.string().nullable(),
  }),
  attachments: z.array(MessageAttachmentSchema),
});

export type Message = z.infer<typeof MessageSchema>;

// POST /chat/channels/:id/messages
export const CreateMessageBodySchema = z
  .object({
    content: z.string().min(1).max(5000),
  })
  .strict();

export type CreateMessageBodyType = z.infer<typeof CreateMessageBodySchema>;

// GET /chat/channels/:id/messages?page=&limit= — newest first
export const GetMessagesParamsSchema = z.object({
  page: z.number().int().min(1).optional(),
  limit: z.number().int().min(1).max(100).optional(),
});

export type GetMessagesParamsType = z.infer<typeof GetMessagesParamsSchema>;

export const GetMessagesPaginatedResSchema = z.object({
  data: z.array(MessageSchema),
  total: z.number().int().nonnegative(),
  page: z.number().int().positive(),
  limit: z.number().int().positive(),
});

export type GetMessagesPaginatedResType = z.infer<
  typeof GetMessagesPaginatedResSchema
>;
