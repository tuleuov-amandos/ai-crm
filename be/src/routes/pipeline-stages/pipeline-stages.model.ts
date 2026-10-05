import { z } from 'zod'
import { ValidationErrorCode } from 'src/common/errors'

// Colors an open (custom or default) stage may use. The frontend maps each key
// to its palette. `green` and `red` are reserved for the WON and LOST stages
// and are rejected for open stages.
export const PIPELINE_STAGE_COLORS = ['blue', 'purple', 'orange', 'teal', 'pink', 'yellow', 'gray', 'indigo'] as const
export const PIPELINE_STAGE_RESERVED_COLORS = { WON: 'green', LOST: 'red' } as const

export const MIN_OPEN_STAGES = 1
export const MAX_OPEN_STAGES = 12
export const PIPELINE_STAGE_NAME_MAX = 50

export const PipelineStageKindConst = {
  OPEN: 'OPEN',
  WON: 'WON',
  LOST: 'LOST',
} as const

export const PipelineStageSchema = z.object({
  id: z.string(),
  name: z.string(),
  color: z.string(),
  order: z.number().int(),
  probability: z.number().int(),
  kind: z.enum([PipelineStageKindConst.OPEN, PipelineStageKindConst.WON, PipelineStageKindConst.LOST]),
  legacyKey: z.string().nullable(),
})
export type PipelineStageRes = z.infer<typeof PipelineStageSchema>

const stageName = z.string().trim().min(1).max(PIPELINE_STAGE_NAME_MAX)
const stageColor = z.enum(PIPELINE_STAGE_COLORS)
const openStageProbability = z.number().int().min(0).max(99)

// ─────────────────────────────────────────
// LIST — GET /pipeline-stages
// ─────────────────────────────────────────
// dealCount (deals without deletedAt) is only returned to ADMIN.
export const GetPipelineStagesResSchema = z.array(
  PipelineStageSchema.extend({ dealCount: z.number().int().optional() }),
)

// ─────────────────────────────────────────
// CREATE — POST /pipeline-stages
// ─────────────────────────────────────────
// Always creates an OPEN stage; kind and legacyKey are not accepted.
export const CreatePipelineStageBodySchema = z
  .object({
    name: stageName,
    color: stageColor,
    probability: openStageProbability,
  })
  .strict()
export type CreatePipelineStageBodyType = z.infer<typeof CreatePipelineStageBodySchema>

// ─────────────────────────────────────────
// UPDATE — PATCH /pipeline-stages/:id
// ─────────────────────────────────────────
// color and probability are rejected for WON/LOST stages by the service.
export const UpdatePipelineStageBodySchema = z
  .object({
    name: stageName.optional(),
    color: stageColor.optional(),
    probability: openStageProbability.optional(),
  })
  .strict()
  .refine((data) => Object.keys(data).length > 0, { message: ValidationErrorCode.AT_LEAST_ONE_FIELD })
export type UpdatePipelineStageBodyType = z.infer<typeof UpdatePipelineStageBodySchema>

// ─────────────────────────────────────────
// REORDER — PATCH /pipeline-stages/reorder
// ─────────────────────────────────────────
// The full list of the tenant's OPEN stage ids in the new order. WON and LOST
// always stay last and are not part of the list.
export const ReorderPipelineStagesBodySchema = z
  .object({
    stageIds: z.array(z.string().min(1)).min(MIN_OPEN_STAGES).max(MAX_OPEN_STAGES),
  })
  .strict()
export type ReorderPipelineStagesBodyType = z.infer<typeof ReorderPipelineStagesBodySchema>

// ─────────────────────────────────────────
// DELETE — DELETE /pipeline-stages/:id?targetStageId=...
// ─────────────────────────────────────────
// targetStageId is required when the stage still holds deals (soft-deleted
// ones included, the FK keeps them too).
export const DeletePipelineStageQuerySchema = z
  .object({
    targetStageId: z.string().min(1).optional(),
  })
  .strict()
export type DeletePipelineStageQueryType = z.infer<typeof DeletePipelineStageQuerySchema>
