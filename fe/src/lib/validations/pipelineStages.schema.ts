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
