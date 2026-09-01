import z from "zod";

// Сообщения валидации хранятся как ключи i18n (namespace `auth.validation`).
// Готовый текст резолвится на стороне компонента: `t(errors.<field>.message)`.
// Тот же паттерн, что и getPasswordStrength в register/page.tsx.
export const UserSchema = z.object({
  id: z.string(),
  tenantId: z.string(),
  email: z.string().regex(/^[^\s@]+@[^\s@]+\.[^\s@]+$/, "emailInvalid"),
  name: z.string().min(2, "nameMin").max(80, "nameMax"),
  role: z.enum(["ADMIN", "MANAGER", "SALES_REP"]),
  password: z.string().min(8, "passwordMin").regex(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])/,
    "passwordComplexity"
  ),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
})

// createdAt: z.coerce.date() auto convert string to date, if conversion fails it will throw validation error. Same for updatedAt
// updatedAt: z.coerce.date()

export type UserType = z.infer<typeof UserSchema>;

export const RegisterBodySchema = UserSchema.pick({
  email: true,
  password: true,
  name: true,
}).extend({
  confirmPassword: z.string().min(8, "confirmPasswordMin"),
  companyName: z.string().min(2, "companyNameMin").max(100, "companyNameMax"),
}).strict().superRefine(({ password, confirmPassword }, ctx) => {
  if (password !== confirmPassword) {
    ctx.addIssue({
      code: 'custom',
      message: 'passwordMismatch',
      path: ["confirmPassword"],
    })
  }
});

export type RegisterBodyType = z.infer<typeof RegisterBodySchema>;

export const RegisterResSchema = UserSchema.omit({
  password: true,
})

export type RegisterResType = z.infer<typeof RegisterResSchema>;

export const LoginBodySchema = UserSchema.pick({
  email: true,
  password: true,
}).strict();

export type LoginBodyType = z.infer<typeof LoginBodySchema>;

export const LoginResSchema = z.object({
  refreshToken: z.string(),
  accessToken: z.string(),
})

export type LoginResType = z.infer<typeof LoginResSchema>;

export const RefreshTokenSchema = z.object({
  token: z.string(),
  userId: z.string(),
  // tenantId: z.string(),
  // expireAt: z.date()
})


export const RefreshTokenBodySchema = z.object({
  refreshToken: z.string(),
}).strict();

export const RefreshTokenResSchema = LoginResSchema

export type RefreshTokenType = z.infer<typeof RefreshTokenSchema>
export type RefreshTokenBodyType = z.infer<typeof RefreshTokenBodySchema>;
export type RefreshTokenResType = z.infer<typeof RefreshTokenResSchema>;
