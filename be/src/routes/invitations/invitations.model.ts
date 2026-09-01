import z from 'zod'
import { ValidationErrorCode } from 'src/common/errors'

export const CreateInvitationSchema = z
  .object({
    email: z.string().email(),
    role: z.string(),
  })
  .strict()

export type CreateInvitationType = z.infer<typeof CreateInvitationSchema>

export const AcceptInvitationSchema = z
  .object({
    token: z.string(),
    name: z.string().min(1),
    password: z.string().min(6),
    confirmPassword: z.string(),
  })
  .strict()
  .superRefine(({ password, confirmPassword }, ctx) => {
    if (password !== confirmPassword) {
      ctx.addIssue({
        code: 'custom',
        path: ['confirmPassword'],
        message: ValidationErrorCode.PASSWORD_MISMATCH,
      })
    }
  })

export type AcceptInvitationType = z.infer<typeof AcceptInvitationSchema>

export const UpdateInvitationSchema = z
  .object({
    email: z.string().email().optional(),
    role: z.string().optional(),
  })
  .strict()

export type UpdateInvitationType = z.infer<typeof UpdateInvitationSchema>
