import z from 'zod'
import { zDate } from 'src/common/utils/zod.util'
import { UpdateTenantStatusSchema } from 'src/routes/internal/internal-tenants.model'

export const LoginBodySchema = z
  .object({
    email: z.string().email(),
    password: z.string().min(1),
  })
  .strict()

export type LoginBodyType = z.infer<typeof LoginBodySchema>

export const LoginResSchema = z.object({
  message: z.string(),
})

export type LoginResType = z.infer<typeof LoginResSchema>

export const TenantListItemSchema = z.object({
  id: z.string(),
  name: z.string(),
  slug: z.string(),
  plan: z.string(),
  status: z.string(),
  createdAt: zDate,
  adminName: z.string().nullable(),
  adminEmail: z.string().nullable(),
  userCount: z.number(),
  contactCount: z.number(),
  dealCount: z.number(),
})

export type TenantListItemType = z.infer<typeof TenantListItemSchema>

export const TenantUserSchema = z.object({
  id: z.string(),
  name: z.string(),
  email: z.string(),
  roleName: z.string(),
  createdAt: zDate,
})

export type TenantUserType = z.infer<typeof TenantUserSchema>

export const TenantDetailSchema = TenantListItemSchema.extend({
  users: z.array(TenantUserSchema),
})

export type TenantDetailType = z.infer<typeof TenantDetailSchema>

// Reused from the (soon to be retired) internal-tenants module instead of
// duplicating the same status enum.
export { UpdateTenantStatusSchema }
export type UpdateTenantStatusType = z.infer<typeof UpdateTenantStatusSchema>

export const MeResSchema = z.object({
  id: z.string(),
  email: z.string(),
  name: z.string(),
})

export type MeResType = z.infer<typeof MeResSchema>
