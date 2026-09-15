import { z } from 'zod'
import { zDate } from 'src/common/utils/zod.util'

// ─── GET /tasks/mine ───────────────────────────────────────────────────────
export const GetMyTasksQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  sort: z.enum(['dueDate_asc', 'dueDate_desc']).default('dueDate_asc'),
  done: z.coerce.boolean().optional(),
})
export type GetMyTasksQueryType = z.infer<typeof GetMyTasksQuerySchema>

export const MyTaskItemSchema = z.object({
  id: z.string(),
  title: z.string(),
  done: z.boolean(),
  dueDate: zDate.nullable(),
  createdAt: zDate,
  deal: z.object({
    id: z.string(),
    title: z.string(),
    contact: z
      .object({
        id: z.string(),
        name: z.string(),
      })
      .nullable(),
  }),
})

export const GetMyTasksResSchema = z.object({
  data: z.array(MyTaskItemSchema),
  total: z.number().int().nonnegative(),
  page: z.number().int().positive(),
  limit: z.number().int().positive(),
})

export type GetMyTasksResType = z.infer<typeof GetMyTasksResSchema>
