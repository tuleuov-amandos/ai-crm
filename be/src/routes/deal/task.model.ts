import { z } from 'zod'
import { zIsoDatetime } from 'src/common/utils/zod.util'
import { ValidationErrorCode } from 'src/common/errors'

export const TaskBaseSchema = z.object({
  id: z.string(),
  tenantId: z.string(),
  dealId: z.string(),
  title: z.string().min(1).max(200),
  done: z.boolean().default(false),
  dueDate: zIsoDatetime.nullable().optional(),
  createdAt: zIsoDatetime,
})

// CREATE
export const CreateTaskBodySchema = TaskBaseSchema.pick({
  title: true,
})
  .extend({
    dueDate: zIsoDatetime.nullable().optional(),
  })
  .strict()

// CREATE BULK
export const CreateTasksBulkBodySchema = z
  .object({
    tasks: z.array(CreateTaskBodySchema),
  })
  .strict()

// UPDATE
export const UpdateTaskBodySchema = z
  .object({
    title: z.string().min(1).max(200).optional(),
    done: z.boolean().optional(),
    dueDate: zIsoDatetime.nullable().optional(),
  })
  .strict()
  .refine((data) => Object.keys(data).length > 0, {
    message: ValidationErrorCode.AT_LEAST_ONE_FIELD,
  })

// RESPONSES
export const TaskResSchema = TaskBaseSchema

export type CreateTaskBodyType = z.infer<typeof CreateTaskBodySchema>
export type CreateTasksBulkBodyType = z.infer<typeof CreateTasksBulkBodySchema>
export type UpdateTaskBodyType = z.infer<typeof UpdateTaskBodySchema>
export type TaskResType = z.infer<typeof TaskResSchema>
