import { z } from "zod";

// ─── Kind — mirror backend PipelineStageKind ─────────────────────────────────
export const PipelineStageKind = {
  OPEN: "OPEN",
  WON: "WON",
  LOST: "LOST",
} as const;

export type PipelineStageKind =
  (typeof PipelineStageKind)[keyof typeof PipelineStageKind];

// ─── Stage — GET /pipeline-stages ────────────────────────────────────────────
// color is a palette key (see lib/pipelineColors.ts). legacyKey is the old
// DealStage value of a default stage, null for a custom one. dealCount is only
// returned to ADMIN.
export const PipelineStageSchema = z.object({
  id: z.string(),
  name: z.string(),
  color: z.string(),
  order: z.number(),
  probability: z.number(),
  kind: z.enum([
    PipelineStageKind.OPEN,
    PipelineStageKind.WON,
    PipelineStageKind.LOST,
  ]),
  legacyKey: z.string().nullable(),
  dealCount: z.number().optional(),
});

export type PipelineStage = z.infer<typeof PipelineStageSchema>;

export const GetPipelineStagesResSchema = z.array(PipelineStageSchema);

export type GetPipelineStagesRes = z.infer<typeof GetPipelineStagesResSchema>;

// ─── Settings form — POST /pipeline-stages, PATCH /pipeline-stages/:id ──────
// Mirrors the backend limits. Validation messages are i18n keys resolved via
// `t('settings.pipelineStages.validation.<key>')`. Open stages may use only
// these colors; green and red are reserved for WON and LOST.
export const OPEN_STAGE_COLORS = [
  "blue",
  "purple",
  "orange",
  "teal",
  "pink",
  "yellow",
  "gray",
  "indigo",
] as const;

export const PIPELINE_STAGE_NAME_MAX = 50;

export const PipelineStageFormSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "nameRequired")
    .max(PIPELINE_STAGE_NAME_MAX, "nameMax"),
  color: z.enum(OPEN_STAGE_COLORS, "colorRequired"),
  probability: z
    .number("probabilityRange")
    .int("probabilityRange")
    .min(0, "probabilityRange")
    .max(99, "probabilityRange"),
});

export type PipelineStageFormValues = z.infer<typeof PipelineStageFormSchema>;

export type CreatePipelineStageBodyType = PipelineStageFormValues;

// Only changed fields; WON/LOST accept only `name`.
export type UpdatePipelineStageBodyType = Partial<PipelineStageFormValues>;

// The full list of open stage ids in the new order.
export type ReorderPipelineStagesBodyType = { stageIds: string[] };
