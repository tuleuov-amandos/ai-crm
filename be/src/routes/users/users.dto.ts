import { createZodDto } from 'nestjs-zod'
import z from 'zod'

export const UpdateUserSchema = z
  .object({
    name: z.string().min(1).optional(),
    role: z.string().optional(),
  })
  .strict()

export class UpdateUserDto extends createZodDto(UpdateUserSchema) {}
export type UpdateUserType = z.infer<typeof UpdateUserSchema>

// Self-service profile update (PATCH /users/me). Only the current user's own
// display name is editable here; email is bound to the auth identity and the
// role is managed by admins via PATCH /users/:id. Avatar has its own
// multipart endpoint.
export const UpdateMeSchema = z
  .object({
    name: z.string().trim().min(2).max(80),
  })
  .strict()

export class UpdateMeDto extends createZodDto(UpdateMeSchema) {}
export type UpdateMeType = z.infer<typeof UpdateMeSchema>
