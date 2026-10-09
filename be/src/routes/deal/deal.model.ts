import { z } from 'zod'
import { zIsoDatetime, zDate } from 'src/common/utils/zod.util'
import { ValidationErrorCode } from 'src/common/errors'
import { PipelineStageSchema } from '../pipeline-stages/pipeline-stages.model'

// export const DealStageEnum = z.enum(['PROSPECT', 'QUALIFIED', 'PROPOSAL', 'CLOSED_WON', 'CLOSED_LOST'])

export const DealStageConst = {
  PROSPECT: 'PROSPECT',
  QUALIFIED: 'QUALIFIED',
  PROPOSAL: 'PROPOSAL',
  CLOSED_WON: 'CLOSED_WON',
  CLOSED_LOST: 'CLOSED_LOST',
} as const

export type DealStageType = (typeof DealStageConst)[keyof typeof DealStageConst]

export const DealBaseSchema = z.object({
  id: z.string(),
  contactId: z.string(),
  tenantId: z.string(),
  ownerId: z.string(),
  title: z.string().min(1).max(200),
  value: z.coerce.number().nonnegative().default(0),
  stage: z.enum([
    DealStageConst.PROSPECT,
    DealStageConst.QUALIFIED,
    DealStageConst.PROPOSAL,
    DealStageConst.CLOSED_WON,
    DealStageConst.CLOSED_LOST,
  ]),
  isPaid: z.boolean().default(false),
  closeDate: zDate.nullable(),
  note: z.string().nullable(),
  createdAt: zDate,
  updatedAt: zDate,
  deletedAt: zDate.nullable(),
})
// ─────────────────────────────────────────
// CREATE — POST /deals
// ─────────────────────────────────────────
export const CreateDealBodySchema = DealBaseSchema.pick({
  contactId: true,
  // tenantId: true,
  ownerId: true,
  title: true,
  value: true,
  // stage: true,
  note: true,
})
  .extend({
    closeDate: zIsoDatetime.nullable().optional(),
    stage: z
      .enum([
        DealStageConst.PROSPECT,
        DealStageConst.QUALIFIED,
        DealStageConst.PROPOSAL,
        DealStageConst.CLOSED_WON,
        DealStageConst.CLOSED_LOST,
      ])
      .optional(),
    // New format: a PipelineStage id of the tenant. Pass stage or stageId, not
    // both; with neither the deal goes into the first open stage.
    stageId: z.string().optional(),
  })
  .strict()

export const CreateDealResSchema = DealBaseSchema.omit({ deletedAt: true }).extend({
  stageId: z.string().nullable(),
})

export type CreateDealBodyType = z.infer<typeof CreateDealBodySchema>
export type CreateDealResType = z.infer<typeof CreateDealResSchema>

// ─────────────────────────────────────────
// UPDATE — PATCH /deals/:id
// ─────────────────────────────────────────

export const UpdateDealBodySchema = z
  .object({
    title: z.string().min(1).max(200).optional(),
    ownerId: z.string().optional(),
    value: z.coerce.number().nonnegative().optional(),
    closeDate: zIsoDatetime.nullable().optional(),
    note: z.string().nullable().optional(),
  })
  .strict()
  .refine((data) => Object.keys(data).length > 0, { message: ValidationErrorCode.AT_LEAST_ONE_FIELD })

export const UpdateDealResSchema = CreateDealResSchema

export type UpdateDealBodyType = z.infer<typeof UpdateDealBodySchema>
export type UpdateDealResType = z.infer<typeof UpdateDealResSchema>

// ─────────────────────────────────────────
// UPDATE STAGE — PATCH /deals/:id/stage
// ─────────────────────────────────────────
// Exactly one of stage (legacy DealStage value) or stageId (PipelineStage id).
// Values are checked in DealService so an unknown stage or a stageId of another
// tenant keeps answering 422 DEAL_INVALID_STAGE, as before this DTO existed.
export const UpdateDealStageBodySchema = z.object({
  stage: z.string().optional(),
  stageId: z.string().optional(),
})

export type UpdateDealStageBodyType = z.infer<typeof UpdateDealStageBodySchema>
export type UpdateDealStageResType = UpdateDealResType

// ─────────────────────────────────────────
// UPDATE PAYMENT STATUS — PATCH /deals/:id/payment-status
// ─────────────────────────────────────────
export const UpdateDealPaymentStatusBodySchema = z
  .object({
    isPaid: z.boolean(),
  })
  .strict()

export type UpdateDealPaymentStatusBodyType = z.infer<typeof UpdateDealPaymentStatusBodySchema>
export type UpdateDealPaymentStatusResType = UpdateDealResType

// ─────────────────────────────────────────
// GET ONE — GET /deals/:id
// ─────────────────────────────────────────
export const GetDealResSchema = DealBaseSchema.omit({ deletedAt: true }).extend({
  stageId: z.string().nullable(),
  archivedAt: zDate.nullable(),
  contact: z.object({
    id: z.string(),
    name: z.string(),
    email: z.string().nullable(),
    phone: z.string().nullable(),
    company: z.string().nullable(),
    position: z.string().nullable(),
    city: z.string().nullable(),
  }),
  owner: z.object({
    id: z.string(),
    name: z.string(),
    email: z.string(),
  }),
  tasks: z.array(
    z.object({
      id: z.string(),
      title: z.string(),
      done: z.boolean(),
      dueDate: zDate.nullable(),
      createdAt: zDate,
      assigneeId: z.string().nullable(),
      assignee: z
        .object({
          id: z.string(),
          name: z.string(),
          email: z.string(),
        })
        .nullable(),
    }),
  ),
  activities: z.array(
    z.object({
      id: z.string(),
      type: z.string(),
      title: z.string().nullable(),
      note: z.string().nullable(),
      date: zDate,
    }),
  ),
  aiSuggestions: z.array(
    z.object({
      id: z.string(),
      type: z.string(),
      content: z.string(),
      createdAt: zDate,
    }),
  ),
})

export type GetDealResType = z.infer<typeof GetDealResSchema>

// ─────────────────────────────────────────
// PIPELINE — GET /deals/pipeline
// ─────────────────────────────────────────
export const DealCardSchema = DealBaseSchema.omit({ deletedAt: true }).extend({
  contact: z.object({
    id: z.string(),
    name: z.string(),
    company: z.string().nullable(),
  }),
  owner: z.object({
    id: z.string(),
    name: z.string(),
  }),
})
export type DealCardRes = z.infer<typeof DealCardSchema>

export const GetDealsPipelineResSchema = z.object({
  PROSPECT: z.array(DealCardSchema),
  QUALIFIED: z.array(DealCardSchema),
  PROPOSAL: z.array(DealCardSchema),
  CLOSED_WON: z.array(DealCardSchema),
  CLOSED_LOST: z.array(DealCardSchema),
})

export type GetDealsPipelineResType = z.infer<typeof GetDealsPipelineResSchema>

export const GetPipelineQuerySchema = z.object({
  ownerId: z.string().optional(),
  dateFrom: z.string().optional(),
  dateTo: z.string().optional(),
  search: z.string().optional(),
  isPaid: z.enum(['true', 'false']).optional(),
})
export type GetPipelineQueryType = z.infer<typeof GetPipelineQuerySchema>

// ─────────────────────────────────────────
// BOARD — GET /deals/board (query of /deals/pipeline + includeArchived)
// ─────────────────────────────────────────
// Columns are the tenant's pipeline stages in order. Archived deals are left
// out unless includeArchived=true.
export const GetBoardQuerySchema = GetPipelineQuerySchema.extend({
  includeArchived: z.enum(['true', 'false']).optional(),
})
export type GetBoardQueryType = z.infer<typeof GetBoardQuerySchema>

export const BoardDealCardSchema = DealCardSchema.extend({
  // Delivery address lives in the contact's "address" field; the mobile card shows it and a call button.
  contact: DealCardSchema.shape.contact.extend({
    phone: z.string().nullable(),
    address: z.string().nullable(),
    city: z.string().nullable(),
  }),
  stageId: z.string().nullable(),
  archivedAt: zDate.nullable(),
})
export type BoardDealCardRes = z.infer<typeof BoardDealCardSchema>

export const BoardColumnStageSchema = PipelineStageSchema.pick({
  id: true,
  name: true,
  color: true,
  order: true,
  kind: true,
  probability: true,
})

export const GetDealsBoardResSchema = z.array(
  z.object({
    stage: BoardColumnStageSchema,
    deals: z.array(BoardDealCardSchema),
  }),
)
export type GetDealsBoardResType = z.infer<typeof GetDealsBoardResSchema>

// ─────────────────────────────────────────
// ARCHIVE — POST /deals/archive, POST /deals/unarchive
// ─────────────────────────────────────────
// Ids the user may not change (other tenant, unknown, deleted, not owned when
// limited to own deals) or already in the target state are skipped silently.
export const ArchiveDealsBodySchema = z
  .object({
    dealIds: z.array(z.string().min(1)).min(1).max(200),
  })
  .strict()

export const ArchiveDealsResSchema = z.object({
  updated: z.number().int().nonnegative(),
})

export type ArchiveDealsBodyType = z.infer<typeof ArchiveDealsBodySchema>
export type ArchiveDealsResType = z.infer<typeof ArchiveDealsResSchema>

// ─────────────────────────────────────────
// ANALYZE — POST /deals/:id/analyze
// ─────────────────────────────────────────
export const AnalyzeDealBodySchema = z
  .object({
    meetingNote: z.string().min(10).max(10000),
  })
  .strict()

export const AnalyzeDealResSchema = z
  .object({
    jobId: z.string(),
  })
  .strict()

export type AnalyzeDealBodyType = z.infer<typeof AnalyzeDealBodySchema>
export type AnalyzeDealResType = z.infer<typeof AnalyzeDealResSchema>
