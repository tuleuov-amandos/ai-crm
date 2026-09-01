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
