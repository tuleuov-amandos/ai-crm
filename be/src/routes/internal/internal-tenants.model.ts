import z from 'zod'

export const UpdateTenantStatusSchema = z
  .object({
    status: z.enum(['ACTIVE', 'SUSPENDED', 'PENDING']),
  })
  .strict()

export type UpdateTenantStatusType = z.infer<typeof UpdateTenantStatusSchema>
