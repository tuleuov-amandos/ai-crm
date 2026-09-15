import { z } from "zod";

export const GetMyTasksQuerySchema = z.object({
  page: z.number().int().min(1).optional(),
  limit: z.number().int().min(1).max(100).optional(),
  sort: z.enum(["dueDate_asc", "dueDate_desc"]).optional(),
  done: z.boolean().optional(),
});

export type GetMyTasksQueryType = z.infer<typeof GetMyTasksQuerySchema>;

export const MyTaskItemSchema = z.object({
  id: z.string(),
  title: z.string(),
  done: z.boolean(),
  dueDate: z.coerce.date().nullable(),
  createdAt: z.coerce.date(),
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
});

export type MyTaskItem = z.infer<typeof MyTaskItemSchema>;

export const GetMyTasksResSchema = z.object({
  data: z.array(MyTaskItemSchema),
  total: z.number().int().nonnegative(),
  page: z.number().int().positive(),
  limit: z.number().int().positive(),
});

export type GetMyTasksResType = z.infer<typeof GetMyTasksResSchema>;
