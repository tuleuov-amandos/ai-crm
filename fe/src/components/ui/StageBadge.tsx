"use client";

import { cn } from "@/lib/utils";
import { getStageColors } from "@/lib/pipelineColors";
import { usePipelineStages, useStageLabel } from "@/hooks/usePipelineStages";

// ── The reusable badge ──────────────────────────────────────────────────────
interface StageBadgeProps {
  /** PipelineStage id of the deal */
  stageId: string | null | undefined;
  /** Legacy deal.stage, used only when stageId is null (an old, unlinked deal) */
  legacyStage?: string | null;
  className?: string;
}

export function StageBadge({ stageId, legacyStage, className }: StageBadgeProps) {
  const { getDealStage, isLoading } = usePipelineStages();
  const label = useStageLabel();

  // Nothing while the stages load; a neutral badge for an unknown stage.
  if (isLoading) return null;
  const stage = getDealStage({ stageId, stage: legacyStage });
  const colors = getStageColors(stage?.color);

  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-0.5 whitespace-nowrap font-medium",
        className
      )}
      style={{ fontSize: 12, background: colors.bg, color: colors.text }}
    >
      {stage ? label(stage) : "—"}
    </span>
  );
}
