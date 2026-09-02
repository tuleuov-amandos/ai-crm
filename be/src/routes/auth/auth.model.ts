import { ROLE } from 'src/common/constants/role.constanst'
import z from 'zod'
import { zDate } from 'src/common/utils/zod.util'
import { ValidationErrorCode } from 'src/common/errors'

export const UserBaseSchema = z.object({
  id: z.string(),
  tenantId: z.string(),
  email: z.string(),
  name: z.string(),
  role: z.enum([ROLE.ADMIN, ROLE.MANAGER, ROLE.SALES_REP]),
  createdAt: zDate,
  updatedAt: zDate,
})

export type UserType = z.infer<typeof UserBaseSchema>

// This schema is used to validate response data upon successful registration, excluding password

export const UserWithPasswordSchema = UserBaseSchema.extend({
  password: z.string(),
})

export const RegisterBodySchema = UserWithPasswordSchema.pick({
  email: true,
  password: true,
  name: true,
})
  .extend({
    confirmPassword: z.string(),
    companyName: z.string(),
  })
  .strict()
  .superRefine(({ password, confirmPassword }, ctx) => {
    if (password !== confirmPassword) {
      ctx.addIssue({
        code: 'custom',
        message: ValidationErrorCode.PASSWORD_MISMATCH,
      })
    }
  })

export type RegisterBodyType = z.infer<typeof RegisterBodySchema>

export const RegisterResSchema = UserBaseSchema

export type RegisterResType = z.infer<typeof RegisterResSchema>

export const LoginBodySchema = UserWithPasswordSchema.pick({
  email: true,
  password: true,
}).strict()

export type LoginBodyType = z.infer<typeof LoginBodySchema>

export const LoginResSchema = z.object({
  refreshToken: z.string(),
  accessToken: z.string(),
})

export type LoginResType = z.infer<typeof LoginResSchema>

// Password policy for user-set passwords: min 8 chars, at least one lowercase,
// one uppercase, one digit and one special character. Mirrors the frontend
// rule in `fe/src/lib/validations/auth.schema.ts`.
export const PASSWORD_COMPLEXITY_REGEX = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])/

export const ChangePasswordBodySchema = z
  .object({
    currentPassword: z.string().min(1),
    newPassword: z.string().min(8).regex(PASSWORD_COMPLEXITY_REGEX),
    confirmPassword: z.string().min(1),
  })
  .strict()
  .superRefine(({ newPassword, confirmPassword }, ctx) => {
    if (newPassword !== confirmPassword) {
      ctx.addIssue({
        code: 'custom',
        message: ValidationErrorCode.PASSWORD_MISMATCH,
        path: ['confirmPassword'],
      })
    }
  })

export type ChangePasswordBodyType = z.infer<typeof ChangePasswordBodySchema>

export const RefreshTokenSchema = z.object({
  token: z.string(),
  userId: z.string(),
  // tenantId: z.string(),
  // expireAt: z.date()
})

export const RefreshTokenBodySchema = z
  .object({
    refreshToken: z.string(),
  })
  .strict()

export const RefreshTokenResSchema = LoginResSchema

export type RefreshTokenType = z.infer<typeof RefreshTokenSchema>
export type RefreshTokenBodyType = z.infer<typeof RefreshTokenBodySchema>
export type RefreshTokenResType = z.infer<typeof RefreshTokenResSchema>
