import type { PipelineStage } from "@/lib/validations/pipelineStages.schema";

// Names the backend gives the five default stages (be/src/common/pipeline-stages/
// default-pipeline-stages.ts). They are stored in Russian, so while a default
// stage keeps this name it is shown with the localized `dealStages.<legacyKey>`
// label; a renamed or custom stage is shown with its own name.
const DEFAULT_STAGE_NAMES: Record<string, string> = {
  PROSPECT: "Лид",
  QUALIFIED: "Контакт установлен",
  PROPOSAL: "Предложение",
  CLOSED_WON: "Выиграно",
  CLOSED_LOST: "Проиграно",
};

export function stageLabel(
  stage: { name: string; legacyKey?: string | null },
  translateLegacy: (legacyKey: string) => string,
): string {
  const { name, legacyKey } = stage;
  if (
    legacyKey &&
    Object.hasOwn(DEFAULT_STAGE_NAMES, legacyKey) &&
    DEFAULT_STAGE_NAMES[legacyKey] === name
  ) {
    return translateLegacy(legacyKey);
  }
  return name;
}

// The stage of a deal by stageId. Only a deal without stageId (an old deal the
// backend has not linked yet) falls back to its legacy `stage` value, which is
// never trusted otherwise: a deal in a custom stage carries "PROSPECT" there.
export function findDealStage(
  stages: PipelineStage[],
  deal: { stageId?: string | null; stage?: string | null },
): PipelineStage | undefined {
  if (deal.stageId) return stages.find((s) => s.id === deal.stageId);
  if (!deal.stage) return undefined;
  return stages.find((s) => s.legacyKey === deal.stage);
}
